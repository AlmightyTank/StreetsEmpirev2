import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

type Who = { id: string; username: string; cookie: string };

describe.runIf(process.env.ADMIN_INTEGRATION === '1')('Admin API with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName: string;
  let cityId: string;
  let admin: Who;
  let player: Who;
  const accountIds: string[] = [];
  const roundIds: string[] = [];

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBe(201);
    const id = response.json().account.id as string;
    accountIds.push(id);
    const session = response.cookies.find((cookie) => cookie.name === cookieName);
    if (!session) throw new Error('Registering did not set a session cookie.');
    return { id, username, cookie: `${session.name}=${session.value}` };
  }

  async function createRound(data: { status: 'SCHEDULED' | 'REGISTRATION' | 'ACTIVE'; startsAt: Date; endsAt: Date }) {
    const round = await app.prisma.round.create({
      data: {
        slug: `admin-test-${randomUUID()}`,
        name: `Admin Test ${randomUUID().slice(0, 6)}`,
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        ...data,
      },
    });
    roundIds.push(round.id);
    return round;
  }

  const headers = (who?: Who) => (who ? { cookie: who.cookie } : {});
  const post = (url: string, payload?: object) => app.inject({ method: 'POST', url, headers: headers(admin), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    admin = await register('adm');
    player = await register('ply');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    const city = await app.prisma.city.create({ data: { slug: `admin-test-${randomUUID()}`, name: 'Admin Test City', isEnabled: true } });
    cityId = city.id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.adminAuditLog.deleteMany({ where: { OR: [{ targetId: { in: roundIds } }, { actorAccountId: { in: accountIds } }] } });
    if (roundIds.length) await app.prisma.round.deleteMany({ where: { id: { in: roundIds } } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    if (cityId) await app.prisma.city.deleteMany({ where: { id: cityId } });
    await app.close();
  });

  it('refuses every admin route to guests and non-admins, and changes nothing', async () => {
    const round = await createRound({ status: 'SCHEDULED', startsAt: new Date('2099-01-01T00:00:00.000Z'), endsAt: new Date('2099-01-29T00:00:00.000Z') });
    const name = `Refused ${randomUUID().slice(0, 6)}`;
    const requests = [
      { method: 'GET' as const, url: '/api/admin/rounds' },
      { method: 'POST' as const, url: '/api/admin/rounds', payload: { name, rulesetId: classicOgV01.meta.id, startsAt: '2099-02-01T00:00:00.000Z' } },
      { method: 'POST' as const, url: `/api/admin/rounds/${round.id}/open-registration` },
      { method: 'POST' as const, url: `/api/admin/rounds/${round.id}/start`, payload: { confirmHandoff: true } },
      { method: 'POST' as const, url: `/api/admin/rounds/${round.id}/end-early`, payload: { reason: 'This should never run' } },
      { method: 'POST' as const, url: `/api/admin/rounds/${round.id}/archive` },
      { method: 'GET' as const, url: '/api/admin/audit' },
    ];

    for (const request of requests) {
      expect((await app.inject({ ...request, headers: headers() })).statusCode, `${request.method} ${request.url} as a guest`).toBe(401);
      expect((await app.inject({ ...request, headers: headers(player) })).statusCode, `${request.method} ${request.url} as a player`).toBe(403);
    }

    expect((await app.prisma.round.findUniqueOrThrow({ where: { id: round.id } })).status).toBe('SCHEDULED');
    expect(await app.prisma.round.count({ where: { name } })).toBe(0);
    expect(await app.prisma.adminAuditLog.count({ where: { OR: [{ targetId: round.id }, { actorAccountId: player.id }] } })).toBe(0);
  });

  it('schedules, opens, ends early and archives a round with an audit record for each step', async () => {
    expect((await post('/api/admin/rounds', { name: 'Bad ruleset round', rulesetId: 'nope', startsAt: '2099-03-01T00:00:00.000Z' })).statusCode).toBe(400);

    const scheduled = await post('/api/admin/rounds', { name: `Admin Lifecycle ${randomUUID().slice(0, 6)}`, rulesetId: classicOgV01.meta.id, startsAt: '2099-03-01T00:00:00.000Z' });
    expect(scheduled.statusCode, scheduled.body).toBe(201);
    const roundId = scheduled.json().round.id as string;
    roundIds.push(roundId);
    expect(scheduled.json().round).toMatchObject({ status: 'SCHEDULED', rulesetId: classicOgV01.meta.id, actions: ['open-registration', 'start'] });
    expect(Date.parse(scheduled.json().round.endsAt) - Date.parse('2099-03-01T00:00:00.000Z')).toBe(classicOgV01.round.defaultDurationDays * 86_400_000);

    const opened = await post(`/api/admin/rounds/${roundId}/open-registration`);
    expect(opened.statusCode, opened.body).toBe(200);
    expect(opened.json().round.status).toBe('REGISTRATION');

    expect((await post(`/api/admin/rounds/${roundId}/end-early`, {})).statusCode).toBe(400);
    const ended = await post(`/api/admin/rounds/${roundId}/end-early`, { reason: 'Lifecycle test wrap-up' });
    expect(ended.statusCode, ended.body).toBe(200);
    expect(ended.json().round.status).toBe('ENDED');

    expect((await post(`/api/admin/rounds/${roundId}/open-registration`)).statusCode).toBe(409);
    const archived = await post(`/api/admin/rounds/${roundId}/archive`);
    expect(archived.statusCode, archived.body).toBe(200);
    expect(archived.json().round).toMatchObject({ status: 'ARCHIVED', actions: [] });

    const audit = await app.inject({ url: `/api/admin/audit?targetType=round&targetId=${roundId}`, headers: headers(admin) });
    expect(audit.statusCode, audit.body).toBe(200);
    type Entry = { action: string; actorUsername: string; actorAccountId: string; reason: string | null; before: { status: string } | null; after: { status: string } };
    const entries = audit.json().entries as Entry[];
    const byAction = Object.fromEntries(entries.map((entry) => [entry.action, entry]));
    expect(Object.keys(byAction).sort()).toEqual(['round.archive', 'round.end-early', 'round.open-registration', 'round.schedule']);
    expect(entries.every((entry) => entry.actorUsername === admin.username && entry.actorAccountId === admin.id)).toBe(true);
    expect(byAction['round.schedule']).toMatchObject({ before: null, after: { status: 'SCHEDULED' } });
    expect(byAction['round.open-registration']).toMatchObject({ before: { status: 'SCHEDULED' }, after: { status: 'REGISTRATION' } });
    expect(byAction['round.end-early']).toMatchObject({ reason: 'Lifecycle test wrap-up', before: { status: 'REGISTRATION' }, after: { status: 'ENDED' } });
    expect(byAction['round.archive']).toMatchObject({ before: { status: 'ENDED' }, after: { status: 'ARCHIVED' } });
  });

  it('ends an active round early exactly once and freezes final standings', async () => {
    const round = await createRound({ status: 'ACTIVE', startsAt: new Date('2020-01-01T00:00:00.000Z'), endsAt: new Date(Date.now() + 7 * 86_400_000) });
    const lastTick = new Date(Date.now() - 60_000);
    await app.prisma.roundPlayer.createMany({
      data: [admin, player].map((who, index) => ({
        ...classicOgV01.round.startingPlayer,
        roundId: round.id,
        accountId: who.id,
        cityId,
        publicPimpId: 9301 + index,
        displayName: who.username,
        cashCents: BigInt(1_000_000 - index * 500_000),
        netWorthCents: 1n,
        localRank: null,
        nationalRank: null,
        lastTurnCalculationAt: lastTick,
        lastActiveAt: lastTick,
      })),
    });

    const reason = 'Broken economy, ending for a restart';
    const results = await Promise.all([0, 1].map(() => post(`/api/admin/rounds/${round.id}/end-early`, { reason })));
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);

    const ended = await app.prisma.round.findUniqueOrThrow({ where: { id: round.id } });
    expect(ended.status).toBe('ENDED');
    expect(ended.endsAt.getTime()).toBeLessThanOrEqual(Date.now());
    const players = await app.prisma.roundPlayer.findMany({ where: { roundId: round.id }, orderBy: { publicPimpId: 'asc' } });
    expect(players.map((row) => row.nationalRank)).toEqual([1, 2]);

    const audits = await app.prisma.adminAuditLog.findMany({ where: { targetId: round.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'round.end-early', reason, actorAccountId: admin.id });
    expect((audits[0]!.before as { status: string }).status).toBe('ACTIVE');
  });

  it('refuses to start a round that a later live round would close straight away', async () => {
    await createRound({ status: 'ACTIVE', startsAt: new Date('2021-01-01T00:00:00.000Z'), endsAt: new Date(Date.now() + 7 * 86_400_000) });
    const older = await createRound({ status: 'SCHEDULED', startsAt: new Date('2020-06-01T00:00:00.000Z'), endsAt: new Date(Date.now() + 7 * 86_400_000) });

    const response = await post(`/api/admin/rounds/${older.id}/start`, { confirmHandoff: true });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().error.code).toBe('ROUND_WOULD_BE_SUPERSEDED');
    expect((await app.prisma.round.findUniqueOrThrow({ where: { id: older.id } })).status).toBe('SCHEDULED');
    expect(await app.prisma.adminAuditLog.count({ where: { targetId: older.id } })).toBe(0);
  });
});
