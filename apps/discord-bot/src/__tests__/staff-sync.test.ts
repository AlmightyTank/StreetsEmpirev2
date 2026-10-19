import { Collection } from 'discord.js';
import type { Guild, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { GameApi } from '../game-api.js';
import { managedRoles, staffRoles, withoutStaffForumGroups } from '../roles.js';
import { staffSyncMessages, type StaffSyncEvent } from '../staff-sync.js';
import { RoleSync } from '../sync.js';

const IDS = { founder: '100000000000000001', admin: '100000000000000002', mod: '100000000000000003', jrMod: '100000000000000004', helper: '100000000000000005' };
const CSV = `founder:${IDS.founder},admin:${IDS.admin},mod:${IDS.mod},jr-mod:${IDS.jrMod},helper:${IDS.helper}`;

describe('staffRoles', () => {
  it('reads role IDs in rank order and keeps the Founder check-only', () => {
    const { roles, problems } = staffRoles(` helper:${IDS.helper}, Admin:${IDS.admin},founder:${IDS.founder} `);
    expect(problems).toEqual([]);
    expect(roles).toEqual([
      { key: 'staff:founder', name: 'Founder', color: null, id: IDS.founder, checkOnly: true },
      { key: 'staff:admin', name: 'Admin', color: null, id: IDS.admin },
      { key: 'staff:helper', name: 'Helper', color: null, id: IDS.helper },
    ]);
  });

  it('names every bad entry and skips it', () => {
    const { roles, problems } = staffRoles(`boss:${IDS.mod},mod:12,jr-mod:${IDS.admin},admin:${IDS.admin}`);
    expect(roles.map((role) => role.key)).toEqual(['staff:jr-mod']);
    expect(problems).toHaveLength(3);
    expect(staffRoles('').roles).toEqual([]);
  });
});

describe('withoutStaffForumGroups', () => {
  it('drops forum groups named like a staff role, whatever the case', () => {
    expect(withoutStaffForumGroups(['Admin', 'mod', 'Beta Testers', 'JR Mod'])).toEqual(['Beta Testers']);
  });
});

describe('staffSyncMessages', () => {
  it('says what changed, never pings, and splits long reports', () => {
    const event = (action: StaffSyncEvent['action'], checkOnly = false): StaffSyncEvent => ({ memberId: '200000000000000001', role: 'Mod', action, checkOnly });
    const [message] = staffSyncMessages([event('added'), event('extra-role'), event('missing-role', true), { ...event('blocked'), memberId: null }], 'report');
    expect(message).toContain('report mode');
    expect(message).toContain('✅ Gave <@200000000000000001> **Mod**');
    expect(message).toContain('has **Mod** on Discord but not in the game. Not changed: report mode.');
    expect(message).toContain('fix it by hand');
    expect(message).toContain("drag the bot's role above it");
    expect(staffSyncMessages([], 'enforce')).toEqual([]);
    const many = staffSyncMessages(Array.from({ length: 60 }, () => event('added')), 'enforce');
    expect(many.length).toBeGreaterThan(1);
    expect(many.every((text) => text.length <= 1900 && text.startsWith('**Staff role sync**'))).toBe(true);
  });
});

/** A server with the staff roles, and members whose Discord roles are tracked in a Set. */
function server(options: { blocked?: string[]; missing?: string[] } = {}) {
  const roles = new Collection<string, { id: string; name: string; editable: boolean }>();
  for (const [index, role] of managedRoles([]).entries()) roles.set(`9${index}`.padEnd(18, '0'), { id: `9${index}`.padEnd(18, '0'), name: role.name, editable: true });
  for (const [name, id] of Object.entries(IDS)) {
    if (options.missing?.includes(id)) continue;
    // The Founder role sits above the bot, as it does in a real server.
    roles.set(id, { id, name: `${name} role`, editable: name !== 'founder' && !options.blocked?.includes(id) });
  }
  const guild = { roles: { fetch: async () => roles, create: vi.fn() }, members: { fetch: async () => new Collection() } } as unknown as Guild;
  const member = (id: string, held: string[]) => {
    const cache = new Set(held);
    const add = vi.fn(async (list: Array<{ id: string }>) => { for (const role of list) cache.add(role.id); });
    const remove = vi.fn(async (list: Array<{ id: string }>) => { for (const role of list) cache.delete(role.id); });
    return { id, user: { bot: false }, roles: { cache, add, remove } } as unknown as GuildMember & { roles: { add: typeof add; remove: typeof remove; cache: Set<string> } };
  };
  return { guild, member };
}

function api(keys: Record<string, string[]>): GameApi {
  return { roles: async () => ({ members: keys }), alliances: async () => ({ alliances: [] }) } as unknown as GameApi;
}

const managed = [...managedRoles([]), ...staffRoles(CSV).roles];

describe('RoleSync with staff roles', () => {
  it('enforce: makes Discord match the game role and says so', async () => {
    const { guild, member } = server();
    const mod = member('300000000000000001', [IDS.admin]);
    const sync = new RoleSync(guild, managed, api({ [mod.id]: ['linked', 'staff:mod'] }), { staff: 'enforce' });
    const [result] = await sync.syncMembers([mod]);
    expect(mod.roles.cache.has(IDS.mod)).toBe(true);
    expect(mod.roles.cache.has(IDS.admin)).toBe(false);
    expect(result!.staff).toEqual([
      { memberId: mod.id, role: 'Mod', action: 'added', checkOnly: false },
      { memberId: mod.id, role: 'Admin', action: 'removed', checkOnly: false },
    ]);
  });

  it('report: changes no staff role and reports each difference once', async () => {
    const { guild, member } = server();
    const mod = member('300000000000000002', [IDS.admin]);
    const sync = new RoleSync(guild, managed, api({ [mod.id]: ['linked', 'staff:mod'] }), { staff: 'report' });
    const [first] = await sync.syncMembers([mod]);
    expect(mod.roles.cache.has(IDS.admin)).toBe(true);
    expect(mod.roles.cache.has(IDS.mod)).toBe(false);
    expect(first!.staff.map((event) => `${event.role}:${event.action}`)).toEqual(['Mod:missing-role', 'Admin:extra-role']);
    // Other roles still sync in report mode.
    expect(first!.added).toEqual(['Linked']);
    const [again] = await sync.syncMembers([mod]);
    expect(again!.staff).toEqual([]);
  });

  it('never assigns the Founder role, only reports it', async () => {
    const { guild, member } = server();
    const owner = member('300000000000000003', []);
    const stray = member('300000000000000004', [IDS.founder]);
    const sync = new RoleSync(guild, managed, api({ [owner.id]: ['linked', 'staff:founder'], [stray.id]: ['linked'] }), { staff: 'enforce' });
    const results = await sync.syncMembers([owner, stray]);
    expect(owner.roles.cache.has(IDS.founder)).toBe(false);
    expect(stray.roles.cache.has(IDS.founder)).toBe(true);
    expect(results.flatMap((result) => result.staff)).toEqual([
      { memberId: owner.id, role: 'Founder', action: 'missing-role', checkOnly: true },
      { memberId: stray.id, role: 'Founder', action: 'extra-role', checkOnly: true },
    ]);
  });

  it('reports a role it cannot find or cannot manage, once', async () => {
    const { guild, member } = server({ missing: [IDS.helper], blocked: [IDS.admin] });
    const admin = member('300000000000000005', []);
    const sync = new RoleSync(guild, managed, api({ [admin.id]: ['linked', 'staff:admin'] }), { staff: 'enforce' });
    await sync.syncMembers([admin]);
    expect(admin.roles.cache.has(IDS.admin)).toBe(false);
    expect(sync.takeStaffProblems().map((event) => `${event.role}:${event.action}`)).toEqual(['Helper:missing', 'Admin:blocked']);
    await sync.syncMembers([admin]);
    expect(sync.takeStaffProblems()).toEqual([]);
  });

  it('never creates a staff role by name', async () => {
    const { guild } = server({ missing: Object.values(IDS) });
    await new RoleSync(guild, managed, api({}), { staff: 'enforce' }).ensureRoles();
    const created = (guild.roles.create as ReturnType<typeof vi.fn>).mock.calls.map(([input]) => (input as { name: string }).name);
    expect(created.filter((name) => ['Founder', 'Admin', 'Mod', 'JR Mod', 'Helper'].includes(name))).toEqual([]);
  });
});
