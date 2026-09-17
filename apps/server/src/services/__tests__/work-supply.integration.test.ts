import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV04A, classicOgV04B } from '@streets/rulesets';
import { combatSimulationRng, startingStock } from '@streets/rules-engine';
import type { WorkSupplyDto, WorkSupplyPlanDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { ScoutService } from '../scout.service.js';

/**
 * 0.4.0-B gate: a trip that runs short part-way is charged by slice, the preview
 * matches the receipt, and a crack-only player sees no change from 0.4.0-A.
 * Opt in with PRODUCT_INTEGRATION=1.
 */
describe.runIf(process.env.PRODUCT_INTEGRATION === '1')('work supply with PostgreSQL', () => {
  let app: FastifyInstance;
  const rounds = { a: '', b: '' };
  const players = { a: '', b: '' };
  const accounts: string[] = [];
  let cookie = '';

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const [kind, rules] of [['a', classicOgV04A], ['b', classicOgV04B]] as const) {
      const name = `supply_${kind}_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      if (kind === 'b') cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
      const round = await app.prisma.round.create({ data: {
        name: `Supply fixture ${kind}`, slug: `supply-${kind}-${randomUUID()}`,
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      } });
      rounds[kind] = round.id;
      const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId: registered.json().account.id, cityId, displayName: name, publicPimpId: 7000,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players[kind] = player.id;
    }
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: rounds.b } }));
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of Object.values(rounds)) if (id) await app.prisma.round.delete({ where: { id } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  // 80 whores, fully covered and stocked, so only product differs between trips.
  beforeEach(async () => {
    for (const [kind, rules] of [['a', classicOgV04A], ['b', classicOgV04B]] as const) {
      await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: players[kind] } });
      await app.prisma.workSupplyPolicy.deleteMany({ where: { roundPlayerId: players[kind] } });
      await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: players[kind] } });
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 80, thugs: 40, pistols: 40, condoms: 5_000, beer: 5_000, medicine: 100, crack: 0, turns: 144, cashCents: 1_000_000n,
        whoreHappiness: 100, thugHappiness: 100, lastTurnCalculationAt: new Date(), lastActiveAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id: players[kind] }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const get = <T>(url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie } }).then((response) => response.json<T>());
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie }, payload });
  const stockUp = (products: Record<string, number>) => app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, players.b, classicOgV04B, products));
  // A trip rolls dice for finds, recruits and variance; a fixed seed keeps two trips comparable.
  const scout = (kind: 'a' | 'b', district: string, turns: number, seed = 42) =>
    ScoutService.scout(app.prisma, players[kind], { district, turns, actionId: randomUUID() }, combatSimulationRng(seed));

  it('lists every job with the crack-only default until a policy is set, and validates policies', async () => {
    const overview = await get<WorkSupplyDto>('/work-supply');
    expect(overview.enabled).toBe(true);
    expect(overview.jobs.map((job) => job.key)).toEqual(['CASINO', 'WINO_SLUMS', 'LOW_RENT', 'NIGHTCLUB', 'URBAN_GHETTO', 'PRODUCE']);
    expect(overview.jobs[0]).toMatchObject({ isDefault: true, policy: { primary: 'CRACK', fallback: null, emergency: null, strict: false } });

    expect((await post('/work-supply/policy', { job: 'CASINO', primary: 'ECSTASY', fallback: 'ECSTASY' })).statusCode).toBe(400);
    expect((await post('/work-supply/policy', { job: 'CASINO', primary: 'ECSTASY', emergency: 'CRACK' })).statusCode).toBe(400);
    expect((await post('/work-supply/policy', { job: 'CASINO', primary: 'PILLS' })).json().error.code).toBe('UNKNOWN_PRODUCT');
    expect((await post('/work-supply/policy', { job: 'MOON', primary: 'CRACK' })).json().error.code).toBe('UNKNOWN_JOB');
    const saved = await post('/work-supply/policy', { job: 'CASINO', primary: 'ECSTASY', fallback: 'COCAINE', emergency: 'CRACK' });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json<WorkSupplyDto>().jobs[0]).toMatchObject({ isDefault: false, policy: { primary: 'ECSTASY', fallback: 'COCAINE', emergency: 'CRACK', strict: false } });
  });

  it('runs 80 Casino workers for 20 turns on Ecstasy, then Cocaine, then dry, and the preview matches the receipt', async () => {
    await post('/work-supply/policy', { job: 'CASINO', primary: 'ECSTASY', fallback: 'COCAINE', emergency: 'CRACK' });
    // Need 80 x 0.05 x 20 = 80. 56 Ecstasy (70%) + 12 Cocaine (15%) + 12 missing (15%).
    await stockUp({ ECSTASY: 56, COCAINE: 12 });

    const preview = await get<WorkSupplyPlanDto>('/work-supply/preview?job=CASINO&turns=20');
    expect(preview.slices.map((slice) => [slice.product, slice.state, slice.units, slice.turns])).toEqual([
      ['ECSTASY', 'supplied', 56, 14], ['COCAINE', 'substituted', 12, 3], [null, 'dry', 12, 3],
    ]);

    const trip = await scout('b', 'CASINO', 20);
    // The preview adds a status block for the screen; the plan itself matches the receipt.
    expect(trip.result.supply).toEqual({ ...preview, status: undefined });
    const after = await ProductInventoryService.read(app.prisma, players.b, classicOgV04B);
    expect(after).toMatchObject({ ECSTASY: 0, COCAINE: 0 });
    // No crack on hand, so the emergency product burned nothing and crack only moved by finds.
    expect(after.CRACK).toBe(trip.result.crackFound);
  });

  it('strict supply leaves the fallback alone', async () => {
    await post('/work-supply/policy', { job: 'NIGHTCLUB', primary: 'ECSTASY', fallback: 'COCAINE', strict: true });
    await stockUp({ ECSTASY: 20, COCAINE: 500 });
    const trip = await scout('b', 'NIGHTCLUB', 20);
    expect(trip.result.supply!.consumed).toEqual({ ECSTASY: 20 });
    expect((await ProductInventoryService.read(app.prisma, players.b, classicOgV04B)).COCAINE).toBe(500);
  });

  it('gives a crack-only player the same burn and pay as 0.4.0-A', async () => {
    // Client capacity is derived from the round id, so two rounds never give identical trips.
    // The engine tests prove same-input parity; here the live trip must burn crack by the old
    // formula and leave the take unweighted.
    await app.prisma.roundPlayer.update({ where: { id: players.b }, data: { crack: 50 } });
    const trip = await scout('b', 'LOW_RENT', 13, 7);
    const legacyBurn = Math.min(Math.floor(80 * classicOgV04A.scouting.consumption.crackPerWhorePerTurn * 13), 50);
    expect(trip.result.crackUsed).toBe(legacyBurn);
    expect(trip.result.supply).toMatchObject({ consumed: { CRACK: legacyBurn }, takeMultiplier: 1 });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players.b } })).crack).toBe(50 - legacyBurn + trip.result.crackFound);
  });

  it('supplies the Produce shift from its own policy', async () => {
    await post('/work-supply/policy', { job: 'PRODUCE', primary: 'WEED' });
    await stockUp({ WEED: 1_000 });
    const produced = await post('/produce-crack', { turns: 10, actionId: randomUUID() });
    expect(produced.statusCode, produced.body).toBe(200);
    const supply = produced.json().result.supply as WorkSupplyPlanDto;
    expect(supply.job).toBe('PRODUCE');
    expect(supply.consumed).toEqual({ WEED: 40 });
    expect((await ProductInventoryService.read(app.prisma, players.b, classicOgV04B)).WEED).toBe(960);
  });
});
