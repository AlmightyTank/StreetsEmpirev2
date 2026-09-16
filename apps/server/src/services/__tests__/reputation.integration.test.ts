import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

/**
 * Reputation through the real HTTP layer, against the dev database.
 *
 * Opt in with REPUTATION_INTEGRATION=1. Only this test's account is touched,
 * and its cascaded player, standing and activity rows go with it.
 */
describe.runIf(process.env.REPUTATION_INTEGRATION === '1')('reputation API with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId: string | undefined;
  let playerId: string;
  let cookie: string;
  let roundId: string | undefined;

  const rules = classicOgV01;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const name = `rep_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    expect(registered.statusCode).toBe(201);
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');

    const { RoundService } = await import('../round.service.js');
    const { ReputationService } = await import('../reputation.service.js');
    const { startingStock } = await import('@streets/rules-engine');

    // Its own v0.1 round, so the favours under test do not depend on which
    // ruleset the dev database's current round happens to use.
    const round = await app.prisma.round.create({ data: {
      name: 'Reputation integration fixture', slug: `rep-test-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    const city = await app.prisma.city.findUniqueOrThrow({
      where: { slug: rules.round.startingCitySlug },
    });

    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        accountId: accountId!,
        roundId: round.id,
        cityId: city.id,
        publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
        displayName: name,
        cashCents: 500_000n,
        ...startingStock(rules),
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app.close();
  });

  const summary = async () =>
    (await app.inject({ method: 'GET', url: '/api/game/reputation', headers: { cookie } })).json();

  const doFavour = (trader: string, actionId = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: '/api/game/reputation/quest',
      headers: { cookie },
      payload: { trader, actionId },
    });

  it('starts a new player a stranger to everybody', async () => {
    const body = await summary();

    expect(body.totalRep).toBe(0);
    expect(body.traders).toHaveLength(4);
    for (const trader of body.traders) {
      expect(trader.standing).toBe('Stranger');
      expect(trader.restockSpeedup).toBe(0);
      expect(trader.quest.done).toBe(false);
    }
    expect(body.unlocks.every((unlock: { unlocked: boolean }) => !unlock.unlocked)).toBe(true);
  });

  it('refuses a favour the player has not actually done', async () => {
    const response = await doFavour('CHARLIE');

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('QUEST_INCOMPLETE');
  });

  it('blocks Tommy on crew size even when the rock is on hand', async () => {
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { crack: 500, thugs: 0 },
    });

    const response = await doFavour('TOMMY');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('QUEST_BLOCKED');
  });

  it('takes the goods, pays the standing, and does it once', async () => {
    const goal = rules.quests.TOMMY.goal as { crack: number; thugs: number };
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { crack: goal.crack, thugs: goal.thugs },
    });

    // Duplicate submits are one favour, per section 52.
    const actionId = randomUUID();
    const [first, second] = await Promise.all([doFavour('TOMMY', actionId), doFavour('TOMMY', actionId)]);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(first.json()).toEqual(second.json());

    expect(first.json().result).toMatchObject({
      trader: 'TOMMY',
      reputationGained: rules.reputation.questPoints,
      crackDelivered: goal.crack,
    });

    // One favour is exactly the shotgun gate, and access arrives with it
    // rather than needing a second request.
    expect(first.json().result.unlocked).toContain(rules.weapons.SHOTGUN.name);

    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.crack).toBe(0);

    const body = await summary();
    const tommy = body.traders.find((t: { trader: string }) => t.trader === 'TOMMY');
    expect(tommy.points).toBe(rules.reputation.questPoints);
    expect(tommy.quest.done).toBe(true);

    // And never a second time.
    expect((await doFavour('TOMMY')).json().error.code).toBe('QUEST_DONE');
  });

  it('turns standing into a shorter wait at that shop only', async () => {
    // Tommy is a Regular now; nobody else has moved.
    const body = await summary();
    const tommy = body.traders.find((t: { trader: string }) => t.trader === 'TOMMY');
    const clerk = body.traders.find((t: { trader: string }) => t.trader === 'CORNER');

    expect(tommy.restockSpeedup).toBeGreaterThan(0);
    expect(clerk.restockSpeedup).toBe(0);

    const stores = (
      await app.inject({ method: 'GET', url: '/api/game/stores', headers: { cookie } })
    ).json();
    const shopFor = (key: string) =>
      stores.stores.find((store: { key: string }) => store.key === key);

    // The wait is shorter; the shelf still holds exactly what it always did.
    const shotgun = shopFor('TOMMY').items.find((i: { key: string }) => i.key === 'SHOTGUN');
    expect(shotgun.restock.intervalMinutes).toBeLessThan(rules.weapons.SHOTGUN.restock!.intervalMinutes);
    expect(shotgun.restock.cap).toBe(rules.weapons.SHOTGUN.restock!.cap);

    const condoms = shopFor('CORNER').items.find((i: { key: string }) => i.key === 'CONDOM');
    expect(condoms.restock.intervalMinutes).toBe(
      rules.stores.CORNER.items.CONDOM!.restock!.intervalMinutes,
    );

    expect(shopFor('TOMMY').standing).toBe('Regular');
    expect(shopFor('CORNER').standing).toBe('Stranger');
  });

  it('offers each favour where its trader is, and only theirs', async () => {
    // A favour is done in the shop, the same way Tommy's always was, so every
    // store carries exactly one and it is that trader's own.
    const stores = (
      await app.inject({ method: 'GET', url: '/api/game/stores', headers: { cookie } })
    ).json();

    for (const store of stores.stores) {
      expect(store.quest.key).toBe(store.key);
      expect(store.quest.title).toBe(rules.quests[store.key as keyof typeof rules.quests].title);
    }
    expect(stores.stores).toHaveLength(4);

    // Tommy's is done; the rest are still open.
    const done = stores.stores.filter((s: { quest: { done: boolean } }) => s.quest.done);
    expect(done.map((s: { key: string }) => s.key)).toEqual(['TOMMY']);
  });

  it('takes a car for Charlie and opens nothing it should not', async () => {
    // Charlie wants a car back, which is the only favour priced in capital.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { lowRiders: 1 } });

    const response = await doFavour('CHARLIE');
    expect(response.statusCode).toBe(200);

    const result = response.json().result;
    expect(result.lowRidersHandedOver).toBe(1);
    expect(result.totalRep).toBe(rules.reputation.questPoints * 2);

    // Two favours is still short of the Tek-9, so nothing new opens here.
    expect(result.unlocked).toEqual([]);
    expect(result.totalRep).toBeLessThan(rules.weaponUnlocks.TEK9.totalRep);

    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.lowRiders).toBe(0);
    expect(state.shotgunUnlocked).toBe(true);
    expect(state.tek9Unlocked).toBe(false);
  });

  it('counts a clean shift for the clerk and resets on a short one', async () => {
    // The clerk's favour is the only one measured by how you played rather
    // than by what you hand over.
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { turns: 40, whores: 5, thugs: 5, condoms: 500, beer: 100, crack: 200, cleanShiftStreak: 0 },
    });

    const scout = () =>
      app.inject({
        method: 'POST',
        url: '/api/game/scout',
        headers: { cookie },
        payload: { district: 'WINO_SLUMS', turns: 1, actionId: randomUUID() },
      });

    expect((await scout()).statusCode).toBe(200);
    let state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.cleanShiftStreak).toBe(1);

    // Send them out with nothing and the streak is gone.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { condoms: 0 } });
    expect((await scout()).statusCode).toBe(200);
    state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.cleanShiftStreak).toBe(0);
  });

  it('counts rocks sold to Pip, and only to Pip', async () => {
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { crack: 200, rocksSuppliedToPip: 0, cashCents: 10_000_000n },
    });

    const sell = (store: string, item: string, quantity: number) =>
      app.inject({
        method: 'POST',
        url: '/api/game/stores/trade',
        headers: { cookie },
        payload: { store, item, direction: 'sell', quantity, actionId: randomUUID() },
      });

    expect((await sell('PIP', 'CRACK', 50)).statusCode).toBe(200);
    let state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.rocksSuppliedToPip).toBe(50);

    // Buying from Pip is not supplying him.
    await app.inject({
      method: 'POST',
      url: '/api/game/stores/trade',
      headers: { cookie },
      payload: { store: 'PIP', item: 'CRACK', direction: 'buy', quantity: 10, actionId: randomUUID() },
    });
    state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.rocksSuppliedToPip).toBe(50);
  });

  it('counts condoms and pistols bought, and not what is sold back', async () => {
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { cashCents: 10_000_000n, condomsBought: 0, pistolsBought: 0 },
    });
    const trade = (store: string, item: string, direction: string, quantity: number) =>
      app.inject({
        method: 'POST',
        url: '/api/game/stores/trade',
        headers: { cookie },
        payload: { store, item, direction, quantity, actionId: randomUUID() },
      });

    let response = await trade('CORNER', 'CONDOM', 'buy', 25);
    expect(response.statusCode, response.body).toBe(200);
    response = await trade('TOMMY', 'PISTOL', 'buy', 2);
    expect(response.statusCode, response.body).toBe(200);
    let state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect([state.condomsBought, state.pistolsBought]).toEqual([25, 2]);

    response = await trade('TOMMY', 'PISTOL', 'sell', 1);
    expect(response.statusCode, response.body).toBe(200);
    state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.pistolsBought).toBe(2);
  });
});
