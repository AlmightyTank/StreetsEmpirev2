import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

type Who = { id: string; username: string; cookie: string };
type RoundStatus = 'SCHEDULED' | 'REGISTRATION' | 'ACTIVE' | 'ENDED';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe.runIf(process.env.ADMIN_INTEGRATION === '1')('Admin news, banner, round operations and health API with PostgreSQL', () => {
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
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === cookieName);
    if (!session) throw new Error('Registering did not set a session cookie.');
    return { id: accountId, username, cookie: `${session.name}=${session.value}` };
  }

  const headers = (who?: Who) => (who ? { cookie: who.cookie } : {});
  const get = (url: string, who: Who = admin) => app.inject({ url, headers: headers(who) });
  const post = (url: string, payload?: object, who: Who = admin) =>
    app.inject({ method: 'POST', url, headers: headers(who), ...(payload ? { payload } : {}) });

  async function createRound(status: RoundStatus, startsAt: Date, endsAt: Date, extra: { discordEndingSoonAt?: Date } = {}) {
    const round = await app.prisma.round.create({
      data: {
        slug: `admin-ops-${randomUUID()}`,
        name: `Admin Ops ${randomUUID().slice(0, 6)}`,
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        status,
        startsAt,
        endsAt,
        ...extra,
      },
    });
    roundIds.push(round.id);
    return round;
  }

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    admin = await register('adm');
    player = await register('ply');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    cityId = (await app.prisma.city.create({ data: { slug: `admin-ops-${randomUUID()}`, name: 'Admin Ops City', isEnabled: true } })).id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.adminAuditLog.deleteMany({ where: { actorAccountId: { in: accountIds } } });
    await app.prisma.gameNews.deleteMany({ where: { createdByAccountId: { in: accountIds } } });
    await app.prisma.siteBanner.deleteMany({ where: { createdByAccountId: { in: accountIds } } });
    if (roundIds.length) await app.prisma.round.deleteMany({ where: { id: { in: roundIds } } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    if (cityId) await app.prisma.city.deleteMany({ where: { id: cityId } });
    await app.close();
  });

  it('refuses every news, banner and round operation route to guests and non-admins', async () => {
    const requests = [
      { method: 'GET' as const, url: '/api/admin/news' },
      { method: 'POST' as const, url: '/api/admin/news', payload: { title: 'x', body: 'y', pinned: false, roundId: null, mirrorToForum: false } },
      { method: 'POST' as const, url: '/api/admin/news/some-news/update', payload: { pinned: true } },
      { method: 'POST' as const, url: '/api/admin/news/some-news/delete', payload: { reason: 'Never runs here' } },
      { method: 'POST' as const, url: '/api/admin/news/some-news/mirror' },
      { method: 'GET' as const, url: '/api/admin/banners' },
      { method: 'POST' as const, url: '/api/admin/banners', payload: { message: 'Nope', tone: 'info', endsAt: new Date(Date.now() + HOUR).toISOString() } },
      { method: 'POST' as const, url: '/api/admin/banners/some-banner/end' },
      { method: 'POST' as const, url: '/api/admin/rounds/close-expired' },
      { method: 'GET' as const, url: '/api/admin/rounds/some-round/health' },
      { method: 'POST' as const, url: '/api/admin/rounds/some-round/update', payload: { reason: 'Never runs here', name: 'Nope' } },
    ];
    for (const request of requests) {
      expect((await app.inject({ ...request, headers: headers() })).statusCode, `${request.method} ${request.url} as a guest`).toBe(401);
      expect((await app.inject({ ...request, headers: headers(player) })).statusCode, `${request.method} ${request.url} as a player`).toBe(403);
    }
    expect(await app.prisma.gameNews.count({ where: { createdByAccountId: player.id } })).toBe(0);
    expect(await app.prisma.siteBanner.count({ where: { createdByAccountId: player.id } })).toBe(0);
  });

  it('posts, pins, edits, schedules and deletes news with audit records, and refuses the mirror when unconfigured', async () => {
    const mirrored = await post('/api/admin/news', { title: 'Mirror me', body: 'Forum please', pinned: false, roundId: null, mirrorToForum: true });
    expect(mirrored.statusCode, mirrored.body).toBe(400);
    expect(mirrored.json().error.code).toBe('FORUM_MIRROR_DISABLED');

    const title = `Admin news ${randomUUID().slice(0, 6)}`;
    const created = await post('/api/admin/news', { title, body: 'Season notes', pinned: false, roundId: null, mirrorToForum: false });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().forumMirrorEnabled).toBe(false);
    const postRow = (created.json().posts as Array<{ id: string; title: string; authorName: string; roundId: string | null }>).find((row) => row.title === title)!;
    expect(postRow).toMatchObject({ authorName: admin.username, roundId: null });

    const scheduledTitle = `Scheduled ${randomUUID().slice(0, 6)}`;
    expect((await post('/api/admin/news', { title: scheduledTitle, body: 'Later', pinned: false, roundId: null, mirrorToForum: false, publishedAt: new Date(Date.now() + HOUR).toISOString() })).statusCode).toBe(201);

    const current = await get('/api/rounds/current');
    if (current.json().round) {
      const feed = (await get('/api/rounds/current/news', player)).json().news as Array<{ title: string }>;
      expect(feed.map((row) => row.title)).toContain(title);
      expect(feed.map((row) => row.title)).not.toContain(scheduledTitle);
    }

    const pinned = await post(`/api/admin/news/${postRow.id}/update`, { pinned: true });
    expect(pinned.statusCode, pinned.body).toBe(200);
    expect(pinned.json().posts.find((row: { id: string }) => row.id === postRow.id).isPinned).toBe(true);
    expect((await post(`/api/admin/news/${postRow.id}/update`, { pinned: true })).statusCode).toBe(400);

    const edited = await post(`/api/admin/news/${postRow.id}/update`, { title: `${title} (edited)`, body: 'Corrected notes' });
    expect(edited.statusCode, edited.body).toBe(200);
    expect((await post(`/api/admin/news/${postRow.id}/delete`, {})).statusCode).toBe(400);
    const deleted = await post(`/api/admin/news/${postRow.id}/delete`, { reason: 'Posted by mistake' });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(await app.prisma.gameNews.findUnique({ where: { id: postRow.id } })).toBeNull();

    const audit = await app.prisma.adminAuditLog.findMany({ where: { targetId: postRow.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((row) => row.action)).toEqual(['news.create', 'news.update', 'news.update', 'news.delete']);
    expect(audit[3]).toMatchObject({ reason: 'Posted by mistake' });
    expect((audit[3]!.before as { title: string }).title).toBe(`${title} (edited)`);
  });

  it('shows a banner publicly while it is live and ends it on request', async () => {
    expect((await post('/api/admin/banners', { message: 'Backwards', tone: 'info', startsAt: new Date(Date.now() + HOUR).toISOString(), endsAt: new Date(Date.now() + 30 * 60_000).toISOString() })).statusCode).toBe(400);
    expect((await post('/api/admin/banners', { message: 'Too long', tone: 'info', endsAt: new Date(Date.now() + 31 * DAY).toISOString() })).statusCode).toBe(400);

    const message = `Maintenance at midnight ${randomUUID().slice(0, 6)}`;
    const created = await post('/api/admin/banners', { message, tone: 'warning', endsAt: new Date(Date.now() + HOUR).toISOString() });
    expect(created.statusCode, created.body).toBe(201);
    const banner = created.json().current as { id: string; message: string; tone: string };
    expect(banner).toMatchObject({ message, tone: 'warning' });

    const live = await app.inject({ url: '/api/site/banner' });
    expect(live.statusCode).toBe(200);
    expect(live.json().banner).toMatchObject({ id: banner.id, message, createdByUsername: admin.username });

    const ended = await post(`/api/admin/banners/${banner.id}/end`);
    expect(ended.statusCode, ended.body).toBe(200);
    expect((await app.inject({ url: '/api/site/banner' })).json().banner?.id).not.toBe(banner.id);
    expect((await post(`/api/admin/banners/${banner.id}/end`)).statusCode).toBe(409);
    expect((await app.prisma.adminAuditLog.findMany({ where: { targetId: banner.id } })).map((row) => row.action).sort()).toEqual(['banner.create', 'banner.end']);
  });

  it('edits round details within the lifecycle rules', async () => {
    const scheduled = await createRound('SCHEDULED', new Date(Date.now() + 10 * DAY), new Date(Date.now() + 38 * DAY));
    expect((await post(`/api/admin/rounds/${scheduled.id}/update`, { name: 'No reason given' })).statusCode).toBe(400);
    expect((await post(`/api/admin/rounds/${scheduled.id}/update`, { reason: 'Nothing to change', name: scheduled.name })).statusCode).toBe(400);
    const renamed = await post(`/api/admin/rounds/${scheduled.id}/update`, {
      reason: 'Clearer season name',
      name: 'Game #099 - Renamed',
      startsAt: new Date(Date.now() + 11 * DAY).toISOString(),
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(renamed.json().round).toMatchObject({ name: 'Game #099 - Renamed', status: 'SCHEDULED' });
    const audit = await app.prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: scheduled.id, action: 'round.update' } });
    expect(audit).toMatchObject({ reason: 'Clearer season name' });
    expect((audit.before as { name: string }).name).toBe(scheduled.name);

    const soon = new Date(Date.now() + 12 * HOUR);
    const active = await createRound('ACTIVE', new Date('2020-01-01T00:00:00.000Z'), soon, { discordEndingSoonAt: new Date() });
    const moveStart = await post(`/api/admin/rounds/${active.id}/update`, { reason: 'Trying to move the start', startsAt: new Date().toISOString() });
    expect(moveStart.statusCode, moveStart.body).toBe(409);
    expect(moveStart.json().error.code).toBe('ROUND_ALREADY_STARTED');
    expect((await post(`/api/admin/rounds/${active.id}/update`, { reason: 'Ending in the past', endsAt: new Date(Date.now() - HOUR).toISOString() })).statusCode).toBe(400);
    const extended = await post(`/api/admin/rounds/${active.id}/update`, { reason: 'Downtime makeup days', endsAt: new Date(Date.now() + 5 * DAY).toISOString() });
    expect(extended.statusCode, extended.body).toBe(200);
    expect((await app.prisma.round.findUniqueOrThrow({ where: { id: active.id } })).discordEndingSoonAt).toBeNull();

    const ended = await createRound('ENDED', new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-29T00:00:00.000Z'));
    const frozen = await post(`/api/admin/rounds/${ended.id}/update`, { reason: 'Rewriting history', name: 'Nope' });
    expect(frozen.statusCode, frozen.body).toBe(409);
    expect(frozen.json().error.code).toBe('ROUND_FINISHED');
  });

  it('closes expired rounds from the checklist action and audits each one', async () => {
    const expired = await createRound('ACTIVE', new Date('2020-01-01T00:00:00.000Z'), new Date(Date.now() - HOUR));
    const response = await post('/api/admin/rounds/close-expired');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().closed.map((round: { id: string }) => round.id)).toContain(expired.id);
    expect((await app.prisma.round.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe('ENDED');
    expect(await app.prisma.adminAuditLog.count({ where: { targetId: expired.id, action: 'round.close-expired', actorAccountId: admin.id } })).toBe(1);

    const again = await post('/api/admin/rounds/close-expired');
    expect(again.json().closed.map((round: { id: string }) => round.id)).not.toContain(expired.id);
  });

  it('reports round health from activity and battles', async () => {
    const round = await createRound('ENDED', new Date(Date.now() - 3 * DAY), new Date(Date.now() + DAY));
    const extra = await register('hlt');
    const now = new Date();
    const players = await Promise.all([admin, player, extra].map((who, index) => app.prisma.roundPlayer.create({
      data: {
        ...classicOgV01.round.startingPlayer,
        roundId: round.id,
        accountId: who.id,
        cityId,
        publicPimpId: 9501 + index,
        displayName: who.username,
        netWorthCents: BigInt(3_000_000 - index * 1_000_000),
        lastTurnCalculationAt: now,
        lastActiveAt: now,
      },
    })));
    const [richest, second, idle] = players as [typeof players[number], typeof players[number], typeof players[number]];

    await app.prisma.playerActivity.createMany({
      data: [
        { roundPlayerId: richest.id, type: 'ROUND_JOINED', payload: {} },
        { roundPlayerId: second.id, type: 'ROUND_JOINED', payload: {} },
        { roundPlayerId: idle.id, type: 'ROUND_JOINED', payload: {} },
        { roundPlayerId: richest.id, type: 'SCOUT', payload: { turns: 5 } },
        { roundPlayerId: richest.id, type: 'PRODUCE_CRACK', payload: { turns: 3 } },
        { roundPlayerId: richest.id, type: 'RAID_ATTACK', payload: { turns: 2 } },
        { roundPlayerId: second.id, type: 'RAID_DEFENSE', payload: { turns: 0 } },
        { roundPlayerId: second.id, type: 'AWAY_BONUS', payload: { turns: 10 } },
        { roundPlayerId: second.id, type: 'COMBAT_RECON', payload: { turns: 1 } },
        { roundPlayerId: idle.id, type: 'AWAY_BONUS', payload: { turns: 10 } },
      ],
    });
    const battle = (kind: 'RAID' | 'DRIVE_BY', reportKind: string) => app.prisma.raidBattle.create({
      data: {
        kind,
        attackerId: richest.id,
        defenderId: second.id,
        actionId: randomUUID(),
        attackingThugs: 3,
        modelVersion: 'test',
        calculation: {},
        attackerReport: { kind: reportKind },
        defenderReport: { kind: reportKind },
      },
    });
    await battle('RAID', 'RAID');
    await battle('RAID', 'STEAL_RIDE');
    await battle('DRIVE_BY', 'DRIVE_BY');

    const response = await get(`/api/admin/rounds/${round.id}/health`);
    expect(response.statusCode, response.body).toBe(200);
    const health = response.json();
    expect(health.round.id).toBe(round.id);
    expect(health.players).toEqual({ total: 3, active24h: 3, active7d: 3, neverActed: 1 });
    expect(health.days.length).toBeGreaterThanOrEqual(4);
    expect(health.days[0]).toEqual({
      day: now.toISOString().slice(0, 10),
      joins: 3,
      activePlayers: 2,
      turnsSpent: 11,
      raids: 1,
      driveBys: 1,
      specialRaids: 1,
      recon: 1,
    });
    expect(health.topPlayers.map((row: { roundPlayerId: string }) => row.roundPlayerId)).toEqual([richest.id, second.id, idle.id]);
    expect((await get('/api/admin/rounds/missing-round/health')).statusCode).toBe(404);
  });
});
