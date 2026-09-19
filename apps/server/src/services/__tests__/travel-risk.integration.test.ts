import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV05C } from '@streets/rulesets';
import { calculateNetWorthCents, fillMarket, marketView, saleHeat, settlePush, startingStock } from '@streets/rules-engine';
import type { GameActionResult, RunTradeResult, TravelDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { ScoutService } from '../scout.service.js';
import { TravelService } from '../travel.service.js';

/**
 * 0.5.0-C gate, live: the high market is one price the whole round shares, and two runs
 * selling into it at once line up rather than both selling at the old price; a trade
 * whose price moved past the tolerance is refused; buying and selling the same units
 * back loses; a leg is rolled for a police stop once, however often the run is read; an
 * arrest on a run takes the trunk and sends it home; an arrest at home locks the player
 * out. Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('markets and risk with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV05C;
  const market = rules.travel.market;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Travel risk fixture', slug: `travel-risk-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (let index = 0; index < 2; index++) {
      const name = `risk_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[index]!, cityId, displayName: name, publicPimpId: 7500 + index,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.highMarket.deleteMany({ where: { roundId } });
    await app.prisma.run.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.cityShelf.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.citySighting.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: { in: players } } });
    for (const id of players) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 50, thugs: 30, woundedThugs: 0, pistols: 30, beer: 500, condoms: 5_000, crack: 1_000, lowRiders: 3,
        turns: 144, cashCents: 50_000_000n, heat: 0, lockedUntil: null, awayNetWorthCents: 0n, cityId,
        lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
      await app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, id, rules, { COCAINE: 400 }));
    }
  });

  const post = (player: number, url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[player]! }, payload });
  const get = (player: number, url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[player]! } });
  const row = (player: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[player]! } });
  const stock = (player: number) => ProductInventoryService.read(app.prisma, players[player]!, rules);
  const activeRun = (player: number) => app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: players[player]!, status: 'ACTIVE' }, include: { cargo: true, stops: true } });
  /** Move a player's run clock: every stop shifts `minutes` into the past. */
  const age = async (player: number, minutes: number) => {
    const run = await activeRun(player);
    for (const stop of run.stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: {
        departAt: new Date(stop.departAt.getTime() - minutes * 60_000),
        arriveAt: new Date(stop.arriveAt.getTime() - minutes * 60_000),
        leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - minutes * 60_000) : null,
      } });
    }
  };
  /** A run in Detroit, in town, with cocaine and cash. */
  const inDetroit = async (player: number, payload: Record<string, unknown> = {}) => {
    const sent = await post(player, '/travel/launch', {
      to: 'detroit', route: 0, lowRiders: 2, escortThugs: 0, cashCents: 20_000_000, cargo: { COCAINE: 400 }, actionId: randomUUID(), ...payload,
    });
    expect(sent.statusCode, sent.body).toBe(200);
    await age(player, 51);
  };
  const sell = (player: number, payload: Record<string, unknown> = {}) =>
    post(player, '/travel/trade', { product: 'COCAINE', direction: 'sell', venue: 'market', quantity: 200, actionId: randomUUID(), ...payload });

  it('is one price the round shares: two runs selling at once line up, and the second gets less', async () => {
    await inDetroit(0);
    await inDetroit(1);
    const now = new Date();
    const view = marketView(rules, roundId, 'detroit', 'COCAINE', 0, now)!;
    const [a, b] = await Promise.all([sell(0), sell(1)]);
    expect(a.statusCode, a.body).toBe(200);
    expect(b.statusCode, b.body).toBe(200);
    const totals = [a, b].map((response) => response.json<GameActionResult<RunTradeResult>>().result.totalCents).sort((x, y) => y - x);
    // The first in line sold into a fresh market; the second into the first's push.
    const first = fillMarket(view, market, 'sell', 200);
    const second = fillMarket({ ...view, push: first.pushAfter }, market, 'sell', 200);
    expect(totals[0]).toBeGreaterThan(totals[1]!);
    expect(Math.abs(totals[0]! - Number(first.totalCents))).toBeLessThan(Number(first.totalCents) * 0.01);
    expect(Math.abs(totals[1]! - Number(second.totalCents))).toBeLessThan(Number(second.totalCents) * 0.01);
    const stored = await app.prisma.highMarket.findUniqueOrThrow({ where: { roundId_city_productKey: { roundId, city: 'detroit', productKey: 'COCAINE' } } });
    expect(settlePush(stored, market, now)).toBeCloseTo(second.pushAfter, 4);
    // Selling drew Heat by Detroit's police pressure.
    expect((await row(0)).heat).toBe(saleHeat(rules, 'detroit', a.json<GameActionResult<RunTradeResult>>().result.totalCents));
  });

  it('refuses a trade whose price moved past the tolerance, and changes nothing', async () => {
    await inDetroit(0);
    const page = (await get(0, '/travel')).json<TravelDto>();
    const quoted = page.run!.counter!.products.find((product) => product.key === 'COCAINE')!.market!;
    // Detroit moves 1% per 500 units: 1,500 sold moves it past the 2% tolerance.
    await app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, players[1]!, rules, { COCAINE: 1_100 }));
    await inDetroit(1, { cargo: { COCAINE: 1_500 } });
    expect((await sell(1, { quantity: 1_500 })).statusCode).toBe(200);
    const before = await activeRun(0);
    const moved = await sell(0, { quoteCents: quoted.sellCents });
    expect(moved.json().error.code).toBe('PRICE_MOVED');
    const after = await activeRun(0);
    expect(after.cashCents).toBe(before.cashCents);
    expect(after.cargo.find((entry) => entry.productKey === 'COCAINE')!.quantity).toBe(400);
    // The price it was quoted at the moment is fine.
    const fresh = (await get(0, '/travel')).json<TravelDto>().run!.counter!.products.find((product) => product.key === 'COCAINE')!.market!;
    expect((await sell(0, { quoteCents: fresh.sellCents })).statusCode).toBe(200);
  });

  it('loses money buying and selling the same units back', async () => {
    await inDetroit(0, { cargo: {} });
    const start = (await activeRun(0)).cashCents;
    expect((await post(0, '/travel/trade', { product: 'HEROIN', direction: 'buy', venue: 'market', quantity: 500, actionId: randomUUID() })).statusCode).toBe(200);
    expect((await post(0, '/travel/trade', { product: 'HEROIN', direction: 'sell', venue: 'market', quantity: 500, actionId: randomUUID() })).statusCode).toBe(200);
    const run = await activeRun(0);
    expect(run.cashCents).toBeLessThan(start);
    expect(run.cargo.find((entry) => entry.productKey === 'HEROIN')!.quantity).toBe(0);
  });

  it('rolls each leg for a police stop once, however often the run is read, and never loses track of anything', async () => {
    // A heavy load on the worst road, at high Heat, so stops come up.
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { heat: 95 } });
    await app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, players[0]!, rules, { COCAINE: 1_000 }));
    const sent = await post(0, '/travel/launch', { to: 'miami-beach', route: 0, lowRiders: 2, escortThugs: 0, cashCents: 5_000_000, cargo: { COCAINE: 1_400 }, actionId: randomUUID() });
    expect(sent.statusCode, sent.body).toBe(200);
    const runId = (await activeRun(0)).id;
    await age(0, 100);
    for (let i = 0; i < 3; i++) expect((await get(0, '/travel')).statusCode).toBe(200);
    const run = await activeRun(0);
    expect(run.roadChecks).toBe(1);
    const incidents = await app.prisma.runIncident.findMany({ where: { runId } });
    expect(incidents.length).toBeLessThanOrEqual(1);
    const seized = incidents.reduce((sum, incident) => sum + ((incident.seized as Record<string, number>).COCAINE ?? 0), 0);
    const fines = incidents.reduce((sum, incident) => sum + incident.fineCents, 0n);
    expect(run.cargo.find((entry) => entry.productKey === 'COCAINE')!.quantity + seized).toBe(1_400);
    expect(run.cashCents + fines).toBe(5_000_000n);
    const player = await row(0);
    expect(player.netWorthCents).toBe(calculateNetWorthCents({ ...player, products: await stock(0) }, rules));
  });

  it('arrests a run at high Heat: the trunk goes, part of the wallet goes, and it drives home', async () => {
    await inDetroit(0);
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { heat: 100, lastTurnCalculationAt: new Date() } });
    const traded = await TravelService.trade(app.prisma, players[0]!, { product: 'COCAINE', direction: 'sell', venue: 'pip', quantity: 10, actionId: randomUUID() }, () => 0);
    expect(traded.result.trouble?.kind).toBe('ARREST');
    const run = await activeRun(0);
    expect(run.cargo.every((entry) => entry.quantity === 0)).toBe(true);
    const page = (await get(0, '/travel')).json<TravelDto>();
    expect(page.run!.position.phase).toBe('road');
    expect(page.run!.position.city).toBe('new-york-city');
    expect(page.run!.incidents.map((incident) => incident.kind)).toEqual(['ARREST']);
    expect((await row(0)).heat).toBeLessThan(100);
  });

  it('locks a player up after an arrest at home, and nothing moves until they are out', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { heat: 100, lastTurnCalculationAt: new Date() } });
    const trip = await ScoutService.scout(app.prisma, players[0]!, { district: 'WINO_SLUMS', turns: 1, actionId: randomUUID() }, () => 0);
    expect(trip.result.heat?.arrested).toBe(true);
    const player = await row(0);
    expect(player.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 100 * 60_000);
    const refused = await post(0, '/travel/launch', { to: 'detroit', route: 0, lowRiders: 1, escortThugs: 0, cashCents: 0, cargo: {}, actionId: randomUUID() });
    expect(refused.json().error.code).toBe('LOCKED_UP');
    const heat = (await get(0, '/heat')).json();
    expect(heat.lockedUntil).not.toBeNull();
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { lockedUntil: new Date(Date.now() - 1_000) } });
    expect((await post(0, '/travel/launch', { to: 'detroit', route: 0, lowRiders: 1, escortThugs: 0, cashCents: 0, cargo: {}, actionId: randomUUID() })).statusCode).toBe(200);
  });

  it('shows the street wire and never a price from a city the crew has not seen', async () => {
    const page = (await get(0, '/travel')).json<TravelDto>();
    expect(Array.isArray(page.wire)).toBe(true);
    for (const item of page.wire) {
      expect(new Date(item.at).getTime()).toBeLessThanOrEqual(Date.now());
      expect(item.text).not.toMatch(/\d/);
    }
    expect(page.cities.find((city) => city.slug === 'miami-beach')!.counter).toBeNull();
    expect(page.rules.market).toEqual({ spread: rules.travel.highMarketSpread, quoteTolerance: market.quoteTolerance });
  });
});
