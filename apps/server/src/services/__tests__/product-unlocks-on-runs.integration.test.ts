import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV14E } from '@streets/rulesets';
import { liveCounter, startingStock } from '@streets/rules-engine';
import { PermanentUnlockService } from '../permanent-unlock.service.js';
import { ReputationService } from '../reputation.service.js';
import { TravelService } from '../travel.service.js';

const ruleset = classicOgV14E;

/**
 * A product's purchase unlock holds at Pip's counter in every city, not just at home. The high
 * markets sell it to anyone at the market's own price, on a run and as a run loads up. Selling
 * stays open. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('product unlocks on runs with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function inDetroit() {
    const round = await app.prisma.round.create({
      data: {
        name: 'Unlocks on runs', slug: 'unlock-runs-' + randomUUID(),
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer, ...startingStock(ruleset),
        lowRiders: 2, cashCents: 50_000_000n, turns: 144, heat: 0, lastTurnCalculationAt: new Date(),
        roundId: round.id, accountId, cityId: city.id,
        displayName: 'unlock_' + randomUUID().slice(0, 6), publicPimpId: 9990 + roundIds.length,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
    await TravelService.launch(app.prisma, player.id, { to: 'detroit', route: 0, lowRiders: 2, escortThugs: 0, cashCents: 20_000_000, cargo: {}, actionId: randomUUID() });
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, include: { stops: true } });
    const back = run.stops[0]!.arriveAt.getTime() - Date.now() + 60_000;
    for (const stop of run.stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: {
        departAt: new Date(stop.departAt.getTime() - back), arriveAt: new Date(stop.arriveAt.getTime() - back),
        leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - back) : null,
      } });
    }
    // A product that needs an unlock and that Pip has on his Detroit shelf right now.
    const locked = await PermanentUnlockService.lockedProducts(app.prisma, player.id, ruleset);
    const product = [...locked.keys()].find((key) => {
      const counter = liveCounter(ruleset, round.id, 'detroit', key, new Date());
      return counter && counter.supply !== 'OUT';
    })!;
    return { player, run, product, unlock: locked.get(product)! };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'unlock_' + randomUUID().slice(0, 6);
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: name + '@example.invalid', password: randomUUID() } });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('refuses a locked product at Pip\'s counter in another city, but sells it on the market there', async () => {
    const { player, run, product } = await inDetroit();
    expect(product).toBeTruthy();
    await expect(TravelService.trade(app.prisma, player.id, { runId: run.id, product, direction: 'buy', venue: 'pip', quantity: 1, actionId: randomUUID() }, () => 0.99))
      .rejects.toMatchObject({ code: 'PRODUCT_PURCHASE_LOCKED' });
    expect((await app.prisma.runCargo.findFirst({ where: { runId: run.id, productKey: product } }))?.quantity ?? 0).toBe(0);
    const page = await TravelService.page(app.prisma, player.id);
    expect(page.lockedProducts?.map((entry) => entry.key)).toContain(product);

    const market = await TravelService.trade(app.prisma, player.id, { runId: run.id, product, direction: 'buy', venue: 'market', quantity: 3, actionId: randomUUID() }, () => 0.99);
    expect(market.result).toMatchObject({ venue: 'market', held: 3 });
  });

  it('lets the same buy through once the product is unlocked, and never stops a sale', async () => {
    const { player, run, product, unlock } = await inDetroit();
    await app.prisma.playerUnlock.create({ data: { roundPlayerId: player.id, key: unlock.key, sourceQuestKey: 'TEST' } });
    const bought = await TravelService.trade(app.prisma, player.id, { runId: run.id, product, direction: 'buy', venue: 'pip', quantity: 2, actionId: randomUUID() }, () => 0.99);
    expect(bought.result.held).toBe(2);
    await app.prisma.playerUnlock.deleteMany({ where: { roundPlayerId: player.id } });
    const sold = await TravelService.trade(app.prisma, player.id, { runId: run.id, product, direction: 'sell', venue: 'pip', quantity: 2, actionId: randomUUID() }, () => 0.99);
    expect(sold.result.held).toBe(0);
  });

  it('sells a locked product on the home market as a run loads up', async () => {
    const { player, product } = await inDetroit();
    // Bring the first run's cars home so a second can load up.
    await app.prisma.run.updateMany({ where: { roundPlayerId: player.id }, data: { status: 'RETURNED', returnedAt: new Date() } });
    await app.prisma.roundPlayer.update({ where: { id: player.id }, data: { lowRiders: 2 } });
    await TravelService.launch(app.prisma, player.id, { to: 'detroit', route: 0, lowRiders: 1, escortThugs: 0, cashCents: 1_000_000, cargo: {}, market: { [product]: 5 }, actionId: randomUUID() });
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, include: { cargo: true } });
    expect(run.cargo.find((row) => row.productKey === product)?.quantity).toBe(5);
  });
});
