import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV13D } from '@streets/rulesets';
import { lawPriceCents, startingStock } from '@streets/rules-engine';
import type { LawPageDto } from '@streets/shared';
import { GameAlertService } from '../game-alerts.service.js';
import { LawOfficialService } from '../law-official.service.js';
import { LawService, type CaseEvidence } from '../law.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV13D;
const officials = rules.law.officials;
const home = rules.round.startingCitySlug;
const WORTH = 200_000_000n;

/**
 * 1.3.0-D gate, live: officials on a weekly payroll (a DA slowing the Case and quashing, a
 * Captain's longer window and word, a Judge softening a raid), exposure that opens an
 * Internal Affairs file with a warning, a sting for an official still on the books, a clean
 * cut, and informants who sell tips but never change a Case. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.3.0-D officials and informants with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  let detroitId = '';
  let playerId = '';
  let accountId = '';
  let cookie = '';

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = `lawd_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const round = await app.prisma.round.create({ data: {
      name: 'Law D fixture', slug: `law-d-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 30 * 86_400_000),
    } });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    detroitId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } })).id;
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId, cityId, displayName: name, publicPimpId: 7600,
      reputation: { create: ReputationService.seedFor(rules) } } });
    playerId = player.id;
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

  // 1.3.0-G audit: whatever a test did, every stored Case still adds up to its receipts.
  afterEach(async () => {
    const cases = await app.prisma.playerCase.findMany({ where: { roundPlayerId: playerId } });
    const sums = await app.prisma.playerCaseReceipt.groupBy({ by: ['cityId'], where: { roundPlayerId: playerId }, _sum: { deltaHundredths: true } });
    expect(cases.filter((row) => row.caseHundredths).map((row) => [row.cityId, row.caseHundredths]).sort()).toEqual(
      sums.filter((row) => row._sum.deltaHundredths).map((row) => [row.cityId, row._sum.deltaHundredths]).sort(),
    );
  });

  beforeEach(async () => {
    for (const table of ['playerTip', 'playerOfficial', 'playerWarrant', 'playerCaseReceipt', 'playerCase', 'playerActivity', 'processedAction'] as const) {
      await (app.prisma[table] as unknown as { deleteMany: (args: object) => Promise<unknown> }).deleteMany({ where: { roundPlayerId: playerId } });
    }
    await app.prisma.turfCrackdown.deleteMany({ where: { roundId } });
    await app.prisma.notificationSettings.deleteMany({ where: { accountId } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: {
      ...rules.round.startingPlayer, ...startingStock(rules), cityId,
      whores: 100, thugs: 40, condoms: 5_000, beer: 5_000, crack: 0, turns: 144, cashCents: 50_000_000n, heat: 0,
      whoreHappiness: 100, thugHappiness: 100, lockedUntil: null, hideoutSafeRoomLevel: 0,
      policeLossDay: null, policeLossCents: 0n, lawyerRetainedUntil: null, netWorthCents: WORTH,
      lastTurnCalculationAt: new Date(), lastActiveAt: new Date(),
    } });
  });

  const evidence = (entries: Array<Omit<CaseEvidence, 'sourceKey'>>, now = new Date()) =>
    app.prisma.$transaction((tx) => LawService.record(tx, playerId, rules, entries.map((entry, i) => ({ ...entry, sourceKey: `test:${randomUUID()}:${i}` })), now));
  const caseIn = async (id: string) => (await app.prisma.playerCase.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: id } } }))?.caseHundredths ?? 0;
  const official = (role: string, id = cityId) => app.prisma.playerOfficial.findUniqueOrThrow({ where: { roundPlayerId_cityId_role: { roundPlayerId: playerId, cityId: id, role } } });
  const resetWorth = () => app.prisma.roundPlayer.update({ where: { id: playerId }, data: { netWorthCents: WORTH } });
  const hire = async (role: 'CAPTAIN' | 'DA' | 'JUDGE' | 'CUSTOMS', citySlug: string = home) => {
    const result = await LawOfficialService.hire(app.prisma, playerId, { citySlug, role, actionId: randomUUID() });
    await resetWorth();
    return result;
  };
  const page = async () => (await app.inject({ method: 'GET', url: '/api/game/law', headers: { cookie } })).json<LawPageDto>();
  const count = (type: string) => app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: type as never } });

  it('puts a DA on the payroll for a week, who slows the Case and quashes a warrant once', async () => {
    const hired = await hire('DA');
    expect(hired.result.weekCents).toBe(Number(lawPriceCents(WORTH, officials.roles.DA)));
    expect(hired.after.cashCents).toBe(50_000_000 - hired.result.weekCents);
    expect(new Date(hired.result.paidUntil).getTime()).toBeGreaterThan(Date.now() + (officials.weekDays * 24 - 1) * HOUR_MS);
    await expect(hire('DA')).rejects.toMatchObject({ code: 'OFFICIAL_ON_PAYROLL' });

    await evidence([{ cityId, points: 40, source: 'BUST' }]);
    expect(await caseIn(cityId)).toBe(3_000);
    expect((await official('DA')).exposure).toBe(10);

    await evidence([{ cityId, points: 60, source: 'BUST' }]);
    const [warrant] = await app.prisma.playerWarrant.findMany({ where: { roundPlayerId: playerId } });
    expect(warrant).toBeDefined();
    expect((await page()).warrants[0]).toMatchObject({ id: warrant!.id, quashable: true });
    await LawOfficialService.quash(app.prisma, playerId, warrant!.id, randomUUID());
    expect((await app.prisma.playerWarrant.findUniqueOrThrow({ where: { id: warrant!.id } })).status).toBe('QUASHED');
    expect(await caseIn(cityId)).toBe(rules.law.warrants.caseAfterAnswered * 100);
    const da = await official('DA');
    expect(da.exposure).toBe(10 + 15 + officials.exposure.perFavor.daQuash);
    expect(da.quashReadyAt!.getTime()).toBeGreaterThan(Date.now() + (officials.roles.DA.quashEveryDays * 24 - 1) * HOUR_MS);

    await evidence([{ cityId, points: 40, source: 'BUST' }]);
    const [, second] = await app.prisma.playerWarrant.findMany({ where: { roundPlayerId: playerId }, orderBy: { draftedAt: 'asc' } });
    await expect(LawOfficialService.quash(app.prisma, playerId, second!.id, randomUUID())).rejects.toMatchObject({ code: 'DA_USED' });
  });

  it('stops helping once a week runs out unpaid', async () => {
    await hire('DA');
    await app.prisma.playerOfficial.updateMany({ where: { roundPlayerId: playerId }, data: { paidUntil: new Date(Date.now() - 1_000) } });
    await evidence([{ cityId, points: 40, source: 'BUST' }]);
    expect(await caseIn(cityId)).toBe(4_000);
    expect((await page()).payroll!.officials[0]!.status).toBe('LAPSED');
  });

  it('has a Captain warn before the line and buy a longer window', async () => {
    await hire('CAPTAIN');
    await evidence([{ cityId, points: 50, source: 'BUST' }]);
    await evidence([{ cityId, points: 11, source: 'BUST' }]);
    expect(await count('CAPTAIN_TIP')).toBe(1);
    await evidence([{ cityId, points: 10, source: 'BUST' }]);
    const [warrant] = await app.prisma.playerWarrant.findMany({ where: { roundPlayerId: playerId } });
    expect(warrant!.servesAt.getTime() - warrant!.draftedAt.getTime()).toBe((rules.law.warrants.warningHours + officials.roles.CAPTAIN.extraWarningHours) * HOUR_MS);
    expect((await official('CAPTAIN')).exposure).toBe(officials.exposure.perFavor.captainTip + officials.exposure.perFavor.captainWindow);
  });

  it('has a Judge soften a served raid', async () => {
    await hire('JUDGE');
    await evidence([{ cityId, points: 70, source: 'BUST' }]);
    const cash = (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cashCents;
    await app.prisma.playerWarrant.updateMany({ where: { roundPlayerId: playerId }, data: { servesAt: new Date(Date.now() - 1_000) } });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    const [warrant] = await app.prisma.playerWarrant.findMany({ where: { roundPlayerId: playerId } });
    const outcome = warrant!.outcome as { fineCents: number; judged: boolean };
    expect(outcome.judged).toBe(true);
    const exposed = Number(cash - BigInt(rules.combat.loot.protectedCashCents));
    expect(outcome.fineCents).toBe(Math.floor(exposed * rules.law.warrants.hideout.cashFineFraction * (1 - officials.roles.JUDGE.seizureCut)));
    expect((await official('JUDGE')).exposure).toBe(officials.exposure.perFavor.judgeServe);
  });

  it('opens an Internal Affairs file with a warning, and stings an official kept on the books', async () => {
    await app.prisma.account.update({ where: { id: accountId }, data: { discordId: `lawd-${randomUUID().slice(0, 12)}` } });
    await app.prisma.notificationSettings.create({ data: { accountId, discordEnabled: true } });
    await hire('DA', 'detroit');
    await app.prisma.playerOfficial.updateMany({ where: { roundPlayerId: playerId }, data: { exposure: officials.exposure.line - 2 } });
    await evidence([{ cityId: detroitId, points: 20, source: 'HIJACK' }]);
    const opened = await official('DA', detroitId);
    expect(opened.iaOpenedAt).not.toBeNull();
    expect(opened.stingAt!.getTime() - opened.iaOpenedAt!.getTime()).toBe(officials.exposure.iaWarningHours * HOUR_MS);
    expect(await count('OFFICIAL_IA_OPENED')).toBe(1);

    const switches = { discord: true, push: false };
    const collect = async () => (await app.prisma.$transaction((tx) => GameAlertService.collect(tx, new Date(), switches)))
      .filter((row) => row.accountId === accountId).map((row) => (row.payload as { notice: { title: string } }).notice.title);
    expect(await collect()).toContain('Internal Affairs is looking');

    const before = await caseIn(detroitId);
    await app.prisma.playerOfficial.update({ where: { id: opened.id }, data: { stingAt: new Date(Date.now() - 1_000) } });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    expect((await official('DA', detroitId)).status).toBe('STUNG');
    expect(await caseIn(detroitId)).toBe(before + officials.exposure.stingPoints * 100);
    expect(await count('OFFICIAL_STUNG')).toBe(1);
    // The sting's evidence can raise the stage too, which has its own alert.
    expect(await collect()).toContain('Your official was stung');
    await expect(hire('DA', 'detroit')).rejects.toMatchObject({ code: 'OFFICIAL_COOLDOWN' });
  });

  it('lets a cut official go clean, Internal Affairs or not', async () => {
    await hire('JUDGE');
    const judge = await official('JUDGE');
    await app.prisma.playerOfficial.update({ where: { id: judge.id }, data: { exposure: 70, iaOpenedAt: new Date(), stingAt: new Date(Date.now() + HOUR_MS) } });
    await LawOfficialService.cut(app.prisma, playerId, judge.id, randomUUID());
    await app.prisma.playerOfficial.update({ where: { id: judge.id }, data: { stingAt: new Date(Date.now() - 1_000) } });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    expect((await official('JUDGE')).status).toBe('CUT');
    expect(await caseIn(cityId)).toBe(0);
    expect(await count('OFFICIAL_STUNG')).toBe(0);
  });

  it('sells the federal sweep before it is public, and a city’s police lines, without touching a Case', async () => {
    const detroit = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } });
    await app.prisma.turfCrackdown.create({ data: { roundId, cityId: detroit.id, warningAt: new Date(Date.now() + 48 * HOUR_MS), sweepAt: new Date(Date.now() + 72 * HOUR_MS) } });
    const tip = await LawOfficialService.buyTip(app.prisma, playerId, { kind: 'SWEEP', actionId: randomUUID() });
    expect(tip.result.payload).toMatchObject({ citySlug: 'detroit', cityName: detroit.name });
    expect(tip.before.cashCents - tip.after.cashCents).toBe(Number(lawPriceCents(WORTH, rules.law.informants.sweep)));
    await resetWorth();

    const word = await LawOfficialService.buyTip(app.prisma, playerId, { kind: 'CITY', citySlug: 'detroit', actionId: randomUUID() });
    expect(word.result.payload).toMatchObject({ bustStartsAt: rules.cities.detroit.heat.bustStartsAt, arrestStartsAt: rules.cities.detroit.heat.arrestStartsAt, policePressure: rules.cities.detroit.policePressure });
    await expect(LawOfficialService.buyTip(app.prisma, playerId, { kind: 'CITY', citySlug: 'detroit', actionId: randomUUID() })).rejects.toMatchObject({ code: 'NOTHING_TO_TELL' });
    await expect(LawOfficialService.buyTip(app.prisma, playerId, { kind: 'CITY', citySlug: home, actionId: randomUUID() })).rejects.toMatchObject({ code: 'NOTHING_TO_TELL' });

    // Once it is public, nobody sells it, and nothing is charged.
    await app.prisma.turfCrackdown.updateMany({ where: { roundId }, data: { warningAt: new Date(Date.now() - 1_000) } });
    const cash = (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cashCents;
    await expect(LawOfficialService.buyTip(app.prisma, playerId, { kind: 'SWEEP', actionId: randomUUID() })).rejects.toMatchObject({ code: 'NOTHING_TO_TELL' });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cashCents).toBe(cash);
    expect(await app.prisma.playerCase.count({ where: { roundPlayerId: playerId } })).toBe(0);
    expect((await page()).informants!.tips).toHaveLength(2);
  });
});
