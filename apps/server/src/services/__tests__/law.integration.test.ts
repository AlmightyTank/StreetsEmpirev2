import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12F, classicOgV13A } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { GameSnapshotDto, LawPageDto } from '@streets/shared';
import { LawService } from '../law.service.js';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { ScoutService } from '../scout.service.js';

/**
 * 1.3.0-A gate, live: Heat drawn in a city builds a private Case there, with a receipt per
 * act, retry-safe, read as a Wanted stage. Heat itself behaves exactly as before, and older
 * rulesets keep no Case. Opt in with PRODUCT_INTEGRATION=1.
 */
describe.runIf(process.env.PRODUCT_INTEGRATION === '1')('1.3.0-A Case foundation with PostgreSQL', () => {
  let app: FastifyInstance;
  const rulesets = { law: classicOgV13A, old: classicOgV12F } as const;
  const rounds = { law: '', old: '' };
  const players = { law: '', old: '' };
  const cookies = { law: '', old: '' };
  const accounts: string[] = [];
  let current: 'law' | 'old' = 'law';
  let homeCityId = '';

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const kind of ['law', 'old'] as const) {
      const rules = rulesets[kind];
      const name = `law_${kind}_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies[kind] = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
      const round = await app.prisma.round.create({ data: {
        name: `Law fixture ${kind}`, slug: `law-${kind}-${randomUUID()}`,
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      } });
      rounds[kind] = round.id;
      homeCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId: registered.json().account.id, cityId: homeCityId, displayName: name, publicPimpId: 7300,
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
    current = 'law';
    for (const kind of ['law', 'old'] as const) {
      const rules = rulesets[kind];
      const id = players[kind];
      await app.prisma.playerCaseReceipt.deleteMany({ where: { roundPlayerId: id } });
      await app.prisma.playerCase.deleteMany({ where: { roundPlayerId: id } });
      await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: id } });
      await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: id } });
      await app.prisma.workSupplyPolicy.deleteMany({ where: { roundPlayerId: id } });
      await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: id } });
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 100, thugs: 40, pistols: 40, condoms: 5_000, beer: 5_000, medicine: 100, crack: 0, turns: 144, cashCents: 10_000_000n,
        heat: 0, whoreHappiness: 100, thugHappiness: 100, lockedUntil: null, lastTurnCalculationAt: new Date(), lastActiveAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
      await app.prisma.workSupplyPolicy.create({ data: { roundPlayerId: id, job: 'NIGHTCLUB', primary: 'ECSTASY' } });
      await app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, id, rules, { ECSTASY: 1_000 }));
    }
  });

  const get = (url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[current] } });
  const receipts = (kind: 'law' | 'old') => app.prisma.playerCaseReceipt.findMany({ where: { roundPlayerId: players[kind] }, orderBy: { createdAt: 'asc' } });
  const caseRow = (kind: 'law' | 'old') => app.prisma.playerCase.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: players[kind], cityId: homeCityId } } });
  const never = () => 0.99;

  it('turns a tenth of a trip’s Heat into Case at home, once per action id', async () => {
    const actionId = randomUUID();
    const trip = await ScoutService.scout(app.prisma, players.law, { district: 'NIGHTCLUB', turns: 12, actionId }, never);
    const added = trip.result.heat!.added;
    expect(added).toBeGreaterThan(0);
    // Heat is exactly what it always was.
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players.law } })).heat).toBe(added);

    const [receipt] = await receipts('law');
    expect(receipt).toMatchObject({ cityId: homeCityId, source: 'SCOUT', heat: added, deltaHundredths: added * 10, caseAfterHundredths: added * 10 });
    expect((await caseRow('law'))?.caseHundredths).toBe(added * 10);

    // A replay answers with the original result and adds no evidence.
    await ScoutService.scout(app.prisma, players.law, { district: 'NIGHTCLUB', turns: 12, actionId }, never);
    expect(await receipts('law')).toHaveLength(1);
    expect((await caseRow('law'))?.caseHundredths).toBe(added * 10);
  });

  it('counts the Heat a busted trip drew, though the bust burns Heat off', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players.law }, data: { heat: 100 } });
    const trip = await ScoutService.scout(app.prisma, players.law, { district: 'NIGHTCLUB', turns: 12, actionId: randomUUID() }, () => 0);
    const heat = trip.result.heat!;
    expect(heat.busted || heat.arrested).toBe(true);
    expect(heat.after).toBeLessThan(100);
    const [receipt] = await receipts('law');
    expect(receipt?.heat).toBe(heat.added);
    expect(receipt?.deltaHundredths).toBe(heat.added * 10);
  });

  it('shows the Case only to its player, on the dashboard and the law page', async () => {
    await ScoutService.scout(app.prisma, players.law, { district: 'NIGHTCLUB', turns: 12, actionId: randomUUID() }, never);
    const stored = (await caseRow('law'))!.caseHundredths;
    const page = (await get('/law')).json<LawPageDto>();
    expect(page.caseMax).toBe(100);
    expect(page.stages.map((stage) => [stage.stage, stage.startsAt])).toEqual([['QUIET', 0], ['NOTICED', 20], ['INVESTIGATION', 40], ['WARRANT', 65], ['FEDERAL', 85]]);
    expect(page.cases).toHaveLength(1);
    expect(page.cases[0]).toMatchObject({ isHome: true, case: stored / 100, stage: 'QUIET', next: { stage: 'NOTICED', startsAt: 20 } });
    expect(page.receipts[0]).toMatchObject({ source: 'SCOUT', added: stored / 100, caseAfter: stored / 100 });
    const me = (await get('/me')).json<GameSnapshotDto>();
    expect(me.player.law).toEqual({ stage: 'QUIET', case: stored / 100, cityName: page.cases[0]!.cityName });
  });

  it('logs and rings each new stage once, holds at the cap, and ignores a repeated source key', async () => {
    const record = (heat: number, sourceKey: string) => app.prisma.$transaction((tx) =>
      LawService.recordHeat(tx, players.law, classicOgV13A, [{ citySlug: classicOgV13A.round.startingCitySlug, heat, source: 'RACKETS', sourceKey }]));
    const first = await record(250, 'test:1');
    expect(first[0]).toMatchObject({ before: 0, after: 2_500, stage: 'NOTICED', stageUp: true });
    expect(await record(250, 'test:1')).toEqual([]);
    const second = await record(5_000, 'test:2');
    expect(second[0]).toMatchObject({ before: 2_500, after: 10_000, stage: 'FEDERAL', stageUp: true });
    expect(await record(100, 'test:3')).toEqual([]);

    const rows = await receipts('law');
    expect(rows.map((row) => [row.deltaHundredths, row.caseAfterHundredths, row.stageAfter])).toEqual([[2_500, 2_500, 'NOTICED'], [7_500, 10_000, 'FEDERAL']]);
    const activity = await app.prisma.playerActivity.findMany({ where: { roundPlayerId: players.law, type: 'CASE_STAGE_UP' }, orderBy: { createdAt: 'asc' } });
    expect(activity.map((row) => (row.payload as { stage: string }).stage)).toEqual(['NOTICED', 'FEDERAL']);
    expect(await app.prisma.inAppNotification.count({ where: { activityId: { in: activity.map((row) => row.id) } } })).toBe(2);
  });

  it('keeps no Case on an older ruleset, where Heat still lands as before', async () => {
    current = 'old';
    const trip = await ScoutService.scout(app.prisma, players.old, { district: 'NIGHTCLUB', turns: 12, actionId: randomUUID() }, never);
    expect(trip.result.heat!.added).toBeGreaterThan(0);
    expect(await receipts('old')).toEqual([]);
    expect(await app.prisma.playerCase.count({ where: { roundPlayerId: players.old } })).toBe(0);
    expect((await get('/law')).json().error.code).toBe('LAW_DISABLED');
    expect((await get('/me')).json<GameSnapshotDto>().player.law).toBeUndefined();
  });
});
