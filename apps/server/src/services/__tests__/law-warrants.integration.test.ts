import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV13B, classicOgV13C } from '@streets/rulesets';
import { businessStaff, rulesetForCity, startingStock, type Ruleset } from '@streets/rules-engine';
import type { LawPageDto } from '@streets/shared';
import { BusinessService } from '../business.service.js';
import { GameAlertService } from '../game-alerts.service.js';
import { LawService, type CaseEvidence } from '../law.service.js';
import { LawWarrantService } from '../law-warrant.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { TurfService } from '../turf.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV13C;
const warrants = rules.law.warrants;
const lawyer = rules.law.lawyer;
const home = rules.round.startingCitySlug;
const RICH = 10_000_000_000n;

/**
 * 1.3.0-C gate, live: a Case reaching the Warrant stage drafts one warrant against the target
 * it was built against; it is served after the window (raids honour protection, the day's cap
 * holds, the Case drops), a personal warrant waits for the boss, a lawyer answers it or makes
 * it lighter, and the player hears about each step. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.3.0-C warrants and lawyers with PostgreSQL', () => {
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
    const name = `lawc_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const round = await app.prisma.round.create({ data: {
      name: 'Law C fixture', slug: `law-c-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 30 * 86_400_000),
    } });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    detroitId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } })).id;
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId, cityId, displayName: name, publicPimpId: 7500,
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

  // 1.3.0-G audit: whatever a test did, every stored Case still adds up to its receipts.
  afterEach(async () => {
    const cases = await app.prisma.playerCase.findMany({ where: { roundPlayerId: playerId } });
    const sums = await app.prisma.playerCaseReceipt.groupBy({ by: ['cityId'], where: { roundPlayerId: playerId }, _sum: { deltaHundredths: true } });
    expect(cases.filter((row) => row.caseHundredths).map((row) => [row.cityId, row.caseHundredths]).sort()).toEqual(
      sums.filter((row) => row._sum.deltaHundredths).map((row) => [row.cityId, row._sum.deltaHundredths]).sort(),
    );
  });

  beforeEach(async () => {
    await app.prisma.playerWarrant.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerCaseReceipt.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerCase.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.notificationSettings.deleteMany({ where: { accountId } });
    await app.prisma.business.updateMany({ where: { roundId }, data: { level: 0, staff: 0, staffOwnerId: null, registerCents: 0n, racket: null, racketSince: null, racketShutFrom: null, racketShutUntil: null } });
    await app.prisma.turf.updateMany({ where: { roundId }, data: { holderId: null, cornerThugs: 0, heldSince: null } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: {
      ...rules.round.startingPlayer, ...startingStock(rules), cityId,
      whores: 100, thugs: 40, condoms: 5_000, beer: 5_000, crack: 500, turns: 144, cashCents: 10_000_000n, heat: 0,
      whoreHappiness: 100, thugHappiness: 100, lockedUntil: null, movingUntil: null, businessThugs: 0, businessWhores: 0, postedThugs: 0,
      racketEffects: {}, hideoutSafeRoomLevel: 0, policeLossDay: null, policeLossCents: 0n, lawyerRetainedUntil: null,
      netWorthCents: RICH, lastTurnCalculationAt: new Date(), lastActiveAt: new Date(),
    } });
    await app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, playerId, rules, { WEED: 1_000 }));
  });

  const evidence = (entries: Array<Omit<CaseEvidence, 'sourceKey'>>, now = new Date(), ruleset: Ruleset = rules) =>
    app.prisma.$transaction((tx) => LawService.record(tx, playerId, ruleset, entries.map((entry, i) => ({ ...entry, sourceKey: `test:${randomUUID()}:${i}` })), now));
  const open = () => app.prisma.playerWarrant.findMany({ where: { roundPlayerId: playerId }, orderBy: { draftedAt: 'asc' } });
  const me = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const caseIn = async (id: string) => (await app.prisma.playerCase.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: id } } }))?.caseHundredths ?? 0;
  /** Make every open warrant due, then settle the player as a page load would. */
  const serveNow = async () => {
    await app.prisma.playerWarrant.updateMany({ where: { roundPlayerId: playerId, status: 'OPEN' }, data: { servesAt: new Date(Date.now() - 1_000) } });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
  };

  it('drafts one warrant when a Case reaches the Warrant stage, against what built it', async () => {
    const before = Date.now();
    await evidence([{ cityId, points: 70, source: 'BUST' }]);
    const [warrant] = await open();
    expect(warrant).toMatchObject({ cityId, target: 'HIDEOUT', status: 'OPEN', businessId: null });
    expect(warrant!.servesAt.getTime() - warrant!.draftedAt.getTime()).toBe(warrants.warningHours * HOUR_MS);
    expect(warrant!.draftedAt.getTime()).toBeGreaterThanOrEqual(before);
    await evidence([{ cityId, points: 5, source: 'BUST' }]);
    expect(await open()).toHaveLength(1);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'WARRANT_DRAFTED' } })).toBe(1);

    // 1.3.0-B rounds keep no warrants at all.
    await evidence([{ cityId: detroitId, points: 90, source: 'HIJACK' }], new Date(), classicOgV13B);
    expect(await open()).toHaveLength(1);
  });

  it('shows what the detectives are looking at from Under Investigation, until a warrant is drafted', async () => {
    const page = async () => {
      const base = (await LawService.page(app.prisma, playerId, cityId, rules))!;
      return LawWarrantService.decoratePage(app.prisma, base, playerId);
    };
    await evidence([{ cityId, points: 30, source: 'BUST' }]);
    expect((await page()).cases[0]).toMatchObject({ stage: 'NOTICED', lookingAt: null });
    await evidence([{ cityId, points: 15, source: 'HIJACK' }, { cityId, points: 10, source: 'ROAD_STOP' }]);
    expect((await page()).cases[0]).toMatchObject({ stage: 'INVESTIGATION', lookingAt: { target: 'HIDEOUT', businessName: null } });
    await evidence([{ cityId, points: 15, source: 'HIJACK' }]);
    // The Warrant stage drafts the warrant, which now carries the target instead.
    expect((await page()).cases[0]).toMatchObject({ stage: 'WARRANT', lookingAt: null });
    expect((await open())[0]).toMatchObject({ target: 'PERSONAL' });
  });

  it('aims the next warrant at evidence since the last one, not the evidence that drafted it', async () => {
    await evidence([{ cityId, points: 70, source: 'BUST' }]);
    await serveNow();
    await evidence([{ cityId, cashCents: 250_000_000n, source: 'CURRENCY_REPORT' }]);
    await evidence([{ cityId, points: 30, source: 'HIJACK' }]);
    const [, second] = await open();
    expect(second).toMatchObject({ status: 'OPEN', target: 'PERSONAL' });
  });

  it('sweeps due warrants first, takes waiting ones in turn, and skips ended rounds', async () => {
    await evidence([{ cityId: detroitId, cashCents: 500_000_000n, source: 'CURRENCY_REPORT' }]);
    await serveNow();
    const [waiting] = await open();
    expect(waiting!.status).toBe('WAITING');
    expect(await LawWarrantService.dueOwners(app.prisma, new Date())).toContain(playerId);
    // Checking a waiting warrant again marks it, so it goes to the back of the queue.
    const checked = waiting!.updatedAt;
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    expect((await open())[0]!.updatedAt.getTime()).toBeGreaterThan(checked.getTime());

    const round = await app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    await app.prisma.round.update({ where: { id: roundId }, data: { endsAt: new Date(Date.now() - 1_000) } });
    try {
      expect(await LawWarrantService.dueOwners(app.prisma, new Date())).not.toContain(playerId);
    } finally {
      await app.prisma.round.update({ where: { id: roundId }, data: { endsAt: round.endsAt } });
    }
  });

  it('raids the Hideout: unprotected product and cash only, then drops the Case', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { hideoutSafeRoomLevel: 3 } });
    await evidence([{ cityId, points: 70, source: 'BUST' }]);
    await serveNow();
    const [warrant] = await open();
    expect(warrant).toMatchObject({ status: 'SERVED', target: 'HIDEOUT' });
    const after = await me();
    const outcome = warrant!.outcome as { fineCents: number; seized: Record<string, number>; capped: boolean };
    const protectedCash = BigInt(rules.combat.loot.protectedCashCents) + BigInt(rules.hideout.buffs.safeRoomProtectedCashCentsPerLevel * 3);
    expect(BigInt(outcome.fineCents)).toBe(BigInt(Math.floor(Number(10_000_000n - protectedCash) * warrants.hideout.cashFineFraction)));
    expect(outcome.capped).toBe(false);
    // The Safe Room sealed some product; only a share of what it left out was taken.
    const sealed = 1_500 - Object.values(outcome.seized).reduce((sum, units) => sum + units, 0) / warrants.hideout.productSeizedFraction;
    expect(sealed).toBeGreaterThan(0);
    expect(after.cashCents).toBe(10_000_000n - BigInt(outcome.fineCents));
    expect(await caseIn(cityId)).toBe(warrants.caseAfterServed * 100);
    expect(after.policeLossCents).toBeGreaterThan(0n);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'WARRANT_SERVED' } })).toBe(1);
  });

  it('holds a served warrant to the day’s cap', async () => {
    const netWorth = 10_000_000n;
    const cap = BigInt(Math.floor(Number(netWorth) * warrants.dailyLossCapNetWorthShare));
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { netWorthCents: netWorth, policeLossDay: new Date().toISOString().slice(0, 10), policeLossCents: cap - 100_000n } });
    await evidence([{ cityId, points: 70, source: 'BUST' }]);
    await serveNow();
    const [warrant] = await open();
    expect((warrant!.outcome as { capped: boolean }).capped).toBe(true);
    expect((await me()).policeLossCents).toBeLessThanOrEqual(cap);
  });

  it('raids a business: the racket shuts, the register is fined, the front keeps its block', async () => {
    await app.prisma.turf.updateMany({ where: { roundId, cityId, district: 'CASINO' }, data: { holderId: playerId, cornerThugs: 6, heldSince: new Date(Date.now() - 200 * HOUR_MS), upkeepAt: new Date() } });
    const row = await app.prisma.business.findFirstOrThrow({ where: { roundId, lot: 1, turf: { cityId, district: 'CASINO' } } });
    const staff = businessStaff(rules, row.kind as never, 5);
    await app.prisma.business.update({ where: { id: row.id }, data: {
      level: 5, staff, staffTarget: staff, staffOwnerId: playerId, registerCents: 4_000_000n, accruedAt: new Date(), racket: 'HOUSE_ALWAYS_WINS', racketSince: new Date(Date.now() - 200 * HOUR_MS),
    } });
    await app.prisma.$transaction((tx) => BusinessService.refreshRacketEffects(tx, playerId, rules));
    expect((await me()).racketEffects).toHaveProperty('HOUSE_ALWAYS_WINS');

    await evidence([{ cityId, heat: 700, source: 'RACKETS' }]);
    const [drafted] = await open();
    expect(drafted).toMatchObject({ target: 'BUSINESS', businessId: row.id });
    await serveNow();
    const raided = await app.prisma.business.findUniqueOrThrow({ where: { id: row.id } });
    expect(raided.racket).toBe('HOUSE_ALWAYS_WINS');
    expect(raided.racketShutUntil!.getTime() - raided.racketShutFrom!.getTime()).toBe(warrants.business.racketShutHours * HOUR_MS);
    expect(raided.registerCents).toBeLessThan(4_000_000n);
    expect(await app.prisma.turf.count({ where: { id: row.turfId, holderId: playerId } })).toBe(1);
    expect((await me()).racketEffects).not.toHaveProperty('HOUSE_ALWAYS_WINS');
  });

  it('serves a personal warrant at home as an arrest, with the lock-up', async () => {
    await evidence([{ cityId, cashCents: 50_000_000n * 10n, source: 'CURRENCY_REPORT' }]);
    const [warrant] = await open();
    expect(warrant).toMatchObject({ target: 'PERSONAL' });
    await serveNow();
    const after = await me();
    const arrest = rulesetForCity(rules, home).heat!.arrest!;
    expect(after.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + (arrest.downtimeMinutes - 1) * 60_000);
    expect(after.cashCents).toBe(10_000_000n - BigInt(Math.floor(10_000_000 * arrest.cashFineFraction)));
  });

  it('keeps a personal warrant waiting while the boss stays away, and lets a lawyer answer it', async () => {
    await evidence([{ cityId: detroitId, cashCents: 50_000_000n * 10n, source: 'CURRENCY_REPORT' }]);
    const [warrant] = await open();
    expect(warrant).toMatchObject({ cityId: detroitId, target: 'PERSONAL' });
    await serveNow();
    expect((await open())[0]!.status).toBe('WAITING');
    expect((await me()).cashCents).toBe(10_000_000n);

    const page = (await app.inject({ method: 'GET', url: '/api/game/law', headers: { cookie } })).json<LawPageDto>();
    const shown = page.warrants.find((row) => row.id === warrant!.id)!;
    expect(shown.status).toBe('WAITING');
    expect(shown.lawyerUpCents).toBeGreaterThanOrEqual(lawyer.lawyerUp.minCents);
    const answered = await LawWarrantService.lawyerUp(app.prisma, playerId, warrant!.id, randomUUID());
    expect(answered.result.feeCents).toBe(shown.lawyerUpCents);
    expect((await open())[0]).toMatchObject({ status: 'LAWYERED' });
    expect(await caseIn(detroitId)).toBe(warrants.caseAfterAnswered * 100);
    expect((await me()).cashCents).toBe(10_000_000n - BigInt(answered.result.feeCents));
    await expect(LawWarrantService.lawyerUp(app.prisma, playerId, warrant!.id, randomUUID())).rejects.toMatchObject({ code: 'WARRANT_NOT_OPEN' });
  });

  it('makes a served raid lighter with a lawyer on retainer', async () => {
    const worth = 400_000_000n;
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { netWorthCents: worth } });
    const hired = await LawWarrantService.retain(app.prisma, playerId, randomUUID());
    expect(hired.result.feeCents).toBe(Math.max(lawyer.retainer.minCents, Math.floor(Number(worth) * lawyer.retainer.netWorthShare)));
    // The action rewrote net worth from the real crew; keep the cap out of this test.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { netWorthCents: RICH } });
    const retainedUntil = (await me()).lawyerRetainedUntil!;
    expect(retainedUntil.getTime()).toBeGreaterThan(Date.now() + (lawyer.retainer.days * 24 - 1) * HOUR_MS);
    const cash = (await me()).cashCents;

    await evidence([{ cityId, points: 70, source: 'BUST' }]);
    await serveNow();
    const outcome = (await open())[0]!.outcome as { fineCents: number; retained: boolean };
    expect(outcome.retained).toBe(true);
    const protectedCash = BigInt(rules.combat.loot.protectedCashCents);
    expect(BigInt(outcome.fineCents)).toBe(BigInt(Math.floor(Number(cash - protectedCash) * warrants.hideout.cashFineFraction * (1 - lawyer.retainer.seizureCut))));
  });

  it('tells Discord a warrant is out, and that it was served, without amounts', async () => {
    await app.prisma.account.update({ where: { id: accountId }, data: { discordId: `lawc-${randomUUID().slice(0, 12)}` } });
    await app.prisma.notificationSettings.create({ data: { accountId, discordEnabled: true } });
    await evidence([{ cityId, points: 70, source: 'BUST' }]);
    const switches = { discord: true, push: false };
    const collect = async () => (await app.prisma.$transaction((tx) => GameAlertService.collect(tx, new Date(), switches)))
      .filter((row) => row.accountId === accountId)
      .map((row) => (row.payload as { notice: { title: string; body: string } }).notice);
    const first = await collect();
    expect(first.map((notice) => notice.title)).toEqual(['The police have more on you', 'A warrant is out for you']);
    expect(first[1]!.body).toMatch(/warrant for your hideout\. It is served in about 12 hours/);
    await serveNow();
    const second = await collect();
    expect(second.map((notice) => notice.title)).toEqual(['A warrant was served']);
    expect(second[0]!.body).not.toMatch(/\$|\d/);
    expect(await collect()).toEqual([]);
  });
});
