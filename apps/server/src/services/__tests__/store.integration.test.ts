import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01, classicOgV07K } from '@streets/rulesets';

// Opt in against the local dev database. Only this test's account is changed
// and its cascaded player/session/activity data is removed afterwards.
describe.runIf(process.env.STORE_INTEGRATION === '1')('store API with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId: string | undefined;
  let roundId: string | undefined;
  let playerId: string;
  let cookie: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = `store_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: {
      username: name, email: `${name}@example.invalid`, password: randomUUID(),
    } });
    expect(registered.statusCode).toBe(201);
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    // Own the round this suite depends on. The full release regression runs
    // integration suites sequentially, so Store must not depend on another
    // suite leaving a current round behind.
    const { RoundService } = await import('../round.service.js');
    const round = await app.prisma.round.create({ data: {
      name: 'Store integration fixture', slug: `store-test-${randomUUID()}`,
      rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    vi.spyOn(RoundService, 'getCurrent').mockResolvedValue(round);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: classicOgV01.round.startingCitySlug } });
    const { startingStock } = await import('@streets/rules-engine');
    const player = await app.prisma.roundPlayer.create({ data: {
      ...classicOgV01.round.startingPlayer,
      accountId: accountId!, roundId: round.id, cityId: city.id,
      publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1, displayName: name,
      cashCents: 500_000n, condoms: 0, beer: 0,
      // This fixture skips the join service, so it has to seed the shelves
      // the same way joining does.
      ...startingStock(classicOgV01),
    } });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    if (app) await app.close();
  });

  function trade(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/game/stores/trade', headers: { cookie }, payload: {
      store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 10,
      actionId: randomUUID(), ...payload,
    } });
  }

  function checkout(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/game/stores/checkout',
      headers: { cookie },
      payload,
    });
  }

  it('requires authentication and returns all four catalogs', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/game/stores' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/api/game/stores', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().stores).toHaveLength(4);
    expect(response.json().bulkHelpers).toEqual([...classicOgV01.storeBulkHelpers]);
  });

  it('buys supplies, restores happiness immediately and spends no turns', async () => {
    const response = await trade({});
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.after.resources.condoms - body.before.resources.condoms).toBe(10);
    expect(body.after.cashCents - body.before.cashCents).toBe(-1000);
    expect(body.after.whoreHappiness).toBeGreaterThan(body.before.whoreHappiness);
    expect(body.after.turns).toBe(body.before.turns);
    const beer = await trade({ item: 'BEER', quantity: 1 });
    expect(beer.json().after.thugHappiness).toBeGreaterThan(beer.json().before.thugHappiness);
    // Supplies feed happiness directly: the shelf is the whole mechanism.
    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.beer).toBeGreaterThan(0);
  });

  it('rejects malformed, cross-store, unsupported and unaffordable trades atomically', async () => {
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    for (const input of [
      { quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: '10' },
      { item: 'PISTOL' }, { item: '__proto__' }, { direction: 'sell' },
      { quantity: 2_000_000 }, { actionId: '' },
      { store: 'TOMMY', item: 'PISTOL', direction: 'sell', quantity: 1 },
    ]) expect((await trade(input)).statusCode).toBe(400);
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(after.cashCents).toBe(before.cashCents);
    expect(after.condoms).toBe(before.condoms);
  });

  it('handles simultaneous duplicate buys and sells exactly once', async () => {
    for (const direction of ['buy', 'sell']) {
      const actionId = randomUUID();
      const results = await Promise.all([1, 2].map(() => trade({ store: 'PIP', item: 'CRACK', quantity: 5, direction, actionId })));
      expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
      expect(results[0]!.json()).toEqual(results[1]!.json());
      const body = results[0]!.json();
      const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
      expect(Number(state.cashCents)).toBe(body.after.cashCents);
      expect(state.crack).toBe(body.after.resources.crack);
    }
  });

  it('prevents simultaneous distinct orders from overspending or overselling', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 100n, crack: 1 } });
    const buys = await Promise.all([1, 2].map(() => trade({ quantity: 1 })));
    expect(buys.map((result) => result.statusCode).sort()).toEqual([200, 400]);
    const sells = await Promise.all([1, 2].map(() => trade({ store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 1 })));
    expect(sells.map((result) => result.statusCode).sort()).toEqual([200, 400]);
    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.cashCents).toBe(300n);
    expect(state.crack).toBe(0);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'STORE_SELL' } })).toBe(2);
  });

  it('replays a concurrent multi-line checkout exactly once', async () => {
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { cashCents: 10_000n, condoms: 0, beer: 0 },
    });
    const actionId = randomUUID();
    const payload = {
      actionId,
      lines: [
        { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 10 },
        { store: 'CORNER', item: 'BEER', direction: 'buy', quantity: 2 },
      ],
    };

    const results = await Promise.all([checkout(payload), checkout(payload)]);
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(results[0]!.json()).toEqual(results[1]!.json());

    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const condomCents = classicOgV01.stores.CORNER.items.CONDOM!.buyCents;
    const beerCents = classicOgV01.stores.CORNER.items.BEER!.buyCents;
    expect(state.condoms).toBe(10);
    expect(state.beer).toBe(2);
    expect(Number(state.cashCents)).toBe(10_000 - (10 * condomCents) - (2 * beerCents));
  });

  it('cannot oversell one remaining shelf item through concurrent checkouts', async () => {
    const item = classicOgV01.stores.TOMMY.items.SHOTGUN!;
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: {
        cashCents: 100_000_000n,
        shotguns: 0,
        shotgunUnlocked: true,
        shotgunStock: 1,
        shotgunStockAt: new Date(),
      },
    });

    const results = await Promise.all([1, 2].map(() => checkout({
      actionId: randomUUID(),
      lines: [{ store: 'TOMMY', item: 'SHOTGUN', direction: 'buy', quantity: 1 }],
    })));
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400]);

    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.shotgunStock).toBe(0);
    expect(state.shotguns).toBe(1);
    expect(Number(state.cashCents)).toBe(100_000_000 - item.buyCents);
  });

  it('enforces weapon locks until current progression grants the access flag', async () => {
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: {
        cashCents: 10_000_000n,
        thugs: 25,
        shotgunUnlocked: false,
        tek9Unlocked: false,
        ak47Unlocked: false,
      },
    });

    for (const item of ['SHOTGUN', 'TEK9', 'AK47']) {
      const response = await trade({ store: 'TOMMY', item, quantity: 1 });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('WEAPON_LOCKED');
    }

    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { shotgunUnlocked: true },
    });
    expect((await trade({ store: 'TOMMY', item: 'SHOTGUN', quantity: 1 })).statusCode).toBe(200);
  });

  it('sells only what Tommy has on the shelf, and starts his clock on the buy', async () => {
    const cap = classicOgV01.weapons.SHOTGUN.restock!.cap;
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { cashCents: 100_000_000n, shotgunUnlocked: true, shotgunStock: cap, shotgunStockAt: new Date() },
    });

    // Cash is not the limit here; supply is.
    const overrun = await trade({ store: 'TOMMY', item: 'SHOTGUN', quantity: cap + 1 });
    expect(overrun.statusCode).toBe(400);
    expect(overrun.json().error.code).toBe('OUT_OF_STOCK');

    expect((await trade({ store: 'TOMMY', item: 'SHOTGUN', quantity: cap })).statusCode).toBe(200);

    const emptied = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(emptied.shotgunStock).toBe(0);
    expect((await trade({ store: 'TOMMY', item: 'SHOTGUN', quantity: 1 })).json().error.code)
      .toBe('OUT_OF_STOCK');

    // Back-date the clock by one interval and the whole crate is waiting -
    // deliveries fill the shelf rather than adding one.
    const interval = classicOgV01.weapons.SHOTGUN.restock!.intervalMinutes;
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { shotgunStockAt: new Date(Date.now() - interval * 60_000) },
    });
    const catalog = (await app.inject({ method: 'GET', url: '/api/game/stores', headers: { cookie } })).json();
    const shotgun = catalog.stores
      .find((store: { key: string }) => store.key === 'TOMMY')
      .items.find((item: { key: string }) => item.key === 'SHOTGUN');
    expect(shotgun.restock).toMatchObject({ stock: cap, cap });
    expect(shotgun.maxBuy).toBe(cap);
    expect((await trade({ store: 'TOMMY', item: 'SHOTGUN', quantity: cap })).statusCode).toBe(200);
  });

  it('limits Charlie the same way, and names him when he runs out', async () => {
    const rule = classicOgV01.stores.CHARLIE.items.LOW_RIDER!.restock!;
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { cashCents: 100_000_000n, lowRiderStock: rule.cap, lowRiderStockAt: new Date() },
    });

    const overrun = await trade({ store: 'CHARLIE', item: 'LOW_RIDER', quantity: rule.cap + 1 });
    expect(overrun.statusCode).toBe(400);
    expect(overrun.json().error.message).toContain('Charlie');

    expect((await trade({ store: 'CHARLIE', item: 'LOW_RIDER', quantity: rule.cap })).statusCode).toBe(200);
    const emptied = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(emptied.lowRiderStock).toBe(0);
    expect(emptied.lowRiders).toBe(rule.cap);
  });

  it('gives the pistol a shelf deep enough to arm a crew', async () => {
    const cap = classicOgV01.weapons.PISTOL.restock!.cap;
    const catalog = (await app.inject({ method: 'GET', url: '/api/game/stores', headers: { cookie } })).json();
    const pistol = catalog.stores
      .find((store: { key: string }) => store.key === 'TOMMY')
      .items.find((item: { key: string }) => item.key === 'PISTOL');

    expect(pistol.restock).toMatchObject({ cap, stock: cap });
    expect((await trade({ store: 'TOMMY', item: 'PISTOL', quantity: 40 })).statusCode).toBe(200);
  });

  it('pays the daily trade credit once a day, however much you buy', async () => {
    // Standing tracks showing up, not spending. A second trade the same day
    // adds nothing, which is what stops cash buying reputation.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 100_000_000n } });
    await app.prisma.playerReputation.updateMany({
      where: { roundPlayerId: playerId! },
      data: { points: 0, creditedOn: null },
    });

    const first = await trade({ store: 'CORNER', item: 'CONDOM', quantity: 1 });
    expect(first.json().result.reputationGained).toBe(classicOgV01.reputation.trade.pointsPerDay);

    const second = await trade({ store: 'CORNER', item: 'CONDOM', quantity: 500 });
    expect(second.json().result.reputationGained).toBe(0);

    const corner = await app.prisma.playerReputation.findUniqueOrThrow({
      where: { roundPlayerId_trader: { roundPlayerId: playerId!, trader: 'CORNER' } },
    });
    expect(corner.points).toBe(classicOgV01.reputation.trade.pointsPerDay);

    // And it is that trader only - buying condoms tells Tommy nothing.
    const tommy = await app.prisma.playerReputation.findUniqueOrThrow({
      where: { roundPlayerId_trader: { roundPlayerId: playerId!, trader: 'TOMMY' } },
    });
    expect(tommy.points).toBe(0);
  });

  it('caps passive trade standing without granting weapon access', async () => {
    const cap = classicOgV01.reputation.trade.maxPoints;
    await app.prisma.playerReputation.updateMany({
      where: { roundPlayerId: playerId! },
      data: { points: cap, creditedOn: null },
    });
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: {
        cashCents: 100_000_000n,
        shotgunUnlocked: false,
        tek9Unlocked: false,
        ak47Unlocked: false,
      },
    });

    const response = await trade({ store: 'CORNER', item: 'CONDOM', quantity: 1 });
    expect(response.json().result.reputationGained).toBe(0);

    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.shotgunUnlocked).toBe(false);
    expect(state.tek9Unlocked).toBe(false);
    expect(state.ak47Unlocked).toBe(false);
  });

  it('keeps Tommy Voucher armed through unrelated and failed trades, then consumes it on the first successful eligible buy', async () => {
    await app.prisma.round.update({
      where: { id: roundId! },
      data: { rulesetId: classicOgV07K.meta.id, rulesetVersion: classicOgV07K.meta.version },
    });
    try {
      await app.prisma.playerArmedFavor.deleteMany({ where: { roundPlayerId: playerId } });
      await app.prisma.playerFavor.upsert({
        where: { roundPlayerId_key: { roundPlayerId: playerId, key: 'TOMMY_VOUCHER' } },
        create: { roundPlayerId: playerId, key: 'TOMMY_VOUCHER', quantity: 0, totalGranted: 1 },
        update: { quantity: 0, totalGranted: 1 },
      });
      await app.prisma.playerArmedFavor.create({
        data: { roundPlayerId: playerId, category: 'MUSCLE', favorKey: 'TOMMY_VOUCHER' },
      });
      await app.prisma.roundPlayer.update({
        where: { id: playerId },
        data: {
          cashCents: 100_000_000n,
          pistolStock: classicOgV07K.weapons.PISTOL.restock!.cap,
          pistolStockAt: new Date(),
          shotgunUnlocked: true,
          shotgunStock: classicOgV07K.weapons.SHOTGUN.restock!.cap,
          shotgunStockAt: new Date(),
        },
      });

      const catalog = (await app.inject({
        method: 'GET', url: '/api/game/stores', headers: { cookie },
      })).json();
      const pistol = catalog.stores
        .find((store: { key: string }) => store.key === 'TOMMY')
        .items.find((item: { key: string }) => item.key === 'PISTOL');
      expect(pistol).toMatchObject({
        baseBuyCents: classicOgV07K.stores.TOMMY.items.PISTOL!.buyCents,
        favorDiscountPercent: 20,
      });
      expect(pistol.buyCents).toBe(Math.floor(classicOgV07K.stores.TOMMY.items.PISTOL!.buyCents * 0.8));

      // An unrelated purchase does not spend the armed voucher.
      expect((await trade({ store: 'CORNER', item: 'CONDOM', quantity: 1 })).statusCode).toBe(200);
      expect(await app.prisma.playerArmedFavor.count({
        where: { roundPlayerId: playerId, favorKey: 'TOMMY_VOUCHER' },
      })).toBe(1);

      // Nor does a failed eligible purchase.
      const failed = await trade({
        store: 'TOMMY',
        item: 'PISTOL',
        quantity: classicOgV07K.weapons.PISTOL.restock!.cap + 1,
      });
      expect(failed.statusCode).toBe(400);
      expect(await app.prisma.playerArmedFavor.count({
        where: { roundPlayerId: playerId, favorKey: 'TOMMY_VOUCHER' },
      })).toBe(1);

      // Weapon keys coming from the UI should be normalized before voucher matching.
      // This specifically protects shotgun purchases from consuming the voucher at full price.
      const bought = await trade({ store: 'tommy', item: 'shotgun', quantity: 1 });
      expect(bought.statusCode, bought.body).toBe(200);
      expect(bought.json().result).toMatchObject({
        favorKey: 'TOMMY_VOUCHER',
        favorDiscountPercent: 20,
        baseUnitCents: classicOgV07K.stores.TOMMY.items.SHOTGUN!.buyCents,
        unitCents: Math.floor(classicOgV07K.stores.TOMMY.items.SHOTGUN!.buyCents * 0.8),
      });
      expect(await app.prisma.playerArmedFavor.count({
        where: { roundPlayerId: playerId, favorKey: 'TOMMY_VOUCHER' },
      })).toBe(0);
    } finally {
      await app.prisma.playerArmedFavor.deleteMany({ where: { roundPlayerId: playerId } });
      await app.prisma.round.update({
        where: { id: roundId! },
        data: { rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version },
      });
    }
  });

  it('starts a different round with fresh reputation and locked weapons', async () => {
    const current = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const round = await app.prisma.round.create({ data: {
      name: 'Unlock isolation test', slug: randomUUID(), rulesetId: 'classic-og-v0.1', rulesetVersion: '0.1.0',
      status: 'SCHEDULED', startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 172_800_000),
    } });
    try {
      const fresh = await app.prisma.roundPlayer.create({ data: {
        accountId: accountId!, roundId: round.id, cityId: current.cityId,
        publicPimpId: 1, displayName: 'New round test',
      } });
      expect(fresh.shotgunUnlocked).toBe(false);
      expect(fresh.tek9Unlocked).toBe(false);
      expect(fresh.ak47Unlocked).toBe(false);
    } finally { await app.prisma.round.delete({ where: { id: round.id } }); }
  });
});
