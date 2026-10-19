import type { Guild, GuildMember, Role } from 'discord.js';
import type { GameApi } from './game-api.js';
import { allianceRoles, isStaffKey, normalizeRoleKey, planRoleChanges, staleAllianceRoleNames, type ManagedRole } from './roles.js';
import type { StaffSyncEvent, StaffSyncMode } from './staff-sync.js';

const REASON = 'StreetsEmpire role sync';
const CHUNK = 1000;

export interface MemberSyncResult {
  /** Role names. */
  added: string[];
  removed: string[];
  failed: boolean;
  /** Staff role changes and differences, for the staff channel. */
  staff: StaffSyncEvent[];
}

export interface SyncSummary {
  members: number;
  added: number;
  removed: number;
  failed: number;
  staff: StaffSyncEvent[];
}

export function summarizeSync(results: MemberSyncResult[], extra: StaffSyncEvent[] = []): SyncSummary {
  return {
    members: results.length,
    added: results.reduce((sum, result) => sum + result.added.length, 0),
    removed: results.reduce((sum, result) => sum + result.removed.length, 0),
    failed: results.filter((result) => result.failed).length,
    staff: [...extra, ...results.flatMap((result) => result.staff)],
  };
}

export class RoleSync {
  private readonly roles = new Map<string, Role>();
  private readonly warned = new Set<string>();
  /** Staff differences already reported, so a ten-minute pass does not repeat them. */
  private readonly reported = new Set<string>();
  /** Staff problems found outside a member, such as a role the bot cannot manage. */
  private pendingStaff: StaffSyncEvent[] = [];
  private running = false;

  constructor(
    private readonly guild: Guild,
    /** Fixed and forum-group roles. Alliance roles are added from the game on every refresh. */
    private readonly managed: ManagedRole[],
    private readonly api: GameApi,
    private readonly options: { allianceRoles?: boolean; staff?: StaffSyncMode } = {},
  ) {}

  private get staffMode(): StaffSyncMode {
    return this.options.staff ?? 'off';
  }

  /**
   * Find each managed role by exact name, creating it if missing. Re-run every full sync in case one was deleted.
   * Alliance roles follow the current round: new alliances get a role, and roles for alliances that disbanded,
   * were renamed or belonged to a finished round are deleted.
   */
  async ensureRoles(): Promise<void> {
    const alliances = this.options.allianceRoles === false ? [] : allianceRoles((await this.api.alliances()).alliances);
    const existing = await this.guild.roles.fetch();
    this.roles.clear();
    if (this.options.allianceRoles !== false) {
      for (const name of staleAllianceRoleNames([...existing.values()].map((role) => role.name), alliances)) {
        for (const role of existing.filter((candidate) => candidate.name === name).values()) {
          if (!role.editable) continue;
          await role.delete(REASON).catch((error: unknown) => console.warn(`Could not delete stale role "${name}":`, error));
        }
      }
    }
    for (const role of [...this.managed, ...alliances]) {
      if (role.id) {
        // Staff roles are made by hand in Discord and found by ID only.
        const byId = existing.get(role.id);
        if (byId) this.roles.set(role.key, byId);
        else this.staffProblem(role, 'missing');
        continue;
      }
      const found = existing.find((candidate) => candidate.name === role.name)
        ?? await this.guild.roles.create({
          name: role.name,
          ...(role.color === null ? {} : { colors: { primaryColor: role.color } }),
          mentionable: false,
          hoist: false,
          reason: REASON,
        });
      this.roles.set(role.key, found);
    }
  }

  /** Full sync. Returns null, without queueing, if one is already running. */
  async syncAll(): Promise<SyncSummary | null> {
    if (this.running) return null;
    this.running = true;
    try {
      await this.ensureRoles();
      const members = await this.guild.members.fetch();
      return summarizeSync(await this.syncMembers([...members.values()]), this.takeStaffProblems());
    } finally {
      this.running = false;
    }
  }

  async syncMember(member: GuildMember): Promise<MemberSyncResult> {
    return (await this.syncMembers([member]))[0] ?? { added: [], removed: [], failed: false, staff: [] };
  }

  /** Problems found since the last call, such as a staff role the bot cannot manage. */
  takeStaffProblems(): StaffSyncEvent[] {
    const problems = this.pendingStaff;
    this.pendingStaff = [];
    return problems;
  }

  async syncMembers(members: GuildMember[]): Promise<MemberSyncResult[]> {
    if (!this.roles.size) await this.ensureRoles();
    const humans = members.filter((member) => !member.user.bot);
    const results: MemberSyncResult[] = [];
    for (let start = 0; start < humans.length; start += CHUNK) {
      const chunk = humans.slice(start, start + CHUNK);
      const { members: keysById } = await this.api.roles(chunk.map((member) => member.id));
      // An alliance founded since the last full sync has no role yet.
      const unknownAlliance = this.options.allianceRoles !== false
        && Object.values(keysById).flat().some((key) => key.startsWith('alliance:') && !this.roles.has(key));
      if (unknownAlliance) await this.ensureRoles();
      for (const member of chunk) {
        // Missing from the response = not linked (or deactivated): remove every managed role.
        results.push(await this.applyMember(member, new Set((keysById[member.id] ?? []).map(normalizeRoleKey))));
      }
    }
    return results;
  }

  private async applyMember(member: GuildMember, desired: ReadonlySet<string>): Promise<MemberSyncResult> {
    const current = new Set([...this.roles].filter(([, role]) => member.roles.cache.has(role.id)).map(([key]) => key));
    const keys = [...this.roles.keys()];
    // Staff roles in report mode, and the Founder role always, are compared but never changed.
    const watchOnly = (key: string) => isStaffKey(key) && (this.staffMode === 'report' || Boolean(this.managedRole(key)?.checkOnly));
    const { add, remove } = planRoleChanges(keys.filter((key) => !watchOnly(key)), current, desired);
    const differences = planRoleChanges(keys.filter(watchOnly), current, desired);
    const staff = this.reportDifferences(member, differences);
    const addRoles = this.editable(add);
    const removeRoles = this.editable(remove);
    try {
      if (addRoles.length) await member.roles.add(addRoles, REASON);
      if (removeRoles.length) await member.roles.remove(removeRoles, REASON);
      staff.push(
        ...this.staffEvents(member, add.filter((key) => addRoles.includes(this.roles.get(key)!)), 'added'),
        ...this.staffEvents(member, remove.filter((key) => removeRoles.includes(this.roles.get(key)!)), 'removed'),
      );
      return { added: addRoles.map((role) => role.name), removed: removeRoles.map((role) => role.name), failed: false, staff };
    } catch (error) {
      console.warn(`Role sync failed for member ${member.id}:`, error);
      return { added: [], removed: [], failed: true, staff };
    }
  }

  private managedRole(key: string): ManagedRole | undefined {
    return this.managed.find((role) => role.key === key);
  }

  private staffEvents(member: GuildMember, keys: string[], action: StaffSyncEvent['action']): StaffSyncEvent[] {
    return keys.filter(isStaffKey).map((key) => ({
      memberId: member.id,
      role: this.managedRole(key)?.name ?? key,
      action,
      checkOnly: Boolean(this.managedRole(key)?.checkOnly),
    }));
  }

  /** Each difference once, until it is fixed or changes; a fixed one may be reported again later. */
  private reportDifferences(member: GuildMember, differences: { add: string[]; remove: string[] }): StaffSyncEvent[] {
    const now = [...this.staffEvents(member, differences.add, 'missing-role'), ...this.staffEvents(member, differences.remove, 'extra-role')];
    const ids = new Set(now.map((event) => `${member.id}|${event.role}|${event.action}`));
    for (const id of this.reported) if (id.startsWith(`${member.id}|`) && !ids.has(id)) this.reported.delete(id);
    return now.filter((event) => {
      const id = `${member.id}|${event.role}|${event.action}`;
      if (this.reported.has(id)) return false;
      this.reported.add(id);
      return true;
    });
  }

  private staffProblem(role: ManagedRole, action: 'missing' | 'blocked'): void {
    const id = `${role.id ?? role.key}|${action}`;
    if (this.warned.has(id)) return;
    this.warned.add(id);
    console.warn(action === 'missing'
      ? `Staff role ${role.name} (${role.id}) is not in this server. Check DISCORD_STAFF_ROLE_IDS.`
      : `Cannot manage staff role "${role.name}". In Server Settings → Roles, drag the bot's role above it.`);
    this.pendingStaff.push({ memberId: null, role: role.name, action, checkOnly: Boolean(role.checkOnly) });
  }

  private editable(keys: string[]): Role[] {
    return keys.map((key) => [key, this.roles.get(key)!] as const).filter(([key, role]) => {
      if (role.editable) return true;
      const staffRole = isStaffKey(key) ? this.managedRole(key) : undefined;
      if (staffRole) this.staffProblem(staffRole, 'blocked');
      else if (!this.warned.has(role.id)) {
        this.warned.add(role.id);
        console.warn(`Cannot manage role "${role.name}". In Server Settings → Roles, drag the bot's role above it.`);
      }
      return false;
    }).map(([, role]) => role);
  }
}
