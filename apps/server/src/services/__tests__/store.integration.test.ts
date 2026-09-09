import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

// Opt in against the local dev database. Only this test's account is changed
// and its cascaded player/session/activity data is removed afterwards.
describe.runIf(process.env.STORE_INTEGRATION === '1')('store API with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId: string | undefined;
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
    const { RoundService } = await import('../round.service.js');
    const round = await RoundService.requireCurrent(app.prisma);
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
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    if (app) await app.close();
  });

  function trade(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/game/stores/trade', headers: { cookie }, payload: {
      store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 10,
      actionId: randomUUID(), ...payload,
    } });
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

  function unlock(weapon: string, actionId = randomUUID()) {
    return app.inject({ method: 'POST', url: '/api/game/stores/unlock', headers: { cookie }, payload: { weapon, actionId } });
  }

  it('enforces weapon locks on direct purchases and displays progress', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 10_000_000n, crack: 100, thugs: 25, streetWorkTurns: 150 } });
    for (const item of ['TEK9', 'AK47']) {
      const response = await trade({ store: 'TOMMY', item, quantity: 1 });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('WEAPON_LOCKED');
    }
    const catalog = (await app.inject({ method: 'GET', url: '/api/game/stores', headers: { cookie } })).json();
    const tommy = catalog.stores.find((store: { key: string }) => store.key === 'TOMMY');
    expect(tommy.items.find((item: { key: string }) => item.key === 'TEK9')).toMatchObject({ maxBuy: 0, unlock: { workTurns: 150, canComplete: true, unlocked: false } });
    expect(tommy.items.find((item: { key: string }) => item.key === 'AK47').unlock.canComplete).toBe(false);
    expect((await unlock('AK47')).json().error.code).toBe('FAVOR_PREREQUISITE');
  });

  it('rejects ineligible favors without spending resources', async () => {
    const auth = await app.inject({ method: 'POST', url: '/api/game/stores/unlock', payload: { weapon: 'TEK9', actionId: randomUUID() } });
    expect(auth.statusCode).toBe(401);
    expect((await unlock('__proto__')).statusCode).toBe(400);
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { streetWorkTurns: 49 } });
    expect((await unlock('TEK9')).json().error.code).toBe('REPUTATION_TOO_LOW');
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { streetWorkTurns: 50, crack: 99 } });
    expect((await unlock('TEK9')).json().error.code).toBe('NOT_ENOUGH_CRACK');
    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.crack).toBe(99);
    expect(state.cashCents).toBe(10_000_000n);
    expect(state.tek9Unlocked).toBe(false);
  });

  it('completes the delivery once for duplicate submits, granting access without a free gun', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { crack: 100 } });
    const actionId = randomUUID();
    const results = await Promise.all([unlock('TEK9', actionId), unlock('TEK9', actionId)]);
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(results[0]!.json()).toEqual(results[1]!.json());
    const body = results[0]!.json();
    expect(body.result).toMatchObject({ key: 'TEK9', crackDelivered: 100, cashSpentCents: 0 });
    expect(body.after.turns).toBe(body.before.turns);
    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.tek9Unlocked).toBe(true);
    expect(state.crack).toBe(0);
    expect(state.tek9s).toBe(0);
    expect(state.cashCents).toBe(10_000_000n);
  });

  it('funds the shipment once under distinct concurrent submits and keeps access after crew losses', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { streetWorkTurns: 150, cashCents: 2_499_999n } });
    expect((await unlock('AK47')).json().error.code).toBe('NOT_ENOUGH_CASH');
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 10_000_000n } });
    const results = await Promise.all([unlock('AK47'), unlock('AK47')]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400]);
    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.cashCents).toBe(7_500_000n);
    expect(state.ak47Unlocked).toBe(true);
    expect(state.ak47s).toBe(0);
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { thugs: 0 } });
    expect((await trade({ store: 'TOMMY', item: 'AK47', quantity: 1 })).statusCode).toBe(200);
    expect((await trade({ store: 'TOMMY', item: 'TEK9', quantity: 1 })).statusCode).toBe(200);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'WEAPON_UNLOCK' } })).toBe(2);
  });

  it('sells only what Tommy has on the shelf, and starts his clock on the buy', async () => {
    const cap = classicOgV01.weapons.SHOTGUN.restock!.cap;
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { cashCents: 100_000_000n, shotgunStock: cap, shotgunStockAt: new Date() },
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

  it('credits reputation for scouting turns exactly once, even on a replay', async () => {
    // Manual 3.1 makes scouting the street work, so it is what earns the
    // reputation Tommy's gates on. A replayed action must not pay it twice.
    const actionId = randomUUID();
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { streetWorkTurns: 48, turns: 100, whores: 10, thugs: 10, condoms: 1000, beer: 100, crack: 1000 } });

    const scout = () => app.inject({ method: 'POST', url: '/api/game/scout', headers: { cookie }, payload: { district: 'CASINO', turns: 1, actionId } });
    const results = await Promise.all([scout(), scout()]);
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(results[0]!.json()).toEqual(results[1]!.json());

    const afterReplay = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(afterReplay.streetWorkTurns).toBe(49);

    const second = await app.inject({ method: 'POST', url: '/api/game/scout', headers: { cookie }, payload: { district: 'CASINO', turns: 1, actionId: randomUUID() } });
    expect(second.statusCode).toBe(200);

    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.streetWorkTurns).toBe(50);
    expect(state.tek9Unlocked).toBe(true);
    expect(state.ak47Unlocked).toBe(true);
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
      expect(fresh.streetWorkTurns).toBe(0);
      expect(fresh.tek9Unlocked).toBe(false);
      expect(fresh.ak47Unlocked).toBe(false);
    } finally { await app.prisma.round.delete({ where: { id: round.id } }); }
  });
});
