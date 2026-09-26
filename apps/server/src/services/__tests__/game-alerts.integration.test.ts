import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { NotificationPayload } from '@streets/shared';
import { classicOgV08H } from '@streets/rulesets';
import { headsUpMinutes, startingStock } from '@streets/rules-engine';
import { GameAlertService, REVENGE_REMINDER_HOURS } from '../game-alerts.service.js';
import { NotificationService } from '../notification.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.9.0-G. Every new alert source against PostgreSQL: nothing before the game
 * would show it, never a name the game hides, once only, and the quiet controls.
 */
describe.runIf(process.env.GAME_ALERTS_INTEGRATION === '1')('0.9.0-G notifications and phone alerts with PostgreSQL', () => {
  const rules = classicOgV08H;
  const PUSH_ONLY = { discord: false, push: true };
  let app: FastifyInstance;
  let roundId = '';
  let homeCityId = '';
  let otherCityId = '';
  const accounts: string[] = [];
  const players: Record<'defender' | 'ally' | 'farAlly' | 'attacker', { id: string; accountId: string; cookie: string; name: string }> = {} as never;

  async function register(label: string) {
    const username = `ga${label}_${randomUUID().slice(0, 6)}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, email: `${username}@example.invalid`, password: randomUUID() },
    });
    expect(response.statusCode, response.body).toBeLessThan(300);
    const accountId = response.json().account.id as string;
    accounts.push(accountId);
    return { accountId, username, cookie: response.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
  }

  async function enableEverything(accountId: string) {
    await app.prisma.pushSubscription.create({
      data: { accountId, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: 'p', auth: 'a' },
    });
    await app.prisma.notificationSettings.upsert({
      where: { accountId },
      create: {
        accountId, pushEnabled: true, turfPushEnabled: true, reinforcementsEnabled: true, convoyEnabled: true,
        runsEnabled: true, revengeEnabled: true, ordersEnabled: true, announcementsEnabled: true, messagesEnabled: true,
      },
      update: {},
    });
  }

  async function outbox(accountId: string, category: string) {
    const rows = await app.prisma.notificationOutbox.findMany({ where: { accountId, category }, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => row.payload as unknown as NotificationPayload & { notice: { title: string; body: string } });
  }

  async function activity(roundPlayerId: string, type: string) {
    return app.prisma.playerActivity.findMany({ where: { roundPlayerId, type: type as never } });
  }

  const collect = (now: Date) => NotificationService.collect(app.prisma, now, PUSH_ONLY);

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    homeCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } })).id;
    otherCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } })).id;
    const round = await app.prisma.round.create({
      data: {
        name: 'GA Live Season', slug: `ga-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
        status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    roundId = round.id;

    let pimpId = 9300;
    for (const [key, cityId] of [['defender', homeCityId], ['ally', homeCityId], ['farAlly', otherCityId], ['attacker', homeCityId]] as const) {
      const account = await register(key.slice(0, 3));
      const player = await app.prisma.roundPlayer.create({
        data: {
          ...rules.round.startingPlayer,
          ...startingStock(rules),
          roundId, accountId: account.accountId, cityId, displayName: account.username, publicPimpId: pimpId++,
          hideoutLookoutsLevel: 3,
          reputation: { create: ReputationService.seedFor(rules) },
        },
      });
      players[key] = { id: player.id, accountId: account.accountId, cookie: account.cookie, name: account.username };
      await enableEverything(account.accountId);
    }
    const alliance = await app.prisma.alliance.create({
      data: {
        roundId, name: 'GA Crew', nameNormalized: `ga crew ${randomUUID()}`, tag: 'GA', tagNormalized: `ga${randomUUID().slice(0, 4)}`,
        leaderId: players.defender.id,
      },
    });
    await app.prisma.roundPlayer.updateMany({
      where: { id: { in: [players.defender.id, players.ally.id, players.farAlly.id] } },
      data: { allianceId: alliance.id, allianceJoinedAt: new Date(Date.now() - 3_600_000) },
    });

    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } }).catch(() => undefined);
    for (const id of accounts) await app.prisma.account.delete({ where: { id } }).catch(() => undefined);
    await app?.close();
  });

  it('alerts a push only once the holder\'s Lookouts see it, never naming the attacker', async () => {
    const headsUpMs = headsUpMinutes(rules, 3) * 60_000;
    const now = new Date();
    const turf = await app.prisma.turf.create({
      data: { roundId, cityId: homeCityId, district: 'CASINO', localsThugs: 0, holderId: players.defender.id, cornerThugs: 5, heldSince: now },
    });
    const landsAt = new Date(now.getTime() + 10 * 60_000);
    const push = await app.prisma.turfPush.create({
      data: {
        roundId, turfId: turf.id, attackerId: players.attacker.id, defenderId: players.defender.id, squad: 9,
        attackerCrew: {}, turnsSpent: 3, actionId: randomUUID(), startedAt: now, landsAt,
      },
    });

    await collect(now);
    expect(await activity(players.defender.id, 'TURF_PUSH_INCOMING')).toHaveLength(0);
    expect(await outbox(players.defender.accountId, 'turfPush')).toHaveLength(0);

    const spotted = new Date(landsAt.getTime() - headsUpMs + 30_000);
    await collect(spotted);
    await collect(new Date(spotted.getTime() + 30_000));
    const bell = await activity(players.defender.id, 'TURF_PUSH_INCOMING');
    expect(bell).toHaveLength(1);
    expect(JSON.stringify(bell[0]!.payload)).not.toContain(players.attacker.name);
    const alerts = await outbox(players.defender.accountId, 'turfPush');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.notice.title).toBe('Your block is being pushed');
    expect(JSON.stringify(alerts[0])).not.toContain(players.attacker.name);
    expect(await app.prisma.inAppNotification.count({ where: { roundPlayerId: players.defender.id, activity: { type: 'TURF_PUSH_INCOMING' } } })).toBe(1);

    // The holder calls for help: allies in that city hear it, allies elsewhere do not.
    await app.prisma.turfPush.update({ where: { id: push.id }, data: { alliesCalledAt: spotted } });
    await collect(new Date(spotted.getTime() + 45_000));
    expect(await activity(players.ally.id, 'ALLIANCE_CALL')).toHaveLength(1);
    expect(await outbox(players.ally.accountId, 'reinforcements')).toHaveLength(1);
    expect(await activity(players.farAlly.id, 'ALLIANCE_CALL')).toHaveLength(0);
    expect(await outbox(players.farAlly.accountId, 'reinforcements')).toHaveLength(0);
    expect(await outbox(players.defender.accountId, 'reinforcements')).toHaveLength(0);
  });

  it('alerts a tail on a run only inside the Lookouts window, without the tailer', async () => {
    const now = new Date();
    const run = await app.prisma.run.create({
      data: {
        roundPlayerId: players.ally.id, homeCity: 'new-york-city', lowRiders: 1, escortThugs: 1,
        cashCents: 0n, startCashCents: 0n, turnsSpent: 4,
        stops: { create: [{ order: 0, city: 'detroit', route: ['new-york-city', 'detroit'], departAt: now, arriveAt: new Date(now.getTime() + 86_400_000), leaveAt: new Date(now.getTime() + 2 * 86_400_000) }] },
      },
    });
    const landsAt = new Date(now.getTime() + 20 * 60_000);
    await app.prisma.convoyTail.create({
      data: {
        runId: run.id, ownerId: players.ally.id, attackerId: players.attacker.id, source: 'HOME', city: 'new-york-city',
        squad: 4, attackerCrew: {}, turnsSpent: 2, actionId: randomUUID(), startedAt: now, landsAt,
      },
    });
    await collect(now);
    expect(await activity(players.ally.id, 'CONVOY_TAILED')).toHaveLength(0);

    await collect(new Date(landsAt.getTime() - 60_000));
    const bell = await activity(players.ally.id, 'CONVOY_TAILED');
    expect(bell).toHaveLength(1);
    const alerts = await outbox(players.ally.accountId, 'convoy');
    expect(alerts).toHaveLength(1);
    expect(JSON.stringify([bell[0]!.payload, alerts[0]])).not.toContain(players.attacker.name);
  });

  it('reminds about revenge before it closes, unless it was already used', async () => {
    const revengeHours = rules.combat!.strategy!.retaliation.revengeHours;
    const now = new Date();
    const hitAt = new Date(now.getTime() - (revengeHours - REVENGE_REMINDER_HOURS + 0.5) * 3_600_000);
    const battle = (attackerId: string, defenderId: string, createdAt: Date) => app.prisma.raidBattle.create({
      data: {
        attackerId, defenderId, actionId: randomUUID(), attackingThugs: 3, modelVersion: 'test', calculation: {},
        attackerReport: { won: true }, defenderReport: { won: false }, createdAt,
      },
    });
    await battle(players.attacker.id, players.defender.id, hitAt);
    // The far ally already hit back, so their window needs no reminder.
    await battle(players.attacker.id, players.farAlly.id, hitAt);
    await battle(players.farAlly.id, players.attacker.id, new Date(hitAt.getTime() + 60_000));
    // A fresh hit is not due yet.
    await battle(players.attacker.id, players.ally.id, new Date(now.getTime() - 2 * 3_600_000));

    await collect(now);
    await collect(new Date(now.getTime() + 60_000));
    const reminders = await activity(players.defender.id, 'REVENGE_EXPIRING');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.payload).toMatchObject({ attacker: players.attacker.name });
    expect(await outbox(players.defender.accountId, 'revenge')).toHaveLength(1);
    expect(await activity(players.farAlly.id, 'REVENGE_EXPIRING')).toHaveLength(0);
    expect(await activity(players.ally.id, 'REVENGE_EXPIRING')).toHaveLength(0);
  });

  it('fires special orders on arrival, and alerts messages and announcements to the right people', async () => {
    const now = new Date();
    await app.prisma.scheduledAlert.create({
      data: { roundPlayerId: players.defender.id, kind: 'SPECIAL_ORDER', dueAt: new Date(now.getTime() - 1_000), payload: { store: "Tommy's", storeKey: 'TOMMY', item: 'AK-47' } },
    });
    await app.prisma.scheduledAlert.create({
      data: { roundPlayerId: players.defender.id, kind: 'SPECIAL_ORDER', dueAt: new Date(now.getTime() + 3_600_000), payload: { store: 'Later', item: 'Later' } },
    });
    await app.prisma.directMessage.create({
      data: { roundId, senderId: players.attacker.id, recipientId: players.defender.id, actionId: randomUUID(), subject: 'secret subject', body: 'secret body' },
    });
    const alliance = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players.defender.id }, select: { allianceId: true } });
    await app.prisma.allianceWirePost.create({
      data: { allianceId: alliance.allianceId!, authorId: players.defender.id, kind: 'ANNOUNCEMENT', body: 'Hold Casino tonight.' },
    });
    await app.prisma.allianceWirePost.create({
      data: { allianceId: alliance.allianceId!, authorId: players.defender.id, kind: 'MESSAGE', body: 'just chatting' },
    });

    await collect(now);
    await collect(new Date(now.getTime() + 60_000));

    expect(await activity(players.defender.id, 'SPECIAL_ORDER_READY')).toHaveLength(1);
    const orders = await outbox(players.defender.accountId, 'orders');
    expect(orders.map((row) => row.notice.body)).toEqual(["AK-47 is on the shelf at Tommy's."]);

    const messages = await outbox(players.defender.accountId, 'messages');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.notice.body).toBe(`${players.attacker.name} sent you a message.`);
    expect(JSON.stringify(messages)).not.toContain('secret');

    expect((await outbox(players.ally.accountId, 'announcements')).map((row) => row.notice.body)).toEqual(['Hold Casino tonight.']);
    expect(await outbox(players.farAlly.accountId, 'announcements')).toHaveLength(1);
    expect(await outbox(players.defender.accountId, 'announcements')).toHaveLength(0);
    expect(await outbox(players.attacker.accountId, 'announcements')).toHaveLength(0);
  });

  it('brings runs home on time and alerts the owner', async () => {
    const now = new Date();
    await app.prisma.run.create({
      data: {
        roundPlayerId: players.farAlly.id, homeCity: 'detroit', lowRiders: 1, escortThugs: 1,
        cashCents: 0n, startCashCents: 0n, turnsSpent: 4,
        stops: { create: [
          { order: 0, city: 'new-york-city', route: ['detroit', 'new-york-city'], departAt: new Date(now.getTime() - 4 * 3_600_000), arriveAt: new Date(now.getTime() - 3 * 3_600_000), leaveAt: new Date(now.getTime() - 2 * 3_600_000) },
          { order: 1, city: 'detroit', route: ['new-york-city', 'detroit'], departAt: new Date(now.getTime() - 2 * 3_600_000), arriveAt: new Date(now.getTime() - 60_000) },
        ] },
      },
    });
    await app.prisma.roundPlayer.update({ where: { id: players.farAlly.id }, data: { lowRiders: 0, busyThugs: 0 } });

    expect(await GameAlertService.sweepRuns(app.prisma, now)).toBeGreaterThanOrEqual(1);
    await collect(now);
    expect(await activity(players.farAlly.id, 'RUN_RETURNED')).toHaveLength(1);
    const alerts = await outbox(players.farAlly.accountId, 'runs');
    expect(alerts.map((row) => row.notice.body)).toEqual(['Your New York City run made it home.']);
  });

  it('pauses and quiets outside alerts while the bell keeps everything, and mutes the bell by category', async () => {
    const put = (cookie: string, payload: Record<string, unknown>) => app.inject({ method: 'PUT', url: '/api/notifications/settings', headers: { cookie }, payload });

    const paused = await put(players.attacker.cookie, { paused: true, bellMuted: ['revenge', 'runs'] });
    expect(paused.statusCode, paused.body).toBe(200);
    expect(paused.json()).toMatchObject({ paused: true, bellMuted: ['runs', 'revenge'] });

    const now = new Date();
    await app.prisma.scheduledAlert.create({
      data: { roundPlayerId: players.attacker.id, kind: 'SPECIAL_ORDER', dueAt: now, payload: { store: 'Pip', item: 'Meth' } },
    });
    await collect(new Date(now.getTime() + 1_000));
    expect(await activity(players.attacker.id, 'SPECIAL_ORDER_READY')).toHaveLength(1);
    expect(await outbox(players.attacker.accountId, 'orders')).toHaveLength(0);

    // Quiet hours around the current minute: nothing goes out, and a real zone is required.
    const bad = await put(players.attacker.cookie, { quietHours: { start: 0, end: 0, timeZone: 'UTC' } });
    expect(bad.statusCode).toBe(400);
    const badZone = await put(players.attacker.cookie, { quietHours: { start: 0, end: 60, timeZone: 'Mars/Olympus' } });
    expect(badZone.statusCode).toBe(400);
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const window = { start: (minute + 1440 - 60) % 1440, end: (minute + 60) % 1440, timeZone: 'UTC' };
    const quiet = await put(players.attacker.cookie, { paused: false, quietHours: window });
    expect(quiet.json()).toMatchObject({ paused: false, quietHours: window });
    await app.prisma.scheduledAlert.create({
      data: { roundPlayerId: players.attacker.id, kind: 'SPECIAL_ORDER', dueAt: new Date(now.getTime() + 2_000), payload: { store: 'Pip', item: 'Weed' } },
    });
    await collect(new Date(now.getTime() + 3_000));
    expect(await activity(players.attacker.id, 'SPECIAL_ORDER_READY')).toHaveLength(2);
    expect(await outbox(players.attacker.accountId, 'orders')).toHaveLength(0);

    // Bell mutes: a muted category leaves the feed and the unread count; others stay.
    const revengeRow = await app.prisma.playerActivity.create({ data: { roundPlayerId: players.attacker.id, type: 'REVENGE_EXPIRING', payload: {} } });
    await app.prisma.inAppNotification.create({ data: { id: revengeRow.id, activityId: revengeRow.id, roundPlayerId: players.attacker.id } });
    const inbox = await app.inject({ method: 'GET', url: '/api/notifications/in-app', headers: { cookie: players.attacker.cookie } });
    expect(inbox.statusCode, inbox.body).toBe(200);
    const feed = inbox.json();
    expect(feed.bellMuted).toEqual(['runs', 'revenge']);
    expect(feed.notifications.map((row: { activity: { type: string } }) => row.activity.type)).toEqual(['SPECIAL_ORDER_READY', 'SPECIAL_ORDER_READY']);
    expect(feed.unreadCount).toBe(2);

    const settings = await app.inject({ method: 'GET', url: '/api/notifications/settings', headers: { cookie: players.attacker.cookie } });
    expect(Object.keys(settings.json().categories)).toHaveLength(14);
  });
});
