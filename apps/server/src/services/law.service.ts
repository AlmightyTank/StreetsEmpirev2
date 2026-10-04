import type { Prisma } from '@prisma/client';
import {
  addCase,
  CASE_SCALE,
  caseFromHeat,
  caseFromPoints,
  captainHeadsUp,
  cityCaseDelta,
  cityLaw,
  daSlowed,
  federalTransfer,
  coolCase,
  coolingStartsAt,
  currencyReports,
  lawDay,
  nextStage,
  productNetWorthCents,
  stageRank,
  stageStartsAt,
  WANTED_STAGES,
  wantedStage,
  type Ruleset,
} from '@streets/rules-engine';
import type { LawRules, WantedStage } from '@streets/rulesets';
import type { CaseSourceDto, LawPageDto, LawSummaryDto, TripHeatDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { LawWarrantService } from './law-warrant.service.js';
import { LawOfficialService } from './law-official.service.js';
import { QuestProgressService } from './quest-progress.service.js';

export type CaseSource = CaseSourceDto;

/**
 * One act the police write down, in one city. Exactly one of `cityId` or `citySlug` names
 * the city. `sourceKey` names the act, and is what keeps a retried action or a re-run settle
 * from adding evidence twice. An act can carry Heat it drew (a share becomes Case), direct
 * evidence points (negative ones take Case off), cash it moved (for currency reports), or
 * any mix of them.
 */
export interface CaseEvidence {
  cityId?: string;
  citySlug?: string;
  source: CaseSource;
  sourceKey: string;
  heat?: number;
  points?: number;
  cashCents?: bigint;
  /** 1.3.0-C. Bring the Case down to at most this, in hundredths: a warrant served or answered. */
  ceiling?: number;
  /** 1.3.0-E. Bring the Case up to at least this, in hundredths: a federal case arriving. */
  floor?: number;
}

/** 1.3.0-A's shape: Heat drawn, and nothing else. */
export type CaseHeat = CaseEvidence & { heat: number };

export interface CaseChange {
  cityId: string;
  /** The Case before this act, after any cooling. */
  before: number;
  after: number;
  stage: WantedStage;
  stageUp: boolean;
}

/** 1.3.0-C. Net-worth value of seized product, crack included, by product key. */
export function seizedValueCents(seized: Readonly<Record<string, number>>, ruleset: Ruleset): bigint {
  const { CRACK: crack = 0, ...rest } = seized;
  return BigInt(Math.max(0, crack)) * BigInt(ruleset.economy.netWorth.perCrackCents) + productNetWorthCents(rest, ruleset);
}

/**
 * 1.3.0-A/B. What a Scout or Produce trip leaves on the Case at home: the Heat it drew, and
 * from B a bust or an arrest as evidence of its own.
 */
export function tripCaseEvidence(heat: TripHeatDto | undefined, source: 'SCOUT' | 'PRODUCE', ruleset: Ruleset): Array<Omit<CaseEvidence, 'sourceKey'>> {
  if (!heat || !ruleset.law) return [];
  const evidence = ruleset.law.evidence;
  return [
    ...(heat.added > 0 ? [{ heat: heat.added, source }] : []),
    ...(evidence && heat.arrested ? [{ points: evidence.arrest, source: 'ARREST' as const }] : []),
    ...(evidence && heat.busted ? [{ points: evidence.bust, source: 'BUST' as const }] : []),
  ];
}

/** Sources that are not the player's own act: they never restart a Case's quiet clock. */
const PASSIVE = new Set<CaseSource>(['RACKETS', 'CRACKDOWN', 'LAUNDERING', 'COOLING', 'WARRANT', 'LAWYER', 'QUASH', 'ADMIN']);

/**
 * 1.3.0-F. Falls that are not the Case cooling: a warrant served or answered, a quash, or a
 * federal case moving. They still close a Case's book when it reaches Quiet; they just never
 * tell Ledger's Jobs it cooled.
 */
const NOT_COOLING = new Set<CaseSource>(['WARRANT', 'LAWYER', 'QUASH', 'FEDERAL', 'ADMIN']);

/**
 * 1.3.0-G. A staff correction sets the record straight and nothing more: it never drafts a
 * warrant, logs a stage rise, earns a Captain's tip or is slowed by a DA.
 */
const CORRECTION = new Set<CaseSource>(['ADMIN']);

/** 1.3.0-F. How far a Case has got since it last left Quiet, and when it left. */
interface CaseBook {
  peakStage: WantedStage;
  openedAt: Date | null;
}

function bookFor(row: { stage: string; peakStage: string; openedAt: Date | null; createdAt: Date } | null): CaseBook {
  if (!row || row.stage === 'QUIET') return { peakStage: 'QUIET', openedAt: null };
  const peak = stageRank(row.peakStage as WantedStage) >= stageRank(row.stage as WantedStage) ? row.peakStage as WantedStage : row.stage as WantedStage;
  return { peakStage: peak, openedAt: row.openedAt ?? row.createdAt };
}

/** The book after the Case reads `stage` at `now`: a fresh one opens as it leaves Quiet. */
function bookAt(book: CaseBook, stage: WantedStage, now: Date): CaseBook {
  if (stage === 'QUIET') return { peakStage: 'QUIET', openedAt: null };
  return {
    peakStage: stageRank(stage) > stageRank(book.peakStage) ? stage : book.peakStage,
    openedAt: book.openedAt ?? now,
  };
}

/**
 * 1.3.0-F. Tell Jobs a Case fell a stage. Only rulesets with Ledger emit, so older law rounds
 * grow no new quest traffic. The signal is private to the player like the Case itself, and
 * never an activity: nothing in the feed or on a profile shows it.
 */
async function emitCooled(
  tx: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  place: { id: string; slug: string; name: string },
  book: CaseBook,
  from: WantedStage,
  to: WantedStage,
  now: Date,
): Promise<void> {
  if (!ruleset.contacts?.LEDGER || stageRank(to) >= stageRank(from)) return;
  const served = await tx.playerWarrant.count({
    where: { roundPlayerId, cityId: place.id, status: 'SERVED', ...(book.openedAt ? { resolvedAt: { gte: book.openedAt } } : {}) },
  });
  await QuestProgressService.emit(tx, roundPlayerId, {
    sourceKey: `case-cooled:${place.id}:${now.toISOString()}:${from}:${to}`,
    type: 'CASE_COOLED',
    payload: {
      citySlug: place.slug,
      cityName: place.name,
      from,
      to,
      peak: book.peakStage,
      cleared: to === 'QUIET',
      peakWarrant: stageRank(book.peakStage) >= stageRank('WARRANT'),
      raided: served > 0,
    },
    at: now,
  });
}

/** B: cooling since the last write lands as one rolling receipt per quiet spell. */
async function writeCooling(
  tx: Db,
  roundPlayerId: string,
  cityId: string,
  clock: { caseHundredths: number; lastEvidenceAt: Date | null },
  cooledTo: number,
  rules: LawRules,
  now: Date,
): Promise<void> {
  const sourceKey = `cool:${cityId}:${clock.lastEvidenceAt?.toISOString() ?? 'start'}`;
  const cooled = cooledTo - clock.caseHundredths;
  const stageAfter = wantedStage(cooledTo, rules);
  await tx.playerCaseReceipt.upsert({
    where: { roundPlayerId_sourceKey: { roundPlayerId, sourceKey } },
    create: { roundPlayerId, cityId, source: 'COOLING', sourceKey, heat: 0, deltaHundredths: cooled, caseAfterHundredths: cooledTo, stageAfter, createdAt: now },
    update: { deltaHundredths: { increment: cooled }, caseAfterHundredths: cooledTo, stageAfter },
  });
}

/** How many receipts the page shows. */
const RECEIPT_LIMIT = 30;

function points(hundredths: number): number {
  return hundredths / CASE_SCALE;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * 1.3.0-A/B. The Case: what each city's police have on a player.
 *
 * Heat itself is untouched. Every place that adds Heat, and every act the police write down
 * (B), hands it to `record`, which changes the Case in the city it happened in with an
 * itemised receipt. A Case cools on read once its city has been quiet (B); the cooling is
 * written as a COOLING receipt with the next change, so the receipts always add up to the
 * stored Case. Callers hold the player's lock, as for any other write to the player.
 */
export const LawService = {
  async record(tx: Db, roundPlayerId: string, ruleset: Ruleset, entries: readonly CaseEvidence[], now: Date = new Date()): Promise<CaseChange[]> {
    const rules = ruleset.law;
    if (!rules) return [];
    const changes: CaseChange[] = [];
    const cities = new Map<string, { id: string; slug: string; name: string }>();

    async function city(entry: CaseEvidence) {
      const key = entry.cityId ?? `slug:${entry.citySlug}`;
      const known = cities.get(key);
      if (known) return known;
      const row = entry.cityId
        ? await tx.city.findUnique({ where: { id: entry.cityId }, select: { id: true, slug: true, name: true } })
        : entry.citySlug
          ? await tx.city.findUnique({ where: { slug: entry.citySlug }, select: { id: true, slug: true, name: true } })
          : null;
      if (row) cities.set(key, row);
      return row;
    }

    for (const entry of entries) {
      const cash = entry.cashCents && entry.cashCents > 0n && rules.currencyReport ? entry.cashCents : 0n;
      const direct = caseFromHeat(entry.heat ?? 0, rules) + caseFromPoints(entry.points ?? 0);
      if (direct === 0 && cash === 0n && entry.ceiling === undefined && entry.floor === undefined) continue;
      if (await tx.playerCaseReceipt.findUnique({ where: { roundPlayerId_sourceKey: { roundPlayerId, sourceKey: entry.sourceKey } }, select: { id: true } })) continue;
      const place = await city(entry);
      if (!place) continue;

      const existing = await tx.playerCase.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId, cityId: place.id } } });
      const clock = existing
        ? { caseHundredths: existing.caseHundredths, caseAt: existing.caseAt, lastEvidenceAt: existing.lastEvidenceAt }
        : { caseHundredths: 0, caseAt: now, lastEvidenceAt: null };
      // E: each city's police work at their own pace.
      const pace = cityLaw(rules, place.slug);
      const before = coolCase(clock, now, rules, pace.coolingSpeed);
      let book = bookFor(existing);

      // B: cooling since the last write lands as one rolling receipt per quiet spell.
      if (before < clock.caseHundredths) {
        await writeCooling(tx, roundPlayerId, place.id, clock, before, rules, now);
        // F: a stage it cooled out of reaches Ledger's Jobs.
        const cooledTo = wantedStage(before, rules);
        await emitCooled(tx, roundPlayerId, ruleset, place, book, (existing?.stage ?? 'QUIET') as WantedStage, cooledTo, now);
        book = bookAt(book, cooledTo, now);
      }

      // B: currency reports count the day's cash in this city, so a split movement still files.
      const day = lawDay(now);
      const dayCents = existing?.reportDay === day ? existing.reportCents : 0n;
      const reports = cash > 0n ? currencyReports(dayCents, cash, rules) : 0;
      let delta = cityCaseDelta(direct + caseFromPoints(reports * (rules.currencyReport?.points ?? 0)), pace);
      // E: a federal case arriving brings the Case up to its value, never stacked on top.
      if (entry.floor !== undefined) delta = Math.max(delta, entry.floor - before);
      // D: a District Attorney on the payroll keeps part of every rise off the books.
      if (delta > 0 && rules.officials && entry.source !== 'STING' && entry.source !== 'FEDERAL' && !CORRECTION.has(entry.source)) {
        const da = await LawOfficialService.working(tx, roundPlayerId, place.id, 'DA', now);
        const slowed = da ? daSlowed(delta, rules.officials.roles.DA.slowShare) : 0;
        if (da && slowed > 0) {
          delta -= slowed;
          await LawOfficialService.favor(tx, ruleset, da, 'daSlowedPoint', now, slowed / CASE_SCALE);
        }
      }
      // C: a warrant served or answered brings the Case down to its line, never up.
      if (entry.ceiling !== undefined) delta = Math.min(delta, entry.ceiling - before);

      const after = addCase(before, delta, rules);
      const stage = wantedStage(after, rules);
      const stageUp = stageRank(stage) > stageRank(wantedStage(before, rules));
      // F: a fall from washing or negative evidence is cooling too; a warrant's is not.
      if (!NOT_COOLING.has(entry.source)) await emitCooled(tx, roundPlayerId, ruleset, place, book, wantedStage(before, rules), stage, now);
      book = bookAt(book, stage, now);
      // The player's own act restarts the quiet clock, even when the Case is already at its cap.
      const active = delta > 0 && !PASSIVE.has(entry.source);

      await tx.playerCase.upsert({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: place.id } },
        create: {
          roundPlayerId, cityId: place.id, caseHundredths: after, stage, caseAt: now, createdAt: now,
          peakStage: book.peakStage, openedAt: book.openedAt,
          lastEvidenceAt: active ? now : null,
          ...(cash > 0n ? { reportDay: day, reportCents: cash } : {}),
        },
        update: {
          caseHundredths: after, stage, caseAt: now, peakStage: book.peakStage, openedAt: book.openedAt,
          ...(active ? { lastEvidenceAt: now } : {}),
          ...(cash > 0n ? { reportDay: day, reportCents: dayCents + cash } : {}),
        },
      });
      if (after === before) continue;

      await tx.playerCaseReceipt.create({
        data: {
          roundPlayerId, cityId: place.id, source: entry.source, sourceKey: entry.sourceKey,
          heat: entry.heat ?? 0, deltaHundredths: after - before, caseAfterHundredths: after, stageAfter: stage,
          // A correction's rise is not the police noticing anything: no stage alert reads it.
          stageUp: stageUp && !CORRECTION.has(entry.source), createdAt: now,
        },
      });
      if (CORRECTION.has(entry.source)) {
        changes.push({ cityId: place.id, before, after, stage, stageUp });
        continue;
      }
      if (stageUp) {
        await ActivityService.log(tx, roundPlayerId, 'CASE_STAGE_UP', json({
          citySlug: place.slug, cityName: place.name, stage, previousStage: wantedStage(before, rules), case: points(after),
        }));
      }
      // D: a Precinct Captain warns a few points before the Warrant line.
      if (rules.officials && captainHeadsUp(before, after, rules.officials.roles.CAPTAIN.headsUpPoints, rules)) {
        const captain = await LawOfficialService.working(tx, roundPlayerId, place.id, 'CAPTAIN', now);
        if (captain) {
          await ActivityService.log(tx, roundPlayerId, 'CAPTAIN_TIP', json({ citySlug: place.slug, cityName: place.name, case: points(after), warrantAt: rules.stages.warrant }));
          await LawOfficialService.favor(tx, ruleset, captain, 'captainTip', now);
        }
      }
      changes.push({ cityId: place.id, before, after, stage, stageUp });
      // C: a Case that has reached the Warrant stage drafts a warrant, if the city has none open.
      if (after > before && rules.warrants && stageRank(stage) >= stageRank('WARRANT')) {
        await LawWarrantService.draftIfDue(tx, roundPlayerId, ruleset, place.id, now, after);
      }
    }
    return changes;
  },

  /**
   * 1.3.0-F. Write down any Case that has cooled out of its stage since it was last written,
   * so Ledger's Jobs hear about it even when the player adds nothing more in that city. Only
   * rulesets with Ledger do this; the Case it writes is exactly what a read already shows.
   * Callers hold the player's lock, from the same settle that serves due warrants.
   */
  async settleCooling(tx: Db, roundPlayerId: string, ruleset: Ruleset, now: Date = new Date()): Promise<void> {
    const rules = ruleset.law;
    if (!rules?.cooling || !ruleset.contacts?.LEDGER) return;
    const open = await tx.playerCase.findMany({
      where: { roundPlayerId, stage: { not: 'QUIET' } },
      include: { city: { select: { id: true, slug: true, name: true } } },
      orderBy: { cityId: 'asc' },
    });
    for (const row of open) {
      const cooled = coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed);
      const stage = wantedStage(cooled, rules);
      if (stageRank(stage) >= stageRank(row.stage as WantedStage)) continue;
      await writeCooling(tx, roundPlayerId, row.cityId, row, cooled, rules, now);
      const book = bookFor(row);
      await emitCooled(tx, roundPlayerId, ruleset, row.city, book, row.stage as WantedStage, stage, now);
      const next = bookAt(book, stage, now);
      await tx.playerCase.update({
        where: { id: row.id },
        data: { caseHundredths: cooled, stage, caseAt: now, peakStage: next.peakStage, openedAt: next.openedAt },
      });
    }
  },

  /**
   * 1.3.0-C. Police took something: a bust, an arrest, a raid or a fine, at net-worth value.
   * Counted toward the day's cap, which only ever shrinks what a warrant takes.
   */
  async notePoliceLoss(tx: Db, roundPlayerId: string, ruleset: Ruleset, cents: bigint, now: Date = new Date()): Promise<void> {
    if (!ruleset.law?.warrants || cents <= 0n) return;
    const day = lawDay(now);
    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { policeLossDay: true, policeLossCents: true } });
    const today = player.policeLossDay === day ? player.policeLossCents : 0n;
    await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { policeLossDay: day, policeLossCents: today + cents } });
  },

  /** 1.3.0-E. A player's Case in one city as it stands now, cooling included. */
  async caseIn(db: Db, roundPlayerId: string, ruleset: Ruleset, cityId: string, now: Date = new Date()): Promise<number> {
    const rules = ruleset.law;
    if (!rules) return 0;
    const row = await db.playerCase.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId, cityId } }, include: { city: { select: { slug: true } } } });
    return row ? coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed) : 0;
  },

  /**
   * 1.3.0-E. What a relocation out of the player's home would do to a federal case there: its
   * value now, what the old city keeps, and what each destination's Case would become. Null
   * when the home Case is below Federal (it stays behind) or the round has no Feds.
   */
  async federalPreview(db: Db, roundPlayerId: string, ruleset: Ruleset, homeCityId: string, now: Date = new Date()): Promise<{ cityName: string; case: number; oldCityCase: number; arrivals: Record<string, number> } | null> {
    const rules = ruleset.law;
    if (!rules?.federal) return null;
    const leaving = await LawService.caseIn(db, roundPlayerId, ruleset, homeCityId, now);
    const preview = federalTransfer(leaving, 0, rules);
    if (!preview) return null;
    const [home, rows] = await Promise.all([
      db.city.findUniqueOrThrow({ where: { id: homeCityId }, select: { name: true } }),
      db.playerCase.findMany({ where: { roundPlayerId }, include: { city: { select: { slug: true } } } }),
    ]);
    const arrivals: Record<string, number> = {};
    for (const slug of Object.keys(ruleset.cities ?? {})) {
      const row = rows.find((candidate) => candidate.city.slug === slug);
      const there = row ? coolCase(row, now, rules, cityLaw(rules, slug).coolingSpeed) : 0;
      arrivals[slug] = points(federalTransfer(leaving, there, rules)!.arriving);
    }
    return { cityName: home.name, case: points(leaving), oldCityCase: points(preview.leaving), arrivals };
  },

  /**
   * 1.3.0-E. A relocation has arrived. A federal case in the city left moves to the new home
   * (its value, or the new city's own if higher), the old city keeps a local file, and an open
   * warrant there follows with a fresh window. Below Federal, nothing moves.
   */
  async followRelocation(tx: Db, roundPlayerId: string, ruleset: Ruleset, move: { id: string; fromCity: string; toCityId: string }, at: Date): Promise<void> {
    const rules = ruleset.law;
    if (!rules?.federal) return;
    const from = await tx.city.findUnique({ where: { slug: move.fromCity }, select: { id: true, name: true } });
    if (!from || from.id === move.toCityId) return;
    const leaving = await LawService.caseIn(tx, roundPlayerId, ruleset, from.id, at);
    const arriving = await LawService.caseIn(tx, roundPlayerId, ruleset, move.toCityId, at);
    const transfer = federalTransfer(leaving, arriving, rules);
    if (!transfer) return;
    // The warrant moves first, so arriving at Federal does not draft a second one.
    await LawWarrantService.followRelocation(tx, roundPlayerId, ruleset, from.id, move.toCityId, transfer.arriving, at);
    await LawService.record(tx, roundPlayerId, ruleset, [
      { cityId: from.id, ceiling: transfer.leaving, source: 'FEDERAL', sourceKey: `federal-out:${move.id}` },
      { cityId: move.toCityId, floor: transfer.arriving, source: 'FEDERAL', sourceKey: `federal-in:${move.id}` },
    ], at);
    const to = await tx.city.findUniqueOrThrow({ where: { id: move.toCityId }, select: { name: true } });
    await ActivityService.log(tx, roundPlayerId, 'CASE_FOLLOWED', json({
      fromCityName: from.name, toCityName: to.name, case: points(transfer.arriving), oldCityCase: points(transfer.leaving),
    }));
  },

  /** 1.3.0-A. Heat drawn, turned into Case. */
  recordHeat(tx: Db, roundPlayerId: string, ruleset: Ruleset, gains: readonly CaseHeat[], now: Date = new Date()): Promise<CaseChange[]> {
    return LawService.record(tx, roundPlayerId, ruleset, gains, now);
  },

  /** The worst Case the player has anywhere, for the dashboard. Null on rounds without a law block. */
  async summary(db: Db, roundPlayerId: string, ruleset: Ruleset, now: Date = new Date()): Promise<LawSummaryDto | null> {
    const rules = ruleset.law;
    if (!rules) return null;
    const rows = await db.playerCase.findMany({ where: { roundPlayerId }, include: { city: { select: { slug: true, name: true } } } });
    let worst: { hundredths: number; cityName: string } | null = null;
    for (const row of rows) {
      const hundredths = coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed);
      if (hundredths > 0 && (!worst || hundredths > worst.hundredths)) worst = { hundredths, cityName: row.city.name };
    }
    if (!worst) return { stage: 'QUIET', case: 0, cityName: null };
    return { stage: wantedStage(worst.hundredths, rules), case: points(worst.hundredths), cityName: worst.cityName };
  },

  /** The player's own Case in every city, and the latest receipts. Null on rounds without a law block. */
  async page(db: Db, roundPlayerId: string, homeCityId: string, ruleset: Ruleset, now: Date = new Date()): Promise<LawPageDto | null> {
    const rules = ruleset.law;
    if (!rules) return null;
    const [rows, receipts] = await Promise.all([
      db.playerCase.findMany({ where: { roundPlayerId }, include: { city: { select: { slug: true, name: true } } } }),
      db.playerCaseReceipt.findMany({
        where: { roundPlayerId },
        include: { city: { select: { slug: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECEIPT_LIMIT,
      }),
    ]);

    const cases = rows
      .map((row) => ({ row, hundredths: coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed) }))
      .sort((a, b) => b.hundredths - a.hundredths || b.row.updatedAt.getTime() - a.row.updatedAt.getTime());

    return {
      caseMax: rules.caseMax,
      heatToCase: rules.heatToCase,
      evidence: rules.evidence ? { ...rules.evidence } : null,
      currencyReport: rules.currencyReport ? { ...rules.currencyReport } : null,
      cooling: rules.cooling ? { ...rules.cooling } : null,
      laundering: rules.laundering ? { ...rules.laundering } : null,
      warrants: [],
      lawyer: null,
      dailyLoss: null,
      payroll: null,
      informants: null,
      contact: ruleset.contacts?.LEDGER
        ? { name: ruleset.contacts.LEDGER.name, shortName: ruleset.contacts.LEDGER.shortName, role: ruleset.contacts.LEDGER.role, description: ruleset.contacts.LEDGER.description }
        : null,
      stages: WANTED_STAGES.map((stage) => ({ stage, startsAt: points(stageStartsAt(stage, rules)) })),
      cases: cases.map(({ row, hundredths }) => {
        const next = nextStage(hundredths, rules);
        const starts = hundredths > 0 ? coolingStartsAt(row, rules) : null;
        const pace = rules.cities ? cityLaw(rules, row.city.slug) : null;
        return {
          citySlug: row.city.slug,
          cityName: row.city.name,
          isHome: row.cityId === homeCityId,
          case: points(hundredths),
          stage: wantedStage(hundredths, rules),
          next: next ? { stage: next.stage, startsAt: points(next.startsAt) } : null,
          cooling: starts && rules.cooling ? { startsAt: starts.toISOString(), perHour: rules.cooling.decayPerHour * (pace?.coolingSpeed ?? 1) } : null,
          law: pace ? { blurb: pace.blurb, caseSpeed: pace.caseSpeed, coolingSpeed: pace.coolingSpeed, warningHoursMultiplier: pace.warningHoursMultiplier } : null,
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      receipts: receipts.map((row) => ({
        id: row.id,
        citySlug: row.city.slug,
        cityName: row.city.name,
        source: row.source as CaseSource,
        heat: Math.round(row.heat * 100) / 100,
        added: points(row.deltaHundredths),
        caseAfter: points(row.caseAfterHundredths),
        stageAfter: row.stageAfter as WantedStage,
        at: row.createdAt.toISOString(),
      })),
    };
  },
};
