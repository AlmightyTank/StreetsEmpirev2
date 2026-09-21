import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV04E } from '@streets/rulesets';
import { calculateNetWorthCents, productNetWorthCents } from '@streets/rules-engine';
import type {
  BattleReportDto, GameActionResult, HallOfFameDto, ProduceCrackResult, ProductsDto, ScoutResult, WorkSupplyDto, WorkSupplyPreviewDto,
} from '@streets/shared';
import { ProductInventoryService } from '../product-inventory.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.4.0-E release regression: one products season through the HTTP API on the
 * current ruleset, from Pip's counter to the Hall of Fame, plus exploit checks on
 * trades, policies, cooking, bribes and fight supply. Opt in with
 * RELEASE_INTEGRATION=1. Uses its own long-ago round and cleans up after itself.
 */
describe.runIf(process.env.RELEASE_INTEGRATION === '1')('0.4.0-E products season regression', () => {
  let app: FastifyInstance;
  let roundId: string;
  const rules = classicOgV04E;
  const accounts: string[] = [];
  const cookies: string[] = [];
  const pimps: number[] = [];

  const post = (who: number, url: string, payload: object = {}) => app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cookies[who]! }, payload });
  const get = (who: number, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cookies[who]! } });
  const player = (who: number) => app.prisma.roundPlayer.findFirstOrThrow({ where: { roundId, accountId: accounts[who]! } });
  const stock = async (who: number) => ProductInventoryService.read(app.prisma, (await player(who)).id, rules);
  const trade = (who: number, product: string, direction: 'buy' | 'sell', quantity: number, actionId = randomUUID()) =>
    post(who, '/game/products/trade', { product, direction, quantity, actionId });
  /** Stored net worth is exactly the column worth plus every product row at its value. */
  const worthIsExact = async (who: number) => {
    const row = await player(who);
    expect(row.netWorthCents).toBe(calculateNetWorthCents(row, rules) + productNetWorthCents(await stock(who), rules));
  };

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Release 0.4 fixture', slug: `release-04-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000), nextPublicPimpId: rules.round.publicPimpIdStart,
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));

    for (let i = 0; i < 3; i++) {
      const name = `rel4_${randomUUID().slice(0, 8)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      expect(registered.statusCode).toBe(201);
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      const joined = await post(i, '/rounds/current/join');
      expect(joined.statusCode, joined.body).toBe(201);
      pimps.push(joined.json().me.publicPimpId);
    }
    // Working, raid-ready crews past newcomer protection.
    for (let i = 0; i < 3; i++) {
      const row = await player(i);
      await app.prisma.roundPlayer.update({ where: { id: row.id }, data: {
        whores: 100, thugs: i === 0 ? 40 : 30, pistols: i === 0 ? 40 : 30, woundedThugs: 0, condoms: 10_000, beer: 1_000, medicine: 50,
        turns: 144, cashCents: 50_000_000n, crack: 200, heat: 0,
        createdAt: new Date(Date.now() - 3 * 86_400_000), lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
      } });
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  it('serves liveness, readiness and the 0.4.0-E milestone', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({ ok: true, milestone: '0.4.0-E' });
    expect((await app.inject({ method: 'GET', url: '/api/ready' })).statusCode).toBe(200);
  });

  it('runs the products loop: Pip, supply policy and preview, Scout, cooking and Heat, with exact net worth', async () => {
    const page = (await get(0, '/game/products')).json<ProductsDto>();
    expect(page).toMatchObject({ enabled: true, economy: true });
    expect((await trade(0, 'ECSTASY', 'buy', 150)).statusCode).toBe(200);
    expect((await trade(0, 'COCAINE', 'buy', 80)).statusCode).toBe(200);
    expect((await trade(0, 'WEED', 'buy', 100)).statusCode).toBe(200);
    await worthIsExact(0);

    expect((await post(0, '/game/work-supply/policy', { job: 'CASINO', primary: 'COCAINE', fallback: 'ECSTASY' })).statusCode).toBe(200);
    const preview = (await get(0, '/game/work-supply/preview?job=CASINO&turns=24')).json<WorkSupplyPreviewDto>();
    // 100 whores for 24 turns want 120: 80 Cocaine, then 40 Ecstasy.
    expect(preview.slices.map((slice) => [slice.product, slice.units])).toEqual([['COCAINE', 80], ['ECSTASY', 40]]);
    expect(preview.status).toMatchObject({ shortWorkers: 0 });

    const scouted = await post(0, '/game/scout', { district: 'CASINO', turns: 24, actionId: randomUUID() });
    expect(scouted.statusCode, scouted.body).toBe(200);
    const trip = scouted.json<GameActionResult<ScoutResult>>().result;
    expect(trip.supply).toEqual({ ...preview, status: undefined });
    expect(trip.heat!.after).toBe(trip.heat!.added);
    expect(await stock(0)).toMatchObject({ COCAINE: 0, ECSTASY: 110 });

    expect((await post(0, '/game/work-supply/policy', { job: 'COOK', primary: 'WEED' })).statusCode).toBe(200);
    const cooks = (await player(0)).thugs; // the Scout trip may have recruited some
    const cooked = await post(0, '/game/produce-crack', { turns: 10, productType: 'METH', actionId: randomUUID() });
    expect(cooked.statusCode, cooked.body).toBe(200);
    const batch = cooked.json<GameActionResult<ProduceCrackResult>>().result;
    expect(batch.cook!.consumed).toEqual({ WEED: Math.ceil(cooks * rules.workSupply.productPerThugPerTurn * 10 - 1e-9) });
    expect((await stock(0)).METH).toBe(batch.productProduced);
    await worthIsExact(0);
  });

  it('supplies fights: both sides burn and report their supply, product loot is conserved, and clearing stops it', async () => {
    await trade(1, 'METH', 'buy', 100);
    expect((await post(0, '/game/work-supply/policy', { job: 'RAID', primary: 'ECSTASY' })).statusCode).toBe(200);
    expect((await post(1, '/game/work-supply/policy', { job: 'DEFENSE', primary: 'METH' })).statusCode).toBe(200);
    const overview = (await get(1, '/game/work-supply')).json<WorkSupplyDto>();
    expect(overview.jobs.find((job) => job.key === 'DEFENSE')).toMatchObject({ optIn: true, active: true });
    expect(overview.jobs.find((job) => job.key === 'RAID')).toMatchObject({ optIn: true, active: false });

    const beforeA = await stock(0);
    const beforeD = await stock(1);
    const raid = await post(0, '/game/combat/raid', { roundId, targetPublicPimpId: pimps[1], attackingThugs: 40, actionId: randomUUID() });
    expect(raid.statusCode, raid.body).toBe(200);
    const report = raid.json<BattleReportDto>();
    const burn = Math.ceil(40 * rules.combatSupply.productPerThugPerFight);
    const defended = Math.ceil(30 * rules.combatSupply.productPerThugPerFight);
    expect(report.yourSupply).toMatchObject({ job: 'RAID', consumed: { ECSTASY: burn } });
    const battle = await app.prisma.raidBattle.findFirstOrThrow({ where: { attackerId: (await player(0)).id }, orderBy: { createdAt: 'desc' } });
    const defenderReport = battle.defenderReport as unknown as BattleReportDto;
    expect(defenderReport.yourSupply).toMatchObject({ job: 'DEFENSE', consumed: { METH: defended } });

    const afterA = await stock(0);
    const afterD = await stock(1);
    // Every unit is accounted for: burned going in, or moved from defender to attacker.
    for (const key of Object.keys(rules.products)) {
      const burnedA = key === 'ECSTASY' ? burn : 0;
      const burnedD = key === 'METH' ? defended : 0;
      expect((afterA[key]! - beforeA[key]! + burnedA) + (afterD[key]! - beforeD[key]! + burnedD)).toBe(0);

      const attackerDelta = afterA[key]! - beforeA[key]!;
      const defenderDelta = afterD[key]! - beforeD[key]!;
      const attackerLine = report.inventoryChanges?.find((line) => line.product === key);
      const defenderLine = defenderReport.inventoryChanges?.find((line) => line.product === key);
      if (attackerDelta !== 0) expect(attackerLine).toMatchObject({ change: attackerDelta, after: afterA[key] });
      else expect(attackerLine).toBeUndefined();
      if (defenderDelta !== 0) expect(defenderLine).toMatchObject({ change: defenderDelta, after: afterD[key] });
      else expect(defenderLine).toBeUndefined();
    }
    expect(report.inventoryChanges?.find((line) => line.product === 'ECSTASY')?.used).toBe(burn);
    expect(defenderReport.inventoryChanges?.find((line) => line.product === 'METH')?.used).toBe(defended);
    await worthIsExact(0);
    await worthIsExact(1);

    expect((await post(1, '/game/work-supply/policy/clear', { job: 'DEFENSE' })).json<WorkSupplyDto>().jobs.find((job) => job.key === 'DEFENSE')).toMatchObject({ active: false });
    const methBefore = (await stock(1)).METH!;
    const second = await post(2, '/game/combat/raid', { roundId, targetPublicPimpId: pimps[1], attackingThugs: 30, actionId: randomUUID() });
    if (second.statusCode === 200) {
      expect(second.json<BattleReportDto>().yourSupply).toBeUndefined();
      expect((await stock(1)).METH).toBeLessThanOrEqual(methBefore);
    }
  });

  it('refuses product exploits', async () => {
    for (const quantity of [0, -5, 1.5]) expect((await trade(2, 'WEED', 'buy', quantity)).statusCode).toBe(400);
    expect((await trade(2, 'PILLS', 'buy', 1)).json().error.code).toBe('UNKNOWN_ITEM');
    expect((await trade(2, 'CRACK', 'sell', 1)).json().error.code).toBe('USE_PIP_PRODUCT');
    expect((await trade(2, 'WEED', 'sell', 1)).json().error.code).toBe('NOT_ENOUGH_ITEMS');

    // A replayed trade answers with the original result and charges once.
    const actionId = randomUUID();
    const cashBefore = (await player(2)).cashCents;
    const first = await trade(2, 'HEROIN', 'buy', 10, actionId);
    const replay = await trade(2, 'HEROIN', 'buy', 10, actionId);
    expect(replay.json().result).toEqual(first.json().result);
    expect((await player(2)).cashCents).toBe(cashBefore - 10n * BigInt(rules.products.HEROIN.economy.pip.buyCents));
    expect((await stock(2)).HEROIN).toBe(10);

    // Two buys racing for one shelf never oversell it; two sales of the same stock never go negative.
    const racing = await Promise.all([trade(2, 'HEROIN', 'buy', 60), trade(2, 'HEROIN', 'buy', 60)]);
    expect(racing.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(racing.find((response) => response.statusCode !== 200)!.json().error.code).toBe('OUT_OF_STOCK');
    const selling = await Promise.all([trade(2, 'HEROIN', 'sell', 70), trade(2, 'HEROIN', 'sell', 70)]);
    expect(selling.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect((await stock(2)).HEROIN).toBe(0);

    expect((await post(2, '/game/work-supply/policy', { job: 'MOON', primary: 'WEED' })).json().error.code).toBe('UNKNOWN_JOB');
    expect((await post(2, '/game/work-supply/policy', { job: 'RAID', primary: 'PILLS' })).json().error.code).toBe('UNKNOWN_PRODUCT');
    expect((await post(2, '/game/work-supply/policy/clear', { job: 'MOON' })).json().error.code).toBe('UNKNOWN_JOB');
    expect((await post(2, '/game/work-supply/policy/clear', { job: 'CASINO', extra: 1 })).statusCode).toBe(400);
    expect((await post(2, '/game/produce-crack', { turns: 1, productType: 'COCAINE', actionId: randomUUID() })).json().error.code).toBe('UNKNOWN_RECIPE');

    await app.prisma.roundPlayer.update({ where: { id: (await player(2)).id }, data: { heat: 10 } });
    expect((await post(2, '/game/heat/bribe', { points: 11, actionId: randomUUID() })).json().error.code).toBe('TOO_MANY_POINTS');
    expect((await post(2, '/game/heat/bribe', { points: 0, actionId: randomUUID() })).statusCode).toBe(400);
    await worthIsExact(2);
  });

  it('closes the season: trades, cooking and bribes freeze, and the Hall of Fame is written', async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { endsAt: new Date(Date.now() - 1_000) } });
    const closed = await RoundService.closeIfExpired(app.prisma, roundId);
    expect(closed.round.status).toBe('ENDED');
    expect((await trade(0, 'WEED', 'buy', 1)).json().error.code).toBe('ROUND_ENDED');
    expect((await post(0, '/game/produce-crack', { turns: 1, productType: 'CRACK', actionId: randomUUID() })).json().error.code).toBe('ROUND_ENDED');
    const hall = (await app.inject({ method: 'GET', url: '/api/game/hall-of-fame' })).json<HallOfFameDto>();
    expect(hall.rounds.find((row) => row.id === roundId)?.topTen.length).toBeGreaterThan(0);
  });
});
