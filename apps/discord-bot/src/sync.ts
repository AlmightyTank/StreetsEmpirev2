import type { Guild, GuildMember, Role } from 'discord.js';
import type { GameApi } from './game-api.js';
import { normalizeRoleKey, planRoleChanges, type ManagedRole } from './roles.js';

const REASON = 'Street Empire role sync';
const CHUNK = 1000;

export class RoleSync {
  private readonly roles = new Map<string, Role>();
  private readonly warned = new Set<string>();
  private running = false;

  constructor(
    private readonly guild: Guild,
    private readonly managed: ManagedRole[],
    private readonly api: GameApi,
  ) {}

  /** Find each managed role by exact name, creating it if missing. Re-run every sync in case one was deleted. */
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

  /** Full sync; overlapping runs are skipped rather than queued. */
  async syncAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ensureRoles();
      const members = await this.guild.members.fetch();
      await this.syncMembers([...members.values()]);
    } finally {
      this.running = false;
    }
  }

  async syncMembers(members: GuildMember[]): Promise<void> {
    if (!this.roles.size) await this.ensureRoles();
    const humans = members.filter((member) => !member.user.bot);
    for (let start = 0; start < humans.length; start += CHUNK) {
      const chunk = humans.slice(start, start + CHUNK);
      const { members: keysById } = await this.api.roles(chunk.map((member) => member.id));
      for (const member of chunk) {
        // Missing from the response = not linked (or deactivated): remove every managed role.
        await this.applyMember(member, new Set((keysById[member.id] ?? []).map(normalizeRoleKey)));
      }
    }
  }

  private async applyMember(member: GuildMember, desired: ReadonlySet<string>): Promise<void> {
    const current = new Set([...this.roles].filter(([, role]) => member.roles.cache.has(role.id)).map(([key]) => key));
    const { add, remove } = planRoleChanges([...this.roles.keys()], current, desired);
    const add_ = this.editable(add);
    const remove_ = this.editable(remove);
    try {
      if (add_.length) await member.roles.add(add_, REASON);
      if (remove_.length) await member.roles.remove(remove_, REASON);
    } catch (error) {
      console.warn(`Role sync failed for member ${member.id}:`, error);
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
