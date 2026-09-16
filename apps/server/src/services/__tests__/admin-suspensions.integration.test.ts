import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

type Who = { id: string; username: string; password: string; cookie: string };

/**
 * Suspensions and the player lookup. Rounds here sit in REGISTRATION so no
 * parallel current-round lookup can close them as superseded.
 */
describe.runIf(process.env.ADMIN_INTEGRATION === '1')('Admin suspensions and player search with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName: string;
  let cityId: string;
  let admin: Who;
  let player: Who;
  let other: Who;
  const accountIds: string[] = [];
  const roundIds: string[] = [];

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const password = `Pw-${randomUUID()}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password } });
    expect(response.statusCode, response.body).toBe(201);
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === cookieName);
    if (!session) throw new Error('Registering did not set a session cookie.');
    return { id: accountId, username, password, cookie: `${session.name}=${session.value}` };
  }

  const headers = (who?: Who) => (who ? { cookie: who.cookie } : {});
  const get = (url: string, who: Who = admin) => app.inject({ url, headers: headers(who) });
  const post = (url: string, payload: object, who: Who = admin) => app.inject({ method: 'POST', url, headers: headers(who), payload });
  const login = (who: Who) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: who.username, password: who.password } });

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    admin = await register('sadm');
    player = await register('splay');
    other = await register('soth');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    cityId = (await app.prisma.city.create({ data: { slug: `admin-susp-${randomUUID()}`, name: 'Suspension City', isEnabled: true } })).id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.adminAuditLog.deleteMany({ where: { OR: [{ targetId: { in: [...accountIds, ...roundIds] } }, { actorAccountId: { in: accountIds } }] } });
    if (roundIds.length) await app.prisma.round.deleteMany({ where: { id: { in: roundIds } } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    if (cityId) await app.prisma.city.deleteMany({ where: { id: cityId } });
    await app.close();
  });

  async function roundWith(who: Who, displayName: string, publicPimpId: number) {
    const round = await app.prisma.round.create({
      data: {
        slug: `admin-susp-${randomUUID()}`,
        name: `Suspension Round ${randomUUID().slice(0, 6)}`,
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        status: 'REGISTRATION',
        startsAt: new Date(Date.now() + 60 * 60_000),
        endsAt: new Date(Date.now() + 28 * 24 * 60 * 60_000),
      },
    });
    roundIds.push(round.id);
    const now = new Date();
    const roundPlayer = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV01.round.startingPlayer,
        roundId: round.id,
        accountId: who.id,
        cityId,
        publicPimpId,
        displayName,
        cashCents: 200_000n,
        netWorthCents: 750_000n,
        lastTurnCalculationAt: now,
        lastActiveAt: now,
      },
    });
    return { round, roundPlayer };
  }

  it('refuses the suspension and player search routes to guests and non-admins', async () => {
    const requests = [
      { method: 'GET' as const, url: '/api/admin/players?query=nobody' },
      { method: 'POST' as const, url: `/api/admin/accounts/${other.id}/suspend`, payload: { reason: 'Never runs here', length: '7d' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${other.id}/suspend/lift`, payload: { reason: 'Never runs here' } },
    ];
    for (const request of requests) {
      expect((await app.inject({ ...request, headers: headers() })).statusCode, `${request.url} as a guest`).toBe(401);
      expect((await app.inject({ ...request, headers: headers(player) })).statusCode, `${request.url} as a player`).toBe(403);
    }
    expect(await app.prisma.account.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ suspendedUntil: null });
  });

  it('suspends with an end date, signs them out, tells them why at login, and lifts on request', async () => {
    expect((await post(`/api/admin/accounts/${player.id}/suspend`, { length: '7d' })).statusCode).toBe(400);
    expect((await post(`/api/admin/accounts/${player.id}/suspend`, { reason: 'Cooling off after a slur', length: '99d' })).statusCode).toBe(400);
    expect((await get('/api/auth/me', player)).statusCode).toBe(200);

    const suspended = await post(`/api/admin/accounts/${player.id}/suspend`, { reason: 'Cooling off after a slur', length: '7d' });
    expect(suspended.statusCode, suspended.body).toBe(200);
    expect(suspended.json().account.suspension).toMatchObject({ reason: 'Cooling off after a slur', byUsername: admin.username });
    expect(suspended.json().account.activeSessions).toBe(0);

    // Signed out now, and told the reason and the date when they try to come back.
    expect((await get('/api/auth/me', player)).statusCode).toBe(401);
    const refused = await login(player);
    expect(refused.statusCode, refused.body).toBe(403);
    expect(refused.json().error.code).toBe('ACCOUNT_SUSPENDED');
    expect(refused.json().error.message).toContain('Cooling off after a slur');
    expect(refused.json().error.message).toMatch(/suspended until .+UTC/);

    const stored = await app.prisma.account.findUniqueOrThrow({ where: { id: player.id } });
    const days = (stored.suspendedUntil!.getTime() - Date.now()) / (24 * 60 * 60_000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    const audit = await get(`/api/admin/audit?targetId=${player.id}&action=account.suspend`);
    expect(audit.json().entries[0]).toMatchObject({ action: 'account.suspend', actorUsername: admin.username, reason: 'Cooling off after a slur' });

    const lifted = await post(`/api/admin/accounts/${player.id}/suspend/lift`, { reason: 'Appeal accepted, warning given' });
    expect(lifted.statusCode, lifted.body).toBe(200);
    expect(lifted.json().account.suspension).toBeNull();
    expect((await post(`/api/admin/accounts/${player.id}/suspend/lift`, { reason: 'Nothing left to lift' })).json().error.code).toBe('NOT_SUSPENDED');

    const back = await login(player);
    expect(back.statusCode, back.body).toBe(200);
    player.cookie = `${cookieName}=${back.cookies.find((cookie) => cookie.name === cookieName)!.value}`;
  });

  it('lets a suspension that has run out clear itself on the next sign-in', async () => {
    await app.prisma.account.update({
      where: { id: other.id },
      data: { suspendedUntil: new Date(Date.now() - 60_000), suspendedReason: 'Served already', suspendedByUsername: admin.username },
    });

    const back = await login(other);
    expect(back.statusCode, back.body).toBe(200);
    expect(await app.prisma.account.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
      suspendedUntil: null,
      suspendedReason: null,
      suspendedByUsername: null,
    });
    expect((await get(`/api/admin/accounts/${other.id}`)).json().account.suspension).toBeNull();
  });

  it('refuses to suspend an admin or a deactivated account', async () => {
    const onAdmin = await post(`/api/admin/accounts/${admin.id}/suspend`, { reason: 'Trying to suspend myself', length: '1d' });
    expect(onAdmin.statusCode, onAdmin.body).toBe(409);
    expect(onAdmin.json().error.code).toBe('ADMIN_SELF_ACTION');

    await post(`/api/admin/accounts/${other.id}/admin`, { reason: 'Temporary admin for this test', isAdmin: true });
    const otherAdmin = await post(`/api/admin/accounts/${other.id}/suspend`, { reason: 'Admins are not suspended', length: '1d' });
    expect(otherAdmin.statusCode, otherAdmin.body).toBe(409);
    expect(otherAdmin.json().error.code).toBe('ADMIN_SUSPENSION');
    await post(`/api/admin/accounts/${other.id}/admin`, { reason: 'Test finished with the role', isAdmin: false });

    await post(`/api/admin/accounts/${other.id}/deactivate`, { reason: 'Shut down for this test' });
    const inactive = await post(`/api/admin/accounts/${other.id}/suspend`, { reason: 'Already kept out', length: '1d' });
    expect(inactive.statusCode, inactive.body).toBe(409);
    expect(inactive.json().error.code).toBe('ACCOUNT_INACTIVE');
    await post(`/api/admin/accounts/${other.id}/reactivate`, { reason: 'Test finished' });
  });

  it('finds a player by pimp name or public id without knowing the account', async () => {
    const { roundPlayer } = await roundWith(player, `Silk_${randomUUID().slice(0, 6)}`, 9611);

    const byName = await get(`/api/admin/players?query=${encodeURIComponent(roundPlayer.displayName.toUpperCase())}`);
    expect(byName.statusCode, byName.body).toBe(200);
    expect(byName.json().players[0]).toMatchObject({
      roundPlayerId: roundPlayer.id,
      publicPimpId: 9611,
      city: 'Suspension City',
      account: { id: player.id, username: player.username, isActive: true, suspended: false },
    });

    const byId = await get('/api/admin/players?query=%239611');
    expect(byId.json().players.map((row: { roundPlayerId: string }) => row.roundPlayerId)).toContain(roundPlayer.id);

    expect((await get('/api/admin/players?query=')).statusCode).toBe(400);
    expect((await get(`/api/admin/players?query=${encodeURIComponent(`nobody_${randomUUID()}`)}`)).json().players).toEqual([]);

    // A suspended account is flagged on the row, so a dispute shows its own history.
    await post(`/api/admin/accounts/${player.id}/suspend`, { reason: 'Flagged while a dispute is open', length: '1d' });
    const flagged = await get(`/api/admin/players?query=${encodeURIComponent(roundPlayer.displayName)}`);
    expect(flagged.json().players[0].account).toMatchObject({ suspended: true });
    await post(`/api/admin/accounts/${player.id}/suspend/lift`, { reason: 'Dispute closed' });
  });
});
