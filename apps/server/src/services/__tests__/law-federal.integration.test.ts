import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV13E } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { LawPageDto } from '@streets/shared';
import { LawService, type CaseEvidence } from '../law.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { TurfCrackdownService } from '../turf-crackdown.service.js';
import { TurfService } from '../turf.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV13E;
const law = rules.law;
const home = rules.round.startingCitySlug;

/**
 * 1.3.0-E gate, live: each city's police build, cool and warn at their own pace; Federal
 * shortens warrant windows and makes the sweep write more against the player, privately; and
 * a federal case follows a relocation, with its warrant, while a local one stays behind.
 * Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.3.0-E city identity and the Feds with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let playerId = '';
  let accountId = '';
  let cookie = '';
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = `lawe_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const round = await app.prisma.round.create({ data: {
      name: 'Law E fixture', slug: `law-e-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 30 * 86_400_000),
    } });
    roundId = round.id;
    for (const city of await app.prisma.city.findMany({ select: { id: true, slug: true } })) ids[city.slug] = city.id;
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId, cityId: ids[home]!, displayName: name, publicPimpId: 7700,
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
    for (const table of ['relocation', 'playerWarrant', 'playerCaseReceipt', 'playerCase', 'playerActivity', 'processedAction'] as const) {
      await (app.prisma[table] as unknown as { deleteMany: (args: object) => Promise<unknown> }).deleteMany({ where: { roundPlayerId: playerId } });
    }
    await app.prisma.turfCrackdown.deleteMany({ where: { roundId } });
    await app.prisma.turf.updateMany({ where: { roundId }, data: { holderId: null, cornerThugs: 0, cornerPistols: 0, heldSince: null } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: {
      ...rules.round.startingPlayer, ...startingStock(rules), cityId: ids[home]!, movingUntil: null, lockedUntil: null,
      whores: 100, thugs: 40, cashCents: 10_000_000n, heat: 0, postedThugs: 0, netWorthCents: 10_000_000_000n,
      lastTurnCalculationAt: new Date(), lastActiveAt: new Date(),
    } });
  });

  const evidence = (entries: Array<Omit<CaseEvidence, 'sourceKey'>>, now = new Date()) =>
    app.prisma.$transaction((tx) => LawService.record(tx, playerId, rules, entries.map((entry, i) => ({ ...entry, sourceKey: `test:${randomUUID()}:${i}` })), now));
  const caseIn = async (slug: string) => (await app.prisma.playerCase.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: ids[slug]! } } }))?.caseHundredths ?? 0;
  const warrantIn = (slug: string) => app.prisma.playerWarrant.findFirstOrThrow({ where: { roundPlayerId: playerId, cityId: ids[slug]! } });
  const windowHours = (warrant: { draftedAt: Date; servesAt: Date }) => (warrant.servesAt.getTime() - warrant.draftedAt.getTime()) / HOUR_MS;

  it('builds and cools a Case at each city’s pace, and says so on the panel', async () => {
    await evidence([{ cityId: ids['los-angeles']!, points: 10, source: 'HIJACK' }, { cityId: ids['las-vegas']!, points: 10, source: 'HIJACK' }]);
    expect(await caseIn('los-angeles')).toBe(1_250);
    expect(await caseIn('las-vegas')).toBe(700);
    const page = (await app.inject({ method: 'GET', url: '/api/game/law', headers: { cookie } })).json<LawPageDto>();
    const vegas = page.cases.find((row) => row.citySlug === 'las-vegas')!;
    expect(vegas.law).toMatchObject({ caseSpeed: 0.7, coolingSpeed: 0.5, warningHoursMultiplier: 0.5 });
    expect(vegas.cooling!.perHour).toBe(law.cooling.decayPerHour * 0.5);
  });

  it('warns at each city’s pace, and half as long at Federal', async () => {
    await evidence([{ cityId: ids.seattle!, points: 70 / 0.8, source: 'HIJACK' }]);
    expect(windowHours(await warrantIn('seattle'))).toBe(law.warrants.warningHours * 1.5);
    await evidence([{ cityId: ids[home]!, points: 90, source: 'BUST' }]);
    expect(windowHours(await warrantIn(home))).toBe(law.warrants.warningHours * law.federal.warningHoursMultiplier);
  });

  it('carries a federal case and its warrant to a new home, with a fresh window', async () => {
    await evidence([{ cityId: ids[home]!, points: 90, source: 'BUST' }]);
    const before = await warrantIn(home);
    const preview = await app.prisma.$transaction((tx) => LawService.federalPreview(tx, playerId, rules, ids[home]!));
    expect(preview).toMatchObject({ case: 90, oldCityCase: law.federal.transfer.oldCityCase });
    expect(preview!.arrivals.detroit).toBe(90);

    const arrivesAt = new Date(Date.now() - 1_000);
    await app.prisma.relocation.create({ data: { roundPlayerId: playerId, fromCity: home, toCity: 'detroit', feeCents: 0n, startedAt: new Date(arrivesAt.getTime() - HOUR_MS), arrivesAt } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { movingUntil: arrivesAt } });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });

    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cityId).toBe(ids.detroit);
    expect(await caseIn(home)).toBe(law.federal.transfer.oldCityCase * 100);
    expect(await caseIn('detroit')).toBe(9_000);
    const moved = await app.prisma.playerWarrant.findUniqueOrThrow({ where: { id: before.id } });
    expect(moved).toMatchObject({ cityId: ids.detroit, status: 'OPEN', target: 'HIDEOUT' });
    expect(moved.servesAt.getTime() - arrivesAt.getTime()).toBe(law.warrants.warningHours * law.federal.warningHoursMultiplier * HOUR_MS);
    expect(await app.prisma.playerWarrant.count({ where: { roundPlayerId: playerId } })).toBe(1);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'CASE_FOLLOWED' } })).toBe(1);
  });

  it('leaves a local case behind', async () => {
    await evidence([{ cityId: ids[home]!, points: 70, source: 'BUST' }]);
    expect(await app.prisma.$transaction((tx) => LawService.federalPreview(tx, playerId, rules, ids[home]!))).toBeNull();
    const arrivesAt = new Date(Date.now() - 1_000);
    await app.prisma.relocation.create({ data: { roundPlayerId: playerId, fromCity: home, toCity: 'detroit', feeCents: 0n, startedAt: new Date(arrivesAt.getTime() - HOUR_MS), arrivesAt } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { movingUntil: arrivesAt } });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    expect(await caseIn(home)).toBe(7_000);
    expect(await caseIn('detroit')).toBe(0);
    expect((await warrantIn(home)).cityId).toBe(ids[home]);
  });

  it('has the sweep write more against a holder already at Federal, and nothing public about it', async () => {
    await evidence([{ cityId: ids[home]!, points: 90, source: 'BUST' }]);
    await app.prisma.turf.updateMany({ where: { roundId, cityId: ids[home]!, district: 'LOW_RENT' }, data: { holderId: playerId, cornerThugs: 6, cornerPistols: 6, heldSince: new Date(Date.now() - 200 * HOUR_MS), upkeepAt: new Date() } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { postedThugs: 6, postedNetWorthCents: BigInt(6 * rules.economy.netWorth.perPistolCents) } });
    const now = new Date();
    await app.prisma.turfCrackdown.create({ data: { roundId, cityId: ids[home]!, warningAt: new Date(now.getTime() - 2 * HOUR_MS), sweepAt: new Date(now.getTime() - 1_000) } });
    const round = await app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    const swept = await app.prisma.$transaction((tx) => TurfCrackdownService.settleInTransaction(tx, round, rules, now));
    expect(swept?.sweptAt).not.toBeNull();
    const receipt = await app.prisma.playerCaseReceipt.findFirst({ where: { roundPlayerId: playerId, sourceKey: { startsWith: 'crackdown-federal:' } } });
    expect(receipt?.deltaHundredths).toBeGreaterThan(0);
    expect(JSON.stringify(swept!.results)).not.toMatch(/federal|case/i);
  });
});
