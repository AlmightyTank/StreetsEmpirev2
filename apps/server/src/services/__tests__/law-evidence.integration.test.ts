import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV13B } from '@streets/rulesets';
import { businessStaff, startingStock } from '@streets/rules-engine';
import type { LawPageDto } from '@streets/shared';
import { BusinessService } from '../business.service.js';
import { CasinoService } from '../casino.service.js';
import { GameAlertService } from '../game-alerts.service.js';
import { LawService } from '../law.service.js';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { ScoutService } from '../scout.service.js';
import { TurfService } from '../turf.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV13B;
const law = rules.law;
const home = rules.round.startingCitySlug;

/**
 * 1.3.0-B gate, live: direct evidence, currency reports that add up over the day, cooling
 * after a quiet day, laundering that washes the Case where it runs, and a stage rise that
 * reaches Discord with only the city and stage. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.3.0-B evidence sources with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  let playerId = '';
  let accountId = '';
  let cookie = '';

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = `lawb_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const round = await app.prisma.round.create({ data: {
      name: 'Law B fixture', slug: `law-b-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId, cityId, displayName: name, publicPimpId: 7400,
      reputation: { create: ReputationService.seedFor(rules) } } });
    playerId = player.id;
    await TurfService.ensureRound(app.prisma, roundId, rules);
    const pick = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(pick);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(pick);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.playerCaseReceipt.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerCase.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.casinoLedgerEntry.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.casinoWallet.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.notificationSettings.deleteMany({ where: { accountId } });
    await app.prisma.business.updateMany({ where: { roundId }, data: { level: 0, staff: 0, staffOwnerId: null, registerCents: 0n, racket: null, racketSince: null } });
    await app.prisma.turf.updateMany({ where: { roundId }, data: { holderId: null, cornerThugs: 0, heldSince: null } });
    const data = { ...rules.round.startingPlayer, ...startingStock(rules),
      whores: 100, thugs: 40, pistols: 40, condoms: 5_000, beer: 5_000, medicine: 100, crack: 0, turns: 144, cashCents: 100_000_000n,
      heat: 0, whoreHappiness: 100, thugHappiness: 100, lockedUntil: null, businessThugs: 0, businessWhores: 0, postedThugs: 0,
      racketEffects: {}, launderedDay: null, launderedHeatToday: 0, launderedHeatRound: 0, launderedCaseDay: null, launderedCaseToday: 0,
      lastTurnCalculationAt: new Date(), lastActiveAt: new Date() };
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
  });

  const receipts = () => app.prisma.playerCaseReceipt.findMany({ where: { roundPlayerId: playerId }, orderBy: { createdAt: 'asc' } });
  const homeCase = () => app.prisma.playerCase.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId } } });
  const record = (entry: Parameters<typeof LawService.record>[3][number], now = new Date()) =>
    app.prisma.$transaction((tx) => LawService.record(tx, playerId, rules, [entry], now));

  it('writes an arrest down as evidence of its own, on top of the trip', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { heat: 100 } });
    const trip = await ScoutService.scout(app.prisma, playerId, { district: 'LOW_RENT', turns: 5, actionId: randomUUID() }, () => 0);
    expect(trip.result.heat?.arrested).toBe(true);
    const rows = await receipts();
    expect(rows.find((row) => row.source === 'ARREST')).toMatchObject({ cityId, deltaHundredths: law.evidence.arrest * 100, heat: 0 });
    expect(rows.find((row) => row.source === 'BUST')).toBeUndefined();
    const heatPart = rows.filter((row) => row.source === 'SCOUT').reduce((sum, row) => sum + row.deltaHundredths, 0);
    expect((await homeCase())?.caseHundredths).toBe(law.evidence.arrest * 100 + heatPart);
  });

  it('files a currency report when a city’s cage sees $250,000 in a day, however it is split', async () => {
    await CasinoService.buyChips(app.prisma, playerId, { amountCents: 20_000_000, actionId: randomUUID() });
    expect(await receipts()).toEqual([]);
    expect((await homeCase())?.reportCents).toBe(20_000_000n);
    await CasinoService.redeemChips(app.prisma, playerId, { amountCents: 10_000_000, actionId: randomUUID() });
    const rows = await receipts();
    expect(rows.map((row) => [row.source, row.deltaHundredths])).toEqual([['CURRENCY_REPORT', law.currencyReport.points * 100]]);
    expect((await homeCase())?.reportCents).toBe(30_000_000n);
  });

  it('cools after a quiet day, writes the cooling down with the next change, and shows it live', async () => {
    const quietSince = new Date(Date.now() - 30 * HOUR_MS);
    await app.prisma.playerCase.create({ data: { roundPlayerId: playerId, cityId, caseHundredths: 3_000, stage: 'NOTICED', caseAt: quietSince, lastEvidenceAt: quietSince } });
    const page = (await app.inject({ method: 'GET', url: '/api/game/law', headers: { cookie } })).json<LawPageDto>();
    expect(page.cases[0]!.case).toBeCloseTo(27, 1);
    expect(page.cases[0]!.cooling).toMatchObject({ perHour: law.cooling.decayPerHour });
    expect(page.cooling).toEqual(law.cooling);

    // Racket Heat is not the player's own act: it lands, but the quiet clock keeps running.
    await record({ cityId, heat: 10, source: 'RACKETS', sourceKey: 'rackets:test' });
    const afterRackets = await homeCase();
    expect(afterRackets?.lastEvidenceAt?.getTime()).toBe(quietSince.getTime());
    await record({ cityId, points: law.evidence.bust, source: 'BUST', sourceKey: 'bust:test' });

    const rows = await receipts();
    const cooling = rows.filter((row) => row.source === 'COOLING');
    expect(cooling).toHaveLength(1);
    expect(cooling[0]!.deltaHundredths).toBeLessThanOrEqual(-300);
    const total = rows.reduce((sum, row) => sum + row.deltaHundredths, 3_000);
    const stored = await homeCase();
    expect(stored?.caseHundredths).toBe(total);
    expect(stored!.lastEvidenceAt!.getTime()).toBeGreaterThan(quietSince.getTime());
  });

  it('washes the Case where a laundering racket runs, up to the daily cap', async () => {
    await app.prisma.turf.updateMany({ where: { roundId, cityId, district: 'CASINO' }, data: { holderId: playerId, cornerThugs: 6, heldSince: new Date(Date.now() - 200 * HOUR_MS), upkeepAt: new Date() } });
    const row = await app.prisma.business.findFirstOrThrow({ where: { roundId, lot: 1, turf: { cityId, district: 'CASINO' } } });
    const staff = businessStaff(rules, row.kind as never, 5);
    const run = async (hours: number) => app.prisma.business.update({ where: { id: row.id }, data: {
      level: 5, staff, staffTarget: staff, staffOwnerId: playerId, registerCents: 50_000_000n,
      accruedAt: new Date(Date.now() - hours * HOUR_MS), racket: 'CASINO_LAUNDERING', racketSince: new Date(Date.now() - 200 * HOUR_MS),
    } });
    await run(10);
    const kind = rules.business.catalog[row.kind as keyof typeof rules.business.catalog].staff;
    // Businesses burn beer and product every hour; an unsupplied one launders nothing.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { crack: 5_000, ...(kind === 'WHORES' ? { businessWhores: staff } : { businessThugs: staff }) } });
    await app.prisma.playerCase.create({ data: { roundPlayerId: playerId, cityId, caseHundredths: 2_000, stage: 'NOTICED', caseAt: new Date(), lastEvidenceAt: new Date() } });

    await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));
    const washed = rules.business.rackets.catalog.CASINO_LAUNDERING.effect.heatPerHour * 10 * law.laundering.casePerHeat * 100;
    expect((await homeCase())?.caseHundredths).toBe(2_000 - washed);
    expect((await receipts()).map((r) => [r.source, r.deltaHundredths])).toEqual([['LAUNDERING', -washed]]);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).launderedCaseToday).toBe(washed);

    // A long stretch washes only what is left of the day's cap.
    await run(100);
    await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));
    expect((await homeCase())?.caseHundredths).toBe(2_000 - law.laundering.dailyCaseCap * 100);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).launderedCaseToday).toBe(law.laundering.dailyCaseCap * 100);
  });

  it('sends a stage rise to Discord with only the city and the stage, once', async () => {
    await app.prisma.account.update({ where: { id: accountId }, data: { discordId: `law-${randomUUID().slice(0, 12)}` } });
    await app.prisma.notificationSettings.create({ data: { accountId, discordEnabled: true } });
    await record({ cityId, points: 25, source: 'HIJACK', sourceKey: 'hijack:test' });
    expect((await receipts())[0]).toMatchObject({ stageUp: true, stageAfter: 'NOTICED' });

    const switches = { discord: true, push: false };
    const first = await app.prisma.$transaction((tx) => GameAlertService.collect(tx, new Date(), switches));
    const mine = first.filter((row) => row.accountId === accountId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ channel: 'DISCORD', category: 'law' });
    const notice = (mine[0]!.payload as { notice: { title: string; body: string } }).notice;
    expect(notice.body).toMatch(/police now have you at Noticed\.$/);
    expect(notice.body).not.toMatch(/\d/);
    const second = await app.prisma.$transaction((tx) => GameAlertService.collect(tx, new Date(), switches));
    expect(second.filter((row) => row.accountId === accountId)).toEqual([]);

    // Switched off, a new stage still reaches the bell but not Discord.
    await app.prisma.notificationSettings.update({ where: { accountId }, data: { lawEnabled: false } });
    await record({ cityId, points: 25, source: 'HIJACK', sourceKey: 'hijack:test-2' });
    const off = await app.prisma.$transaction((tx) => GameAlertService.collect(tx, new Date(), switches));
    expect(off.filter((row) => row.accountId === accountId)).toEqual([]);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'CASE_STAGE_UP' } })).toBe(2);
  });
});
