import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

const endpoint = () => `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
const keys = { p256dh: 'BTestPublicKey', auth: 'TestAuth' };

describe.runIf(process.env.NOTIFICATION_INTEGRATION === '1')('alert settings and push delivery with PostgreSQL', () => {
  let app: FastifyInstance;
  let env: (typeof import('../../config/env.js'))['env'];
  let NotificationService: (typeof import('../notification.service.js'))['NotificationService'];
  let PushService: (typeof import('../push.service.js'))['PushService'];
  const accounts: { id: string; cookie: string }[] = [];
  const players: string[] = [];
  let roundId: string;
  let cityId: string;

  beforeAll(async () => {
    ({ env } = await import('../../config/env.js'));
    if (!env.push.configured) throw new Error('Set test VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.');
    ({ NotificationService } = await import('../notification.service.js'));
    ({ PushService } = await import('../push.service.js'));
    app = await (await import('../../app.js')).buildApp();
    for (let i = 0; i < 2; i++) {
      const username = `push_${randomUUID().slice(0, 8)}`;
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
      expect(response.statusCode, response.body).toBe(201);
      accounts.push({ id: response.json().account.id, cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; ') });
    }
    const city = await app.prisma.city.create({ data: { slug: `push-test-${randomUUID()}`, name: 'Push Test City', isEnabled: true } });
    cityId = city.id;
    const round = await app.prisma.round.create({ data: {
      slug: `push-test-${randomUUID()}`, name: 'Push Test Round', rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version,
      status: 'ACTIVE', startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 7 * 86400000),
    } });
    roundId = round.id;
    for (let i = 0; i < 2; i++) {
      const player = await app.prisma.roundPlayer.create({ data: {
        ...classicOgV01.round.startingPlayer, accountId: accounts[i]!.id, roundId, cityId, publicPimpId: 7501 + i,
        displayName: `Push Player ${i}`, lastTurnCalculationAt: new Date(),
      } });
      players.push(player.id);
    }
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.account.deleteMany({ where: { id: { in: accounts.map((a) => a.id) } } });
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (cityId) await app.prisma.city.delete({ where: { id: cityId } });
    await app.close();
  });

  const headers = (i: number) => ({ cookie: accounts[i]!.cookie, origin: new URL(env.frontendOrigin).origin });
  const call = (i: number, method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api/notifications${url}`, headers: headers(i), ...(payload ? { payload } : {}) });

  it('saves categories and channels, and manages devices', async () => {
    expect((await app.inject({ url: '/api/notifications/settings' })).statusCode).toBe(401);

    const initial = await call(0, 'GET', '/settings');
    expect(initial.statusCode, initial.body).toBe(200);
    expect(initial.json()).toEqual({
      categories: { attacks: false, turns: false, round: false, rank: false, turf: false, alliance: false },
      channels: { discord: true, push: false },
      discordLinked: false,
      push: { available: true, vapidPublicKey: env.push.publicKey, devices: [] },
    });

    const updated = await call(0, 'PUT', '/settings', { categories: { attacks: true, turns: true }, channels: { discord: false } });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({ categories: { attacks: true, turns: true, round: false, rank: false, turf: false, alliance: false }, channels: { discord: false, push: false } });
    expect((await call(0, 'PUT', '/settings', { categories: { weather: true } })).statusCode).toBe(400);

    const rejected = await call(0, 'POST', '/push/subscriptions', { endpoint: 'https://example.com/steal', keys });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.code).toBe('PUSH_ENDPOINT_REJECTED');

    // Subscribing switches push on.
    const shared = endpoint();
    const subscribed = await call(0, 'POST', '/push/subscriptions', { endpoint: shared, keys, label: 'Test phone' });
    expect(subscribed.statusCode, subscribed.body).toBe(200);
    expect(subscribed.json().channels.push).toBe(true);
    expect(subscribed.json().push.devices).toMatchObject([{ label: 'Test phone' }]);

    // The same browser signing in as someone else follows that account.
    await call(1, 'POST', '/push/subscriptions', { endpoint: shared, keys });
    expect((await call(0, 'GET', '/settings')).json().push.devices).toEqual([]);
    const moved = (await call(1, 'GET', '/settings')).json().push.devices as Array<{ id: string }>;
    expect(moved).toHaveLength(1);

    expect((await call(0, 'DELETE', `/push/subscriptions/${moved[0]!.id}`)).statusCode).toBe(404);
    expect((await call(1, 'POST', '/push/forget', { endpoint: shared })).statusCode).toBe(200);
    expect((await call(1, 'GET', '/settings')).json().push.devices).toEqual([]);

    await app.prisma.pushSubscription.createMany({ data: Array.from({ length: 10 }, () => ({ accountId: accounts[0]!.id, endpoint: endpoint(), ...keys })) });
    const capped = await call(0, 'POST', '/push/subscriptions', { endpoint: endpoint(), keys });
    expect(capped.statusCode).toBe(409);
    expect(capped.json().error.code).toBe('PUSH_DEVICE_LIMIT');
    await app.prisma.pushSubscription.deleteMany({ where: { accountId: accounts[0]!.id } });
  });

  it('collects push alerts only for players who can receive them, and sends each once', async () => {
    const switches = { discord: false, push: true };
    const device = endpoint();
    await PushService.subscribe(app.prisma, accounts[0]!.id, { endpoint: device, keys }, null);
    // Account 1 wants attack alerts but has no device.
    await app.prisma.notificationSettings.upsert({
      where: { accountId: accounts[1]!.id },
      create: { accountId: accounts[1]!.id, attacksEnabled: true, pushEnabled: true },
      update: { attacksEnabled: true, pushEnabled: true },
    });
    await NotificationService.collect(app.prisma, new Date(), switches);

    const battle = (attacker: number, defender: number) => app.prisma.raidBattle.create({ data: {
      attackerId: players[attacker]!, defenderId: players[defender]!, actionId: randomUUID(), attackingThugs: 1, modelVersion: 'test',
      calculation: {}, attackerReport: { kind: 'RAID', won: true }, defenderReport: { kind: 'RAID', won: false },
    } });
    const hit = await battle(1, 0);
    const unreachable = await battle(0, 1);
    await NotificationService.collect(app.prisma, new Date(), switches);
    await NotificationService.collect(app.prisma, new Date(), switches);

    const rows = await app.prisma.notificationOutbox.findMany({ where: { accountId: { in: accounts.map((a) => a.id) }, category: 'attacks' } });
    expect(rows.map((row) => [row.accountId, row.channel, row.dedupeKey])).toEqual([
      [accounts[0]!.id, 'PUSH', `battle:${hit.id}:${accounts[0]!.id}:PUSH`],
    ]);
    expect(rows.some((row) => row.dedupeKey.includes(unreachable.id))).toBe(false);

    const sent: Array<{ endpoint: string; body: { title: string; url: string } }> = [];
    const sender = async (subscription: { endpoint: string }, body: string) => {
      sent.push({ endpoint: subscription.endpoint, body: JSON.parse(body) });
    };
    await PushService.deliverPending(app.prisma, sender);
    await PushService.deliverPending(app.prisma, sender);
    expect(sent.filter((entry) => entry.endpoint === device)).toEqual([
      { endpoint: device, body: expect.objectContaining({ title: 'Raid against you', url: new URL('/game/combat', env.frontendOrigin).toString() }) },
    ]);
    expect((await app.prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: device } })).lastSuccessAt).not.toBeNull();

    // The push service says the device is gone: forget it.
    await battle(1, 0);
    await NotificationService.collect(app.prisma, new Date(), switches);
    await PushService.deliverPending(app.prisma, async () => {
      throw Object.assign(new Error('Gone'), { statusCode: 410 });
    });
    expect(await app.prisma.pushSubscription.findUnique({ where: { endpoint: device } })).toBeNull();
  });
});
