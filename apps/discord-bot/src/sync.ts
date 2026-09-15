import type { Guild, GuildMember, Role } from 'discord.js';
import type { GameApi } from './game-api.js';
import { normalizeRoleKey, planRoleChanges, type ManagedRole } from './roles.js';

const REASON = 'StreetsEmpire role sync';
const CHUNK = 1000;

export interface MemberSyncResult {
  /** Role names. */
  added: string[];
  removed: string[];
  failed: boolean;
}

export interface SyncSummary {
  members: number;
  added: number;
  removed: number;
  failed: number;
}

export function summarizeSync(results: MemberSyncResult[]): SyncSummary {
  return {
    members: results.length,
    added: results.reduce((sum, result) => sum + result.added.length, 0),
    removed: results.reduce((sum, result) => sum + result.removed.length, 0),
    failed: results.filter((result) => result.failed).length,
  };
}

export class RoleSync {
  private readonly roles = new Map<string, Role>();
  private readonly warned = new Set<string>();
  private running = false;

  constructor(
    private readonly guild: Guild,
    private readonly managed: ManagedRole[],
    private readonly api: GameApi,
  ) {}

  /** Find each managed role by exact name, creating it if missing. Re-run every full sync in case one was deleted. */
  async ensureRoles(): Promise<void> {
    const existing = await this.guild.roles.fetch();
    this.roles.clear();
    for (const role of this.managed) {
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
      return summarizeSync(await this.syncMembers([...members.values()]));
    } finally {
      this.running = false;
    }
  }

  async syncMember(member: GuildMember): Promise<MemberSyncResult> {
    return (await this.syncMembers([member]))[0] ?? { added: [], removed: [], failed: false };
  }

  async syncMembers(members: GuildMember[]): Promise<MemberSyncResult[]> {
    if (!this.roles.size) await this.ensureRoles();
    const humans = members.filter((member) => !member.user.bot);
    const results: MemberSyncResult[] = [];
    for (let start = 0; start < humans.length; start += CHUNK) {
      const chunk = humans.slice(start, start + CHUNK);
      const { members: keysById } = await this.api.roles(chunk.map((member) => member.id));
      for (const member of chunk) {
        // Missing from the response = not linked (or deactivated): remove every managed role.
        results.push(await this.applyMember(member, new Set((keysById[member.id] ?? []).map(normalizeRoleKey))));
      }
    }
    return results;
  }

  private async applyMember(member: GuildMember, desired: ReadonlySet<string>): Promise<MemberSyncResult> {
    const current = new Set([...this.roles].filter(([, role]) => member.roles.cache.has(role.id)).map(([key]) => key));
    const { add, remove } = planRoleChanges([...this.roles.keys()], current, desired);
    const addRoles = this.editable(add);
    const removeRoles = this.editable(remove);
    try {
      if (addRoles.length) await member.roles.add(addRoles, REASON);
      if (removeRoles.length) await member.roles.remove(removeRoles, REASON);
      return { added: addRoles.map((role) => role.name), removed: removeRoles.map((role) => role.name), failed: false };
    } catch (error) {
      console.warn(`Role sync failed for member ${member.id}:`, error);
      return { added: [], removed: [], failed: true };
    }
  }

  private editable(keys: string[]): Role[] {
    return keys.map((key) => this.roles.get(key)!).filter((role) => {
      if (role.editable) return true;
      if (!this.warned.has(role.id)) {
        this.warned.add(role.id);
        console.warn(`Cannot manage role "${role.name}". In Server Settings → Roles, drag the bot's role above it.`);
      }
      return false;
    });
  }
}
