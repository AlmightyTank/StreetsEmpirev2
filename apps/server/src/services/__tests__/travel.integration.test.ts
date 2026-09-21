import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV05B } from '@streets/rulesets';
import { calculateNetWorthCents, cityCounter, runCapacity, startingStock } from '@streets/rules-engine';
import type { GameActionResult, RunLaunchResult, RunMoveResult, RunTradeResult, TravelDto, TravelRoutesDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.5.0-B gate, live: a run takes cash, cars, escorts and cargo out of home stock and
 * brings back exactly what it holds; it never spends more than it carries; its route
 * preview matches what launching charges; and it settles the same however often it
 * is read. Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('runs with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV05B;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Travel fixture', slug: `travel-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    const name = `travel_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accounts.push(registered.json().account.id);
    cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId: accounts[0]!, cityId, displayName: name, publicPimpId: 7400,
      reputation: { create: ReputationService.seedFor(rules) } } });
    players.push(player.id);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.run.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.cityShelf.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.citySighting.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    const data = { ...rules.round.startingPlayer, ...startingStock(rules),
      whores: 50, thugs: 30, woundedThugs: 0, pistols: 30, beer: 500, condoms: 5_000, crack: 1_000, lowRiders: 3,
      turns: 144, cashCents: 50_000_000n, heat: 0, awayNetWorthCents: 0n, cityId,
      lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    await app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, players[0]!, rules, { COCAINE: 200 }));
  });

  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[0]! }, payload });
  const get = (url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[0]! } });
  const row = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[0]! } });
  const stock = () => ProductInventoryService.read(app.prisma, players[0]!, rules);
  /** Move a run's clock: every stop shifts `minutes` into the past, as if that long went by. */
  const age = async (minutes: number) => {
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: players[0]!, status: 'ACTIVE' }, include: { stops: true } });
    for (const stop of run.stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: {
        departAt: new Date(stop.departAt.getTime() - minutes * 60_000),
        arriveAt: new Date(stop.arriveAt.getTime() - minutes * 60_000),
        leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - minutes * 60_000) : null,
      } });
    }
  };
  const launch = (payload: Record<string, unknown> = {}) => post('/travel/launch', {
    to: 'detroit', route: 0, lowRiders: 2, escortThugs: 6, cashCents: 1_000_000, cargo: { CRACK: 300, COCAINE: 50 }, actionId: randomUUID(), ...payload,
  });

  it('loads a run out of home stock, charges what the route preview said, and keeps net worth whole', async () => {
    const before = await row();
    const beforeWorth = calculateNetWorthCents({ ...before, products: await stock() }, rules);
    const preview = (await get('/travel/routes?to=detroit')).json<TravelRoutesDto>();
    expect(preview.routes[0]).toMatchObject({ turns: 10, driveHours: 10 });

    const sent = await launch();
    expect(sent.statusCode, sent.body).toBe(200);
    const result = sent.json<GameActionResult<RunLaunchResult>>();
    expect(result.result.turns).toBe(preview.routes[0]!.turns);
    expect(Math.abs(new Date(result.result.arriveAt).getTime() - new Date(preview.routes[0]!.arriveAt).getTime())).toBeLessThan(10_000);

    const after = await row();
    expect(after.turns).toBe(before.turns - 10);
    expect(after.cashCents).toBe(before.cashCents - 1_000_000n);
    expect(after.lowRiders).toBe(1);
    expect(after.thugs).toBe(24);
    expect(after.crack).toBe(700);
    expect((await stock()).COCAINE).toBe(150);
    // Nothing is created or lost by leaving: the run is worth what left.
    expect(after.netWorthCents).toBe(beforeWorth);
    expect(after.awayNetWorthCents).toBeGreaterThan(0n);
  });

  it('refuses a second run, too many escorts, an overfull trunk and cash you do not have', async () => {
    expect((await launch({ escortThugs: 13 })).json().error.code).toBe('TOO_MANY_ESCORTS');
    expect((await launch({ cargo: { CRACK: runCapacity(rules, 2) + 1 } })).json().error.code).toBe('NOT_ENOUGH_PRODUCT');
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { crack: 5_000 } });
    expect((await launch({ cargo: { CRACK: runCapacity(rules, 2) + 1 } })).json().error.code).toBe('TRUNK_FULL');
    expect((await launch({ cashCents: 60_000_000 })).json().error.code).toBe('NOT_ENOUGH_CASH');
    expect((await launch({ to: 'new-york-city' })).json().error.code).toBe('ALREADY_HOME');
    expect((await launch()).statusCode).toBe(200);
    // 0.6.0-D introduced the Garage/run-limit layer. On a one-run ruleset the
    // second launch is rejected by that shared limit before another car check.
    expect((await launch()).json().error.code).toBe('RUN_LIMIT');
  });

  it('replays a launch by its action id instead of sending a second run', async () => {
    const actionId = randomUUID();
    const first = await launch({ actionId });
    const again = await launch({ actionId });
    expect(again.json()).toEqual(first.json());
    expect(await app.prisma.run.count({ where: { roundPlayerId: players[0]! } })).toBe(1);
  });

  it('trades only in town, only from the run\'s wallet and trunk, and remembers what it saw', async () => {
    await launch({ cashCents: 100_000 });
    expect((await post('/travel/trade', { product: 'CRACK', direction: 'buy', quantity: 1, actionId: randomUUID() })).json().error.code).toBe('NOT_IN_TOWN');

    await age(51);
    const price = cityCounter(rules, 'detroit', 'CRACK')!;
    const tooMuch = await post('/travel/trade', { product: 'CRACK', direction: 'buy', quantity: Math.floor(100_000 / price.buyCents) + 1, actionId: randomUUID() });
    expect(tooMuch.json().error.code).toBe('NOT_ENOUGH_CASH');

    const homeBefore = await row();
    const bought = await post('/travel/trade', { product: 'CRACK', direction: 'buy', quantity: 100, actionId: randomUUID() });
    expect(bought.statusCode, bought.body).toBe(200);
    expect(bought.json<GameActionResult<RunTradeResult>>().result).toMatchObject({ runCashCents: 100_000 - 100 * price.buyCents, held: 400, shelfStock: price.shelfCap - 100 });
    // Home cash is never touched by a run's trade.
    expect((await row()).cashCents).toBe(homeBefore.cashCents);

    const sold = await post('/travel/trade', { product: 'COCAINE', direction: 'sell', quantity: 50, actionId: randomUUID() });
    expect(sold.statusCode, sold.body).toBe(200);
    expect((await post('/travel/trade', { product: 'COCAINE', direction: 'sell', quantity: 1, actionId: randomUUID() })).json().error.code).toBe('NOT_ENOUGH_PRODUCT');

    const page = (await get('/travel')).json<TravelDto>();
    expect(page.run!.position.phase).toBe('town');
    const detroit = page.cities.find((city) => city.slug === 'detroit')!;
    expect(detroit.counter!.seenAt).not.toBeNull();
    expect(detroit.counter!.products.find((product) => product.key === 'CRACK')!.stock).toBe(price.shelfCap - 100);
    // Cities the crew has not been to stay unknown.
    expect(page.cities.find((city) => city.slug === 'miami-beach')!.counter).toBeNull();
  });

  it('comes home with exactly what it holds, once, however often it is read', async () => {
    const before = await row();
    await launch({ cashCents: 100_000, cargo: { CRACK: 300, COCAINE: 50 } });
    await age(51);
    const price = cityCounter(rules, 'detroit', 'CRACK')!;
    await post('/travel/trade', { product: 'CRACK', direction: 'buy', quantity: 100, actionId: randomUUID() });
    const home = await post('/travel/head-home', { actionId: randomUUID() });
    expect(home.statusCode, home.body).toBe(200);
    expect(home.json<GameActionResult<RunMoveResult>>().result.city).toBe('new-york-city');

    await age(60);
    for (let i = 0; i < 3; i++) expect((await get('/travel')).statusCode).toBe(200);
    const after = await row();
    expect(after.cashCents).toBe(before.cashCents - 100n * BigInt(price.buyCents));
    expect(after.crack).toBe(1_100);
    expect(after.lowRiders).toBe(3);
    expect(after.thugs).toBe(30);
    expect(after.awayNetWorthCents).toBe(0n);
    expect((await stock()).COCAINE).toBe(200);
    expect(after.netWorthCents).toBe(calculateNetWorthCents({ ...after, products: await stock() }, rules));
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: players[0]!, type: 'RUN_RETURNED' } })).toBe(1);

    const page = (await get('/travel')).json<TravelDto>();
    expect(page.run).toBeNull();
    expect(page.lastRun).toMatchObject({ startCashCents: 100_000, cashCents: 100_000 - 100 * price.buyCents, turnsSpent: 10 });
  });

  it('drives on to another city for the extra road only', async () => {
    await launch({ to: 'miami-beach' });
    await age(96);
    const turns = (await row()).turns;
    const active = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: players[0]!, status: 'ACTIVE' } });
    // Drive-on routing is from the run's current town, not from the player's home.
    const preview = (await get(`/travel/routes?to=atlanta&runId=${encodeURIComponent(active.id)}`)).json<TravelRoutesDto>();
    const moved = await post('/travel/drive-on', { to: 'atlanta', route: 0, actionId: randomUUID() });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json<GameActionResult<RunMoveResult>>().result.turns).toBe(preview.routes[0]!.turns);
    expect((await row()).turns).toBe(turns - preview.routes[0]!.turns);
    const page = (await get('/travel')).json<TravelDto>();
    expect(page.run!.stops.map((stop) => stop.city)).toEqual(['miami-beach', 'atlanta', 'new-york-city']);
    expect(page.run!.position).toMatchObject({ phase: 'road', city: 'atlanta' });
  });
});
