import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV04B, classicOgV04C } from '@streets/rulesets';
import { bribeCentsPerPoint, startingStock } from '@streets/rules-engine';
import type { GameSnapshotDto, HeatDto, WorkSupplyPlanDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ProductionService } from '../production.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { ScoutService } from '../scout.service.js';

/**
 * 0.4.0-C gate, live: products change a trip by what they are, Heat lands from
 * the product burned, cools on the turn clock, busts a hot crew, and can be
 * bribed down. Opt in with PRODUCT_INTEGRATION=1.
 */
describe.runIf(process.env.PRODUCT_INTEGRATION === '1')('product effects and Heat with PostgreSQL', () => {
  let app: FastifyInstance;
  const rounds = { b: '', c: '' };
  const players = { b: '', c: '' };
  const cookies = { b: '', c: '' };
  const accounts: string[] = [];
  let current: 'b' | 'c' = 'c';
  const intervalMs = classicOgV04C.turns.intervalMinutes * 60_000;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const [kind, rules] of [['b', classicOgV04B], ['c', classicOgV04C]] as const) {
      const name = `heat_${kind}_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies[kind] = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
      const round = await app.prisma.round.create({ data: {
        name: `Heat fixture ${kind}`, slug: `heat-${kind}-${randomUUID()}`,
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      } });
      rounds[kind] = round.id;
      const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId: registered.json().account.id, cityId, displayName: name, publicPimpId: 7100,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players[kind] = player.id;
    }
    const pick = async () => app.prisma.round.findUniqueOrThrow({ where: { id: rounds[current] } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(pick);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(pick);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of Object.values(rounds)) if (id) await app.prisma.round.delete({ where: { id } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    current = 'c';
    for (const [kind, rules] of [['b', classicOgV04B], ['c', classicOgV04C]] as const) {
      await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: players[kind] } });
      await app.prisma.workSupplyPolicy.deleteMany({ where: { roundPlayerId: players[kind] } });
      await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: players[kind] } });
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 100, thugs: 40, pistols: 40, condoms: 5_000, beer: 5_000, medicine: 100, crack: 0, turns: 144, cashCents: 10_000_000n,
        heat: 0, whoreHappiness: 100, thugHappiness: 100, lastTurnCalculationAt: new Date(), lastActiveAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id: players[kind] }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const get = (url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[current] } });
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[current] }, payload });
  const stockUp = (products: Record<string, number>) => app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, players.c, classicOgV04C, products));
  const row = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players.c } });
  const never = () => 0.99;

  it('cools Heat on the turn clock when the player is settled', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players.c }, data: { heat: 50, lastTurnCalculationAt: new Date(Date.now() - 10 * intervalMs - 1_000) } });
    const heat = (await get('/heat')).json<HeatDto>();
    expect(heat.heat).toBe(50 - 10 * classicOgV04C.heat.decayPerInterval);
    expect((await row()).heat).toBe(heat.heat);
    expect((await get('/me')).json<GameSnapshotDto>().player.heat?.heat).toBe(heat.heat);
  });

  it('adds the Heat the preview promised, and pays Nightclub Ecstasy better than crack', async () => {
    await post('/work-supply/policy', { job: 'NIGHTCLUB', primary: 'ECSTASY' });
    await stockUp({ ECSTASY: 1_000 });
    const preview = (await get('/work-supply/preview?job=NIGHTCLUB&turns=12')).json<WorkSupplyPlanDto>();
    const expected = classicOgV04C.products.ECSTASY.effects.hoes;
    expect(preview.takeMultiplier).toBeCloseTo(expected.take * expected.jobTake.NIGHTCLUB, 10);
    const trip = await ScoutService.scout(app.prisma, players.c, { district: 'NIGHTCLUB', turns: 12, actionId: randomUUID() }, never);
    expect(trip.result.supply).toEqual(preview);
    expect(trip.result.heat).toMatchObject({ before: 0, added: Math.round(preview.heat), after: Math.round(preview.heat), busted: false });
    expect((await row()).heat).toBe(Math.round(preview.heat));
  });

  it('drags the take and busts a hot crew: product seized, cash fined, Heat burned off', async () => {
    await stockUp({ WEED: 100 });
    await app.prisma.roundPlayer.update({ where: { id: players.c }, data: { heat: 100, crack: 400 } });
    const trip = await ScoutService.scout(app.prisma, players.c, { district: 'LOW_RENT', turns: 5, actionId: randomUUID() }, () => 0);
    const heat = trip.result.heat!;
    expect(heat).toMatchObject({ before: 100, busted: true });
    expect(heat.takeMultiplier).toBeCloseTo(1 - classicOgV04C.heat.drag.maxTakePenalty, 10);
    expect(heat.seized.WEED).toBe(50);
    expect(heat.after).toBe(Math.max(0, Math.min(100, 100 + heat.added - classicOgV04C.heat.bust.heatDrop)));
    const after = await ProductInventoryService.read(app.prisma, players.c, classicOgV04C);
    expect(after.WEED).toBe(50);
    expect(after.CRACK).toBe(trip.after.resources.crack);
    const stored = await row();
    expect(stored.heat).toBe(heat.after);
    expect(Number(stored.cashCents)).toBe(trip.after.cashCents);
  });

  it('bribes Heat down at the net-worth price, and refuses what it cannot cover', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players.c }, data: { heat: 60 } });
    expect((await post('/heat/bribe', { points: 61 })).json().error.code).toBe('TOO_MANY_POINTS');
    const before = await row();
    const paid = await post('/heat/bribe', { points: 20, actionId: randomUUID() });
    expect(paid.statusCode, paid.body).toBe(200);
    const price = bribeCentsPerPoint(NetWorthService.calculate(before, classicOgV04C), classicOgV04C.heat) * 20n;
    expect(paid.json().result).toMatchObject({ points: 20, heatBefore: 60, heatAfter: 40, costCents: Number(price) });
    expect((await row()).cashCents).toBe(before.cashCents - price);

    await app.prisma.roundPlayer.update({ where: { id: players.c }, data: { cashCents: 0n } });
    expect((await post('/heat/bribe', { points: 1 })).json().error.code).toBe('NOT_ENOUGH_CASH');
  });

  it('supplies the cooks from their own policy, and Meth cooks more', async () => {
    await post('/work-supply/policy', { job: 'COOK', primary: 'METH' });
    await stockUp({ METH: 1_000 });
    const cooked = await ProductionService.produceCrack(app.prisma, players.c, { turns: 10, actionId: randomUUID() }, never);
    const cook = cooked.result.cook!;
    expect(cook).toMatchObject({ job: 'COOK', role: 'thugs', consumed: { METH: Math.ceil(40 * classicOgV04C.workSupply.productPerThugPerTurn * 10) } });
    expect(cook.takeMultiplier).toBe(classicOgV04C.products.METH.effects.thugs.output);
    expect((await ProductInventoryService.read(app.prisma, players.c, classicOgV04C)).METH).toBe(1_000 - cook.consumed.METH!);
    expect(cooked.result.heat!.added).toBe(Math.round(cook.heat + (cooked.result.supply?.heat ?? 0)));
  });

  it('counts Weed toward whore happiness', async () => {
    const dry = (await get('/me')).json<GameSnapshotDto>().player.happiness.whore;
    await stockUp({ WEED: 500 });
    const stocked = (await get('/me')).json<GameSnapshotDto>().player.happiness.whore;
    expect(stocked).toBeGreaterThan(dry);
  });

  it('leaves a 0.4.0-B round without Heat', async () => {
    current = 'b';
    expect((await get('/heat')).json().error.code).toBe('HEAT_DISABLED');
    expect((await get('/me')).json<GameSnapshotDto>().player.heat).toBeNull();
    const trip = await ScoutService.scout(app.prisma, players.b, { district: 'CASINO', turns: 12, actionId: randomUUID() }, never);
    expect(trip.result.heat).toBeUndefined();
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players.b } })).heat).toBe(0);
  });
});
