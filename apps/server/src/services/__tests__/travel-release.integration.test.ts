import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV05F } from '@streets/rulesets';
import { calculateNetWorthCents, fillMarket, marketView, settlePush, startingStock } from '@streets/rules-engine';
import type { GameActionResult, RunLaunchResult, TravelDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.5.0-F gate, live: a crew loads up on its own city's high market as it leaves. The cash
 * comes out of home stock, the product goes straight into the trunk, the market moves the
 * way any buy moves it, and nothing is conserved wrongly along the way. Nobody sells at
 * home. Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('the travel release with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  let accountId = '';
  let playerId = '';
  let cookie = '';
  const rules = classicOgV05F;
  const market = rules.travel.market;
  const HOME = rules.round.startingCitySlug;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: HOME } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Travel release fixture', slug: `travel-release-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    const name = `rel_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId, cityId, displayName: name, publicPimpId: 7600,
      reputation: { create: ReputationService.seedFor(rules) } } });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.deleteMany({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.highMarket.deleteMany({ where: { roundId } });
    await app.prisma.run.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: playerId } });
    const data = { ...rules.round.startingPlayer, ...startingStock(rules),
      whores: 50, thugs: 30, woundedThugs: 0, pistols: 30, beer: 500, condoms: 5_000, crack: 1_000, lowRiders: 3,
      turns: 144, cashCents: 50_000_000n, heat: 0, lockedUntil: null, awayNetWorthCents: 0n, cityId,
      lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
  });

  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie }, payload });
  const get = (url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie } });
  const row = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const activeRun = () => app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, include: { cargo: true, trades: true } });
  const launch = (payload: Record<string, unknown> = {}) => post('/travel/launch', {
    to: 'detroit', route: 0, lowRiders: 2, escortThugs: 0, cashCents: 1_000_000, cargo: {}, actionId: randomUUID(), ...payload,
  });

  it('buys on the home market as it loads up: home pays, the trunk fills, the price moves', async () => {
    const page = (await get('/travel')).json<TravelDto>();
    expect(page.rules.homeMarketAtLaunch).toBe(true);
    const quote = page.cities.find((city) => city.isHome)!.counter!.products.find((product) => product.key === 'COCAINE')!.market!;
    const before = await row();
    const now = new Date();
    const view = marketView(rules, roundId, HOME, 'COCAINE', 0, now)!;
    const fill = fillMarket(view, market, 'buy', 300);

    const sent = await launch({ market: { COCAINE: 300 }, marketQuotes: { COCAINE: quote.buyCents } });
    expect(sent.statusCode, sent.body).toBe(200);
    const result = sent.json<GameActionResult<RunLaunchResult>>().result;
    expect(result.market).toEqual({ COCAINE: 300 });
    // The engine prices it to the cent, so the launch spends exactly what the fill says.
    expect(result.marketCents).toBe(Number(fill.totalCents));

    const after = await row();
    expect(after.cashCents).toBe(before.cashCents - 1_000_000n - fill.totalCents);
    // It came off the market, not out of the stash: home holds no cocaine.
    expect((await ProductInventoryService.read(app.prisma, playerId, rules)).COCAINE).toBe(0);
    const run = await activeRun();
    expect(run.cargo.map((cargo) => [cargo.productKey, cargo.quantity, cargo.startQuantity])).toEqual([['COCAINE', 300, 300]]);
    expect(run.trades.map((trade) => [trade.city, trade.direction, trade.venue, trade.quantity])).toEqual([[HOME, 'buy', 'market', 300]]);

    const stored = await app.prisma.highMarket.findUniqueOrThrow({ where: { roundId_city_productKey: { roundId, city: HOME, productKey: 'COCAINE' } } });
    expect(settlePush(stored, market, now)).toBeCloseTo(fill.pushAfter, 4);
    // Stored net worth is what the row adds up to, the run's own worth included.
    expect(after.netWorthCents).toBe(calculateNetWorthCents({ ...after, products: {} }, rules));
    // Buying wholesale is not a way to make net worth: it cost more than the units are worth.
    expect(after.netWorthCents).toBeLessThan(before.netWorthCents);
  });

  it('refuses more than the car holds, more than home can pay, and a price that moved', async () => {
    const capacity = 2 * rules.travel.cargoPerLowRider;
    expect((await launch({ market: { COCAINE: capacity + 1 } })).json().error.code).toBe('TRUNK_FULL');
    expect((await launch({ cashCents: 49_000_000, market: { COCAINE: 1_000 } })).json().error.code).toBe('NOT_ENOUGH_CASH');
    // A tenth of what it says it saw: past the tolerance.
    const page = (await get('/travel')).json<TravelDto>();
    const quote = page.cities.find((city) => city.isHome)!.counter!.products.find((product) => product.key === 'COCAINE')!.market!;
    expect((await launch({ market: { COCAINE: 100 }, marketQuotes: { COCAINE: Math.round(quote.buyCents / 10) } })).json().error.code).toBe('PRICE_MOVED');
    // None of that left a run, a trade or a mark on the market.
    expect(await app.prisma.run.count({ where: { roundPlayerId: playerId } })).toBe(0);
    expect(await app.prisma.highMarket.count({ where: { roundId } })).toBe(0);
    expect((await row()).cashCents).toBe(50_000_000n);
  });
});
