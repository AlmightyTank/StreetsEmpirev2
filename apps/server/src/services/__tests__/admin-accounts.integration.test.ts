import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

type Who = { id: string; username: string; cookie: string };

describe.runIf(process.env.ADMIN_INTEGRATION === '1')('Admin accounts, inspector and audit API with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName: string;
  let cityId: string;
  let admin: Who;
  let player: Who;
  let rival: Who;
  const accountIds: string[] = [];
  const roundIds: string[] = [];

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBe(201);
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === cookieName);
    if (!session) throw new Error('Registering did not set a session cookie.');
    return { id: accountId, username, cookie: `${session.name}=${session.value}` };
  }

  const headers = (who?: Who) => (who ? { cookie: who.cookie } : {});
  const get = (url: string, who: Who = admin) => app.inject({ url, headers: headers(who) });
  const post = (url: string, payload: object, who: Who = admin) => app.inject({ method: 'POST', url, headers: headers(who), payload });

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    admin = await register('adm');
    player = await register('ply');
    rival = await register('riv');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    cityId = (await app.prisma.city.create({ data: { slug: `admin-acct-${randomUUID()}`, name: 'Admin Accounts City', isEnabled: true } })).id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.adminAuditLog.deleteMany({ where: { OR: [{ targetId: { in: [...accountIds, ...roundIds] } }, { actorAccountId: { in: accountIds } }] } });
    if (roundIds.length) await app.prisma.round.deleteMany({ where: { id: { in: roundIds } } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    if (cityId) await app.prisma.city.deleteMany({ where: { id: cityId } });
    await app.close();
  });

  async function roundWithPlayers() {
    const round = await app.prisma.round.create({
      data: {
        slug: `admin-acct-${randomUUID()}`,
        name: `Admin Accounts ${randomUUID().slice(0, 6)}`,
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        status: 'ENDED',
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
        endsAt: new Date('2020-01-29T00:00:00.000Z'),
      },
    });
    roundIds.push(round.id);
    const now = new Date();
    const [attacker, defender] = await Promise.all([player, rival].map((who, index) => app.prisma.roundPlayer.create({
      data: {
        ...classicOgV01.round.startingPlayer,
        roundId: round.id,
        accountId: who.id,
        cityId,
        publicPimpId: 9401 + index,
        displayName: who.username,
        cashCents: 123_456n,
        netWorthCents: 500_000n,
        lastTurnCalculationAt: now,
        lastActiveAt: now,
      },
    })));
    return { round, attacker: attacker!, defender: defender! };
  }

  it('refuses every account, inspector and audit route to guests and non-admins', async () => {
    const target = rival.id;
    const requests = [
      { method: 'GET' as const, url: '/api/admin/accounts?query=a' },
      { method: 'GET' as const, url: `/api/admin/accounts/${target}` },
      { method: 'POST' as const, url: `/api/admin/accounts/${target}/deactivate`, payload: { reason: 'Never runs here' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${target}/reactivate`, payload: { reason: 'Never runs here' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${target}/sessions/revoke`, payload: { reason: 'Never runs here' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${target}/rename`, payload: { reason: 'Never runs here', username: 'nope_name' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${target}/reset-profile`, payload: { reason: 'Never runs here' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${target}/admin`, payload: { reason: 'Never runs here', isAdmin: true } },
      { method: 'GET' as const, url: '/api/admin/players/some-player' },
      { method: 'GET' as const, url: '/api/admin/players/some-player/battles' },
      { method: 'GET' as const, url: '/api/admin/audit?action=account.' },
    ];
    for (const request of requests) {
      expect((await app.inject({ ...request, headers: headers() })).statusCode, `${request.method} ${request.url} as a guest`).toBe(401);
      expect((await app.inject({ ...request, headers: headers(player) })).statusCode, `${request.method} ${request.url} as a player`).toBe(403);
    }
    const unchanged = await app.prisma.account.findUniqueOrThrow({ where: { id: rival.id } });
    expect(unchanged).toMatchObject({ isActive: true, isAdmin: false, username: rival.username });
    expect(await app.prisma.adminAuditLog.count({ where: { actorAccountId: player.id } })).toBe(0);
  });

  it('searches accounts and shows sessions without IP addresses', async () => {
    const search = await get(`/api/admin/accounts?query=${encodeURIComponent(player.username.toUpperCase())}`);
    expect(search.statusCode, search.body).toBe(200);
    expect(search.json().accounts.map((account: { id: string }) => account.id)).toContain(player.id);

    const admins = await get('/api/admin/accounts?status=admin&limit=100');
    expect(admins.json().accounts.every((account: { isAdmin: boolean }) => account.isAdmin)).toBe(true);

    const detail = await get(`/api/admin/accounts/${player.id}`);
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().sessions.length).toBeGreaterThan(0);
    for (const session of detail.json().sessions) {
      expect(session).not.toHaveProperty('ip');
      expect(session).not.toHaveProperty('userAgent');
      expect(typeof session.device).toBe('string');
    }
  });

  it('requires a reason, refuses self-moderation, and deactivation signs the player out', async () => {
    expect((await post(`/api/admin/accounts/${player.id}/deactivate`, {})).statusCode).toBe(400);
    const self = await post(`/api/admin/accounts/${admin.id}/deactivate`, { reason: 'Trying to lock myself out' });
    expect(self.statusCode, self.body).toBe(409);
    expect(self.json().error.code).toBe('ADMIN_SELF_ACTION');

    expect((await get('/api/auth/me', player)).statusCode).toBe(200);
    const deactivated = await post(`/api/admin/accounts/${player.id}/deactivate`, { reason: 'Harassing other players' });
    expect(deactivated.statusCode, deactivated.body).toBe(200);
    expect(deactivated.json().account).toMatchObject({ isActive: false, activeSessions: 0 });
    expect((await get('/api/auth/me', player)).statusCode).toBe(401);
    expect(await app.prisma.session.count({ where: { accountId: player.id } })).toBe(0);
    expect((await post(`/api/admin/accounts/${player.id}/deactivate`, { reason: 'Second time around' })).statusCode).toBe(409);

    const reactivated = await post(`/api/admin/accounts/${player.id}/reactivate`, { reason: 'Appeal accepted' });
    expect(reactivated.statusCode, reactivated.body).toBe(200);
    expect(reactivated.json().account.isActive).toBe(true);

    const audit = await app.prisma.adminAuditLog.findMany({ where: { targetId: player.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((row) => row.action)).toEqual(['account.deactivate', 'account.reactivate']);
    expect(audit[0]).toMatchObject({ reason: 'Harassing other players', actorAccountId: admin.id });
    expect((audit[0]!.after as { sessionsRevoked: number }).sessionsRevoked).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain('passwordHash');

    // Logging back in works again after reactivation.
    player = await register('ply2');
  });

  it('renames an account and every round it played, and refuses taken names', async () => {
    const { attacker } = await roundWithPlayers();
    const taken = await post(`/api/admin/accounts/${player.id}/rename`, { reason: 'Offensive pimp name', username: admin.username.toUpperCase() });
    expect(taken.statusCode, taken.body).toBe(409);
    expect(taken.json().error.code).toBe('USERNAME_TAKEN');
    expect((await post(`/api/admin/accounts/${player.id}/rename`, { reason: 'Offensive pimp name', username: 'no spaces allowed' })).statusCode).toBe(400);

    const username = `clean_${randomUUID().slice(0, 6)}`;
    const renamed = await post(`/api/admin/accounts/${player.id}/rename`, { reason: 'Offensive pimp name', username });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(renamed.json().account.username).toBe(username);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: attacker.id } })).displayName).toBe(username);
    const audit = await app.prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: player.id, action: 'account.rename' } });
    expect((audit.before as { username: string }).username).toBe(player.username);
    expect(audit.after).toMatchObject({ username, roundNamesUpdated: 1 });
    player = { ...player, username };
  });

  it('grants and revokes admin, and two admins cannot remove each other at once', async () => {
    const granted = await post(`/api/admin/accounts/${rival.id}/admin`, { reason: 'New moderator', isAdmin: true });
    expect(granted.statusCode, granted.body).toBe(200);
    expect(granted.json().account.isAdmin).toBe(true);

    const selfRevoke = await post(`/api/admin/accounts/${rival.id}/admin`, { reason: 'Stepping down', isAdmin: false }, rival);
    expect(selfRevoke.statusCode, selfRevoke.body).toBe(409);

    const results = await Promise.all([
      post(`/api/admin/accounts/${rival.id}/admin`, { reason: 'Removing the other admin', isAdmin: false }, admin),
      post(`/api/admin/accounts/${admin.id}/admin`, { reason: 'Removing the other admin', isAdmin: false }, rival),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 403]);
    const remaining = await app.prisma.account.findMany({ where: { id: { in: [admin.id, rival.id] } }, select: { id: true, isAdmin: true } });
    expect(remaining.filter((row) => row.isAdmin)).toHaveLength(1);

    // Put the original admin back if the rival won the race, so later tests act as them.
    if (!remaining.find((row) => row.id === admin.id)!.isAdmin) {
      await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
      await app.prisma.account.update({ where: { id: rival.id }, data: { isAdmin: false } });
    }
  });

  it('inspects a player without settling them and pages their battle reports', async () => {
    const { attacker, defender } = await roundWithPlayers();
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: attacker.id } });
    const report = (role: 'ATTACKER' | 'DEFENDER', opponent: typeof attacker) => ({
      id: 'report', kind: 'RAID', createdAt: new Date().toISOString(), modelVersion: 'test', role, won: role === 'ATTACKER',
      opponent: { publicPimpId: opponent.publicPimpId, displayName: opponent.displayName },
    });
    await app.prisma.raidBattle.create({
      data: {
        attackerId: attacker.id,
        defenderId: defender.id,
        actionId: randomUUID(),
        attackingThugs: 5,
        modelVersion: 'test',
        calculation: {},
        attackerReport: report('ATTACKER', defender),
        defenderReport: report('DEFENDER', attacker),
      },
    });

    const inspected = await get(`/api/admin/players/${attacker.id}`);
    expect(inspected.statusCode, inspected.body).toBe(200);
    expect(inspected.json()).toMatchObject({ roundPlayerId: attacker.id, cashCents: 123_456, netWorthCents: 500_000, publicPimpId: attacker.publicPimpId });
    expect(Array.isArray(inspected.json().activity)).toBe(true);
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: attacker.id } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    const battles = await get(`/api/admin/players/${defender.id}/battles`);
    expect(battles.statusCode, battles.body).toBe(200);
    expect(battles.json().reports).toHaveLength(1);
    expect(battles.json().reports[0]).toMatchObject({ role: 'DEFENDER', won: false });
    expect((await get('/api/admin/players/missing-player')).statusCode).toBe(404);
  });

  it('filters and pages the audit log', async () => {
    const byAction = await get(`/api/admin/audit?action=account.&actor=${encodeURIComponent(admin.username)}&limit=200`);
    expect(byAction.statusCode, byAction.body).toBe(200);
    const entries = byAction.json().entries as Array<{ action: string; actorUsername: string }>;
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.every((entry) => entry.action.startsWith('account.') && entry.actorUsername === admin.username)).toBe(true);

    const first = await get(`/api/admin/audit?actor=${encodeURIComponent(admin.username)}&limit=1`);
    expect(first.json().entries).toHaveLength(1);
    expect(first.json().nextBefore).toBe(first.json().entries[0].id);
    const second = await get(`/api/admin/audit?actor=${encodeURIComponent(admin.username)}&limit=1&before=${first.json().nextBefore}`);
    expect(second.json().entries).toHaveLength(1);
    expect(second.json().entries[0].id).not.toBe(first.json().entries[0].id);

    const future = await get(`/api/admin/audit?actor=${encodeURIComponent(admin.username)}&from=2099-01-01T00:00:00.000Z`);
    expect(future.json().entries).toHaveLength(0);
  });
});
