import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV08H } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ExploitFlagService } from '../exploit-flag.service.js';
import { NotificationService } from '../notification.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { TurfService } from '../turf.service.js';

/**
 * 1.0.0-E. Routine game operations through supported tools, never the database:
 * pausing a season, banning, exploit flags, economy and combat views, turf
 * repairs, game-wide announcements and maintenance notices. Every destructive
 * action is checked for its audit row: admin, action, target, time, reason and
 * the state before.
 */
describe.runIf(process.env.ADMIN_OPS_INTEGRATION === '1')('1.0.0-E administration with PostgreSQL', () => {
  const rules = classicOgV08H;
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  const accounts: string[] = [];
  const bannerIds: string[] = [];
  const newsIds: string[] = [];
  type Player = { id: string; accountId: string; cookie: string; username: string; password: string; pimp: number };
  const p: Record<string, Player> = {};

  async function register(key: string, pimp: number) {
    const username = `ao${key}_${randomUUID().slice(0, 6)}`;
    const password = randomUUID();
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password } });
    expect(response.statusCode, response.body).toBeLessThan(300);
    const accountId = response.json().account.id as string;
    accounts.push(accountId);
    const player = await app.prisma.roundPlayer.create({ data: {
      ...rules.round.startingPlayer, ...startingStock(rules), roundId, accountId, cityId, displayName: username, publicPimpId: pimp,
      reputation: { create: ReputationService.seedFor(rules) }, lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
    } });
    p[key] = { id: player.id, accountId, username, password, pimp, cookie: response.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
    return p[key]!;
  }

  const admin = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url: `/api/admin${url}`, headers: { cookie: p.admin!.cookie }, ...(payload ? { payload } : {}) });
  const play = (key: string, url: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: p[key]!.cookie }, payload });
  const audit = (action: string, targetId: string) =>
    app.prisma.adminAuditLog.findFirst({ where: { action, targetId }, orderBy: { createdAt: 'desc' } });

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'AO Live Season', slug: `ao-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
      status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    await register('admin', 9701);
    await app.prisma.account.update({ where: { id: p.admin!.accountId }, data: { isAdmin: true } });
    await register('alice', 9702);
    await register('bob', 9703);
    await TurfService.ensureRound(app.prisma, roundId, rules);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.prisma.siteBanner.deleteMany({ where: { id: { in: bannerIds } } });
    await app.prisma.gameNews.deleteMany({ where: { OR: [{ id: { in: newsIds } }, { roundId }] } });
    await app.prisma.exploitFlag.deleteMany({ where: { accountId: { in: accounts } } });
    await app.prisma.round.delete({ where: { id: roundId } }).catch(() => undefined);
    await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  describe('seasons', () => {
    it('pauses play with a reason, resumes it, and gives the time back', async () => {
      const before = await app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
      const paused = await admin('POST', `/rounds/${roundId}/pause`, { reason: 'Investigating a store bug' });
      expect(paused.statusCode, paused.body).toBe(200);
      expect(paused.json().round).toMatchObject({ paused: { reason: 'Investigating a store bug' }, actions: ['resume', 'end-early'] });

      // Players are told why; nothing they own moves.
      const scout = await play('alice', '/scout', { district: 'CASINO', turns: 5, actionId: randomUUID() });
      expect(scout.statusCode).toBe(409);
      expect(scout.json().error).toMatchObject({ code: 'ROUND_PAUSED', message: expect.stringContaining('Investigating a store bug') });
      const raid = await play('alice', '/combat/raid', { roundId, targetPublicPimpId: p.bob!.pimp, attackingThugs: 5, actionId: randomUUID() });
      expect(raid.statusCode).toBe(409);
      expect((await app.inject({ method: 'GET', url: '/api/rounds/current', headers: { cookie: p.alice!.cookie } })).json().round.paused).toMatchObject({ reason: 'Investigating a store bug' });
      expect((await app.inject({ method: 'GET', url: '/api/public/status' })).json().currentRound).toMatchObject({ paused: true });
      expect(await audit('round.pause', roundId)).toMatchObject({ actorUsername: p.admin!.username, reason: 'Investigating a store bug', before: expect.objectContaining({ pausedAt: null }) });

      // Pretend the pause lasted two hours.
      await app.prisma.round.update({ where: { id: roundId }, data: { pausedAt: new Date(Date.now() - 2 * 3_600_000) } });
      const resumed = await admin('POST', `/rounds/${roundId}/resume`, { extend: true });
      expect(resumed.statusCode, resumed.body).toBe(200);
      const after = await app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
      expect(after.pausedAt).toBeNull();
      expect(after.pausedMinutesTotal).toBeGreaterThanOrEqual(120);
      expect(after.endsAt.getTime() - before.endsAt.getTime()).toBeGreaterThanOrEqual(120 * 60_000);
      expect((await audit('round.resume', roundId))?.reason).toMatch(/Paused 12\d minutes; end moved back/);
      expect((await play('alice', '/scout', { district: 'CASINO', turns: 5, actionId: randomUUID() })).statusCode).toBe(200);
      // Only a running season pauses.
      expect((await admin('POST', `/rounds/${roundId}/resume`, { extend: true })).statusCode).toBe(409);
    });
  });

  describe('accounts', () => {
    it('bans with a reason the player sees, refuses to reactivate around it, and unbans', async () => {
      const banned = await admin('POST', `/accounts/${p.bob!.accountId}/ban`, { reason: 'Botting raids overnight' });
      expect(banned.statusCode, banned.body).toBe(200);
      expect(banned.json().account.ban).toMatchObject({ reason: 'Botting raids overnight', byUsername: p.admin!.username });
      expect(await app.prisma.session.count({ where: { accountId: p.bob!.accountId } })).toBe(0);
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: p.bob!.username, password: p.bob!.password } });
      expect(login.statusCode).toBe(403);
      expect(login.json().error).toMatchObject({ code: 'ACCOUNT_BANNED', message: expect.stringContaining('Botting raids overnight') });
      expect((await admin('POST', `/accounts/${p.bob!.accountId}/reactivate`, { reason: 'Trying to slip past' })).json().error.code).toBe('ACCOUNT_BANNED');
      expect(await audit('account.ban', p.bob!.accountId)).toMatchObject({ reason: 'Botting raids overnight', before: expect.objectContaining({ isActive: true, bannedAt: null }) });

      expect((await admin('POST', `/accounts/${p.bob!.accountId}/unban`, { reason: 'Appeal accepted' })).statusCode).toBe(200);
      const back = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: p.bob!.username, password: p.bob!.password } });
      expect(back.statusCode, back.body).toBe(200);
      p.bob!.cookie = back.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    });
  });

  describe('exploits and combat', () => {
    it('keeps refusals that look like exploits for review, folded per account and day', async () => {
      // A hit on an account from the same network is refused and flagged.
      await app.prisma.session.updateMany({ where: { accountId: { in: [p.alice!.accountId, p.bob!.accountId] } }, data: { ip: '203.0.113.90' } });
      const refused = await play('alice', '/combat/raid', { roundId, targetPublicPimpId: p.bob!.pimp, attackingThugs: 5, actionId: randomUUID() });
      expect(refused.json().error.code).toBe('LINKED_ACCOUNTS');
      await vi.waitFor(async () => expect(await app.prisma.exploitFlag.count({ where: { accountId: p.alice!.accountId, kind: 'LINKED_ATTACK' } })).toBe(1));
      await play('alice', '/combat/raid', { roundId, targetPublicPimpId: p.bob!.pimp, attackingThugs: 5, actionId: randomUUID() });
      await vi.waitFor(async () => expect((await app.prisma.exploitFlag.findFirstOrThrow({ where: { accountId: p.alice!.accountId, kind: 'LINKED_ATTACK' } })).occurrences).toBe(2));

      const queue = (await admin('GET', '/exploit-flags?status=open')).json();
      const flag = queue.flags.find((row: { account: { id: string } | null }) => row.account?.id === p.alice!.accountId);
      expect(flag).toMatchObject({ kind: 'LINKED_ATTACK', occurrences: 2, route: 'POST /api/game/combat/raid' });
      const reviewed = await admin('POST', `/exploit-flags/${flag.id}/review`, { resolution: 'actioned', note: 'Same household; warned both' });
      expect(reviewed.json().flag.review).toMatchObject({ resolution: 'actioned', byUsername: p.admin!.username });
      expect(await audit('exploit-flag.actioned', flag.id)).toMatchObject({ reason: 'Same household; warned both' });
      // Doing it again reopens it.
      await ExploitFlagService.record(app.prisma, { kind: 'LINKED_ATTACK', accountId: p.alice!.accountId, route: 'POST /api/game/combat/raid', message: 'again' });
      expect((await app.prisma.exploitFlag.findUniqueOrThrow({ where: { id: flag.id } })).reviewedAt).toBeNull();
      await app.prisma.session.updateMany({ where: { accountId: { in: [p.alice!.accountId, p.bob!.accountId] } }, data: { ip: null } });
    });

    it('lists every fight in the season, and money worth a second look', async () => {
      await app.prisma.economyLedgerEntry.create({ data: { roundPlayerId: p.alice!.id, source: 'RAID', label: 'Suspiciously huge raid', amountCents: 500_000_000n } });
      const suspicious = (await admin('GET', `/rounds/${roundId}/suspicious?hours=24`)).json();
      expect(suspicious.largest[0]).toMatchObject({ label: 'Suspiciously huge raid', amountCents: 500_000_000, player: { id: p.alice!.id } });
      expect(suspicious.surges.some((row: { player: { id: string } }) => row.player.id === p.alice!.id)).toBe(true);

      const battles = (await admin('GET', `/rounds/${roundId}/battles`)).json();
      expect(battles).toMatchObject({ roundId, battles: expect.any(Array), tails: expect.any(Array) });

      const markets = (await admin('GET', `/rounds/${roundId}/markets`)).json();
      expect(markets.cities.length).toBeGreaterThan(1);
      expect(markets.cities[0].products.find((row: { product: string }) => row.product === 'COCAINE')).toMatchObject({ buyCents: expect.any(Number), sellCents: expect.any(Number) });

      // A special order shows up as a shipment, and on the player's shelves.
      await app.prisma.roundPlayer.update({ where: { id: p.alice!.id }, data: { pistolStock: 0, pistolStockAt: new Date(), cashCents: 50_000_000n } });
      const order = await play('alice', '/stores/special-order', { store: 'TOMMY', item: 'PISTOL', actionId: randomUUID() });
      expect(order.statusCode, order.body).toBe(200);
      expect((await admin('GET', `/rounds/${roundId}/shipments`)).json().pending).toEqual([expect.objectContaining({ item: 'Pistol', player: expect.objectContaining({ id: p.alice!.id }) })]);
      const stores = (await admin('GET', `/players/${p.alice!.id}/stores`)).json();
      expect(stores.shelves.find((row: { field: string }) => row.field === 'pistolStock')).toMatchObject({ stock: 0 });
      expect(stores.specialOrders).toHaveLength(1);
    });
  });

  describe('turf', () => {
    it('shows blocks and drift, re-syncs a holder, releases a block and settles a stuck push, all audited', async () => {
      const block = await app.prisma.turf.findUniqueOrThrow({ where: { roundId_cityId_district: { roundId, cityId, district: 'CASINO' } } });
      // Corrupted: 12 thugs stand on the corner but the holder's count says 20.
      await app.prisma.turf.update({ where: { id: block.id }, data: { holderId: p.alice!.id, cornerThugs: 12, cornerPistols: 12, heldSince: new Date(), localsThugs: 0 } });
      await app.prisma.roundPlayer.update({ where: { id: p.alice!.id }, data: { thugs: 40, postedThugs: 20, pistols: 5 } });

      const overview = (await admin('GET', `/rounds/${roundId}/turf`)).json();
      expect(overview.drift).toEqual([expect.objectContaining({ postedThugs: 20, onCorners: 12, player: expect.objectContaining({ id: p.alice!.id }) })]);
      expect(overview.blocks.find((row: { id: string }) => row.id === block.id)).toMatchObject({ holder: { id: p.alice!.id }, cornerThugs: 12 });

      const synced = await admin('POST', '/turf/repair', { action: 'sync-posted', roundPlayerId: p.alice!.id, reason: 'Posted count drifted' });
      expect(synced.statusCode, synced.body).toBe(200);
      expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: p.alice!.id } })).postedThugs).toBe(12);
      expect(await audit('turf.sync-posted', p.alice!.id)).toMatchObject({ before: expect.objectContaining({ postedThugs: 20 }), after: expect.objectContaining({ postedThugs: 12 }) });

      const released = await admin('POST', '/turf/repair', { action: 'release-block', turfId: block.id, reason: 'Corner stuck after a failed settle' });
      expect(released.statusCode, released.body).toBe(200);
      const home = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: p.alice!.id } });
      expect(home).toMatchObject({ postedThugs: 0, pistols: 17 });
      expect(await app.prisma.turf.findUniqueOrThrow({ where: { id: block.id } })).toMatchObject({ holderId: null, cornerThugs: 0 });
      expect(await audit('turf.release-block', block.id)).toMatchObject({ reason: 'Corner stuck after a failed settle', before: expect.objectContaining({ holderId: p.alice!.id, cornerThugs: 12 }) });
      const history = (await admin('GET', `/turf/${block.id}/history`)).json();
      expect(history).toMatchObject({ district: 'CASINO' });

      // A push long past its landing that nobody settled.
      const other = await app.prisma.turf.findUniqueOrThrow({ where: { roundId_cityId_district: { roundId, cityId, district: 'NIGHTCLUB' } } });
      await app.prisma.turf.update({ where: { id: other.id }, data: { holderId: p.bob!.id, cornerThugs: 6, cornerPistols: 6, heldSince: new Date(), localsThugs: 0 } });
      await app.prisma.roundPlayer.update({ where: { id: p.bob!.id }, data: { thugs: 30, postedThugs: 6 } });
      await app.prisma.roundPlayer.update({ where: { id: p.alice!.id }, data: { busyThugs: 10 } });
      const push = await app.prisma.turfPush.create({ data: {
        roundId, turfId: other.id, attackerId: p.alice!.id, defenderId: p.bob!.id, squad: 10, turnsSpent: 8, actionId: randomUUID(),
        attackerCrew: { thugs: 10, thugHappiness: 90, weapons: { PISTOL: 10, SHOTGUN: 0, TEK9: 0, AK47: 0 } },
        startedAt: new Date(Date.now() - 3 * 3_600_000), landsAt: new Date(Date.now() - 2 * 3_600_000),
      } });
      expect((await admin('GET', `/rounds/${roundId}/turf`)).json().blocks.find((row: { id: string }) => row.id === other.id).pendingPushes[0]).toMatchObject({ id: push.id, overdue: true });
      const settled = await admin('POST', '/turf/repair', { action: 'settle-push', pushId: push.id, reason: 'Stuck overnight' });
      expect(settled.statusCode, settled.body).toBe(200);
      expect((await app.prisma.turfPush.findUniqueOrThrow({ where: { id: push.id } })).status).toBe('LANDED');
      expect(await audit('turf.settle-push', push.id)).toMatchObject({ before: expect.objectContaining({ status: 'PENDING' }) });
    });
  });

  describe('notifications', () => {
    it('broadcasts an announcement to every player of the season, once', async () => {
      await app.prisma.notificationSettings.upsert({
        where: { accountId: p.alice!.accountId },
        create: { accountId: p.alice!.accountId, pushEnabled: true, announcementsEnabled: true },
        update: { pushEnabled: true, announcementsEnabled: true },
      });
      await app.prisma.pushSubscription.create({ data: { accountId: p.alice!.accountId, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: 'p', auth: 'a' } });
      const created = await admin('POST', '/news', { title: 'Double take weekend', body: 'Scouting pays double until Monday.', pinned: false, roundId, mirrorToForum: false, broadcast: true });
      expect(created.statusCode, created.body).toBe(201);
      const post = created.json().posts.find((row: { title: string }) => row.title === 'Double take weekend');
      newsIds.push(post.id);
      expect(post).toMatchObject({ broadcast: true, broadcastAt: null });

      await NotificationService.collect(app.prisma, new Date(), { discord: false, push: true });
      await NotificationService.collect(app.prisma, new Date(), { discord: false, push: true });
      for (const key of ['alice', 'bob', 'admin']) {
        expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: p[key]!.id, type: 'GAME_ANNOUNCEMENT' } }), key).toBe(1);
        expect(await app.prisma.inAppNotification.count({ where: { roundPlayerId: p[key]!.id, activity: { type: 'GAME_ANNOUNCEMENT' } } }), key).toBe(1);
      }
      expect(await app.prisma.notificationOutbox.count({ where: { accountId: p.alice!.accountId, category: 'announcements' } })).toBe(1);
      expect((await app.prisma.gameNews.findUniqueOrThrow({ where: { id: post.id } })).broadcastAt).not.toBeNull();
    });

    it('schedules maintenance: a notice with its window, announced to players, on the public status page', async () => {
      const start = new Date(Date.now() + 3 * 3_600_000);
      const end = new Date(start.getTime() + 3_600_000);
      const scheduled = await admin('POST', '/banners', {
        message: 'Database upgrade', tone: 'warning', endsAt: end.toISOString(),
        kind: 'maintenance', maintenanceStartsAt: start.toISOString(), maintenanceEndsAt: end.toISOString(), announce: true,
      });
      expect(scheduled.statusCode, scheduled.body).toBe(201);
      const banner = (await app.inject({ method: 'GET', url: '/api/site/banner' })).json().banner;
      bannerIds.push(banner.id);
      expect(banner).toMatchObject({ kind: 'maintenance', message: 'Database upgrade', maintenance: { startsAt: start.toISOString(), endsAt: end.toISOString() } });
      const news = await app.prisma.gameNews.findFirstOrThrow({ where: { title: { startsWith: 'Scheduled maintenance' }, createdByAccountId: p.admin!.accountId } });
      newsIds.push(news.id);
      expect(news).toMatchObject({ broadcast: true, isPinned: true });
      expect((await app.inject({ method: 'GET', url: '/api/public/status' })).json().maintenance).toMatchObject({ message: 'Database upgrade', running: false });
      expect(await audit('maintenance.schedule', banner.id)).toBeTruthy();
      // A window that ends before it starts is refused.
      const bad = await admin('POST', '/banners', { message: 'Oops', tone: 'warning', endsAt: start.toISOString(), kind: 'maintenance', maintenanceStartsAt: end.toISOString(), maintenanceEndsAt: start.toISOString() });
      expect(bad.statusCode).toBe(400);
    });
  });
});
