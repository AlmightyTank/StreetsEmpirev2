import type { LawLawyerRules, LawOfficialPrice, LawOfficialRules, LawRules, LawWarrantRules, WantedStage } from '@streets/rulesets';

/**
 * 1.3.0-A. The Case: what one city's police have on a player.
 *
 * A Case is stored in hundredths of a point so a tenth of a point of Heat still counts,
 * and is shown as a whole stage on the Wanted ladder. Everything here is pure; the
 * server keeps the receipts and writes the rows.
 */

/** Hundredths in one Case point. */
export const CASE_SCALE = 100;

/** The ladder, lowest stage first. */
export const WANTED_STAGES: readonly WantedStage[] = ['QUIET', 'NOTICED', 'INVESTIGATION', 'WARRANT', 'FEDERAL'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The most a Case can hold, in hundredths. */
export function caseCap(rules: LawRules): number {
  return rules.caseMax * CASE_SCALE;
}

/**
 * Case, in hundredths, that `heat` drawn in a city adds there. Reads the Heat an act drew,
 * not what the Heat meter kept: a player already at max Heat still builds a Case.
 */
export function caseFromHeat(heat: number, rules: LawRules): number {
  if (!Number.isFinite(heat) || heat <= 0) return 0;
  return Math.round(heat * rules.heatToCase * CASE_SCALE);
}

/** A Case after `delta` hundredths, held to 0..caseMax. */
export function addCase(caseHundredths: number, delta: number, rules: LawRules): number {
  return clamp(Math.round(caseHundredths + delta), 0, caseCap(rules));
}

/** The Case at which a stage starts, in hundredths. Quiet starts at 0. */
export function stageStartsAt(stage: WantedStage, rules: LawRules): number {
  switch (stage) {
    case 'QUIET': return 0;
    case 'NOTICED': return rules.stages.noticed * CASE_SCALE;
    case 'INVESTIGATION': return rules.stages.investigation * CASE_SCALE;
    case 'WARRANT': return rules.stages.warrant * CASE_SCALE;
    case 'FEDERAL': return rules.stages.federal * CASE_SCALE;
  }
}

/** The stage a Case reads as. Deterministic: there is no roll anywhere on the ladder. */
export function wantedStage(caseHundredths: number, rules: LawRules): WantedStage {
  let stage: WantedStage = 'QUIET';
  for (const candidate of WANTED_STAGES) {
    if (caseHundredths >= stageStartsAt(candidate, rules)) stage = candidate;
  }
  return stage;
}

/** Position on the ladder, 0 for Quiet. Higher is worse. */
export function stageRank(stage: WantedStage): number {
  return WANTED_STAGES.indexOf(stage);
}

/** The next stage up and where it starts, or null at Federal. */
export function nextStage(caseHundredths: number, rules: LawRules): { stage: WantedStage; startsAt: number } | null {
  const next = WANTED_STAGES[stageRank(wantedStage(caseHundredths, rules)) + 1];
  return next ? { stage: next, startsAt: stageStartsAt(next, rules) } : null;
}

// --- 1.3.0-B -----------------------------------------------------------------

const HOUR_MS = 3_600_000;

/** Case, in hundredths, for a number of direct-evidence points. */
export function caseFromPoints(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return Math.round(points * CASE_SCALE);
}

/** Where a stored Case stands: its value as of `caseAt`, and the last act that added to it. */
export interface CaseClock {
  caseHundredths: number;
  caseAt: Date;
  lastEvidenceAt: Date | null;
}

/**
 * When the Case starts cooling: a quiet spell after the last act that added to it, and never
 * before the stored value was last brought up to date. Null where the Case never cools.
 */
export function coolingStartsAt(clock: CaseClock, rules: LawRules): Date | null {
  if (!rules.cooling) return null;
  const quietEnds = clock.lastEvidenceAt ? clock.lastEvidenceAt.getTime() + rules.cooling.quietHours * HOUR_MS : -Infinity;
  return new Date(Math.max(clock.caseAt.getTime(), quietEnds));
}

/** The Case as it stands at `now`, after any cooling since `caseAt`. Never below zero. */
export function coolCase(clock: CaseClock, now: Date, rules: LawRules): number {
  const starts = coolingStartsAt(clock, rules);
  if (!starts || !rules.cooling || clock.caseHundredths <= 0) return Math.max(0, clock.caseHundredths);
  const hours = Math.max(0, now.getTime() - starts.getTime()) / HOUR_MS;
  const cooled = Math.floor(hours * rules.cooling.decayPerHour * CASE_SCALE);
  return Math.max(0, clock.caseHundredths - cooled);
}

/** The UTC day a currency report or a laundering count belongs to. */
export function lawDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Currency reports filed by moving `movedCents` in a city that has already seen `dayCents`
 * from the player today: one for every threshold the day's total crosses.
 */
export function currencyReports(dayCents: bigint, movedCents: bigint, rules: LawRules): number {
  const report = rules.currencyReport;
  if (!report || movedCents <= 0n || report.thresholdCents <= 0) return 0;
  const threshold = BigInt(report.thresholdCents);
  const before = dayCents > 0n ? dayCents : 0n;
  return Number((before + movedCents) / threshold - before / threshold);
}

/**
 * Case, in hundredths, a laundering racket washes for `heat` points of laundering capacity,
 * held to what is left of today's cap.
 */
export function launderedCase(heat: number, usedTodayHundredths: number, rules: LawRules): number {
  const wash = rules.laundering;
  if (!wash || !Number.isFinite(heat) || heat <= 0) return 0;
  const room = Math.max(0, wash.dailyCaseCap * CASE_SCALE - Math.max(0, usedTodayHundredths));
  return Math.min(room, Math.floor(heat * wash.casePerHeat * CASE_SCALE));
}

// --- 1.3.0-C -----------------------------------------------------------------

export type WarrantTarget = 'HIDEOUT' | 'BUSINESS' | 'PERSONAL';

const TARGET_ORDER: readonly WarrantTarget[] = ['HIDEOUT', 'BUSINESS', 'PERSONAL'];

/**
 * What a kind of evidence points the police at: work run out of the Hideout, the crew's
 * businesses, or the boss in person on the road and at the cage. Null for what took Case off.
 */
export function evidenceTarget(source: string): WarrantTarget | null {
  switch (source) {
    case 'SCOUT': case 'PRODUCE': case 'BUST': case 'ARREST': case 'COMBAT': case 'CONVOY':
      return 'HIDEOUT';
    case 'RACKETS': case 'TORCH': case 'SACK': case 'CRACKDOWN':
      return 'BUSINESS';
    case 'RUN_SALE': case 'ROAD_STOP': case 'HIJACK': case 'CURRENCY_REPORT':
      return 'PERSONAL';
    default:
      return null;
  }
}

/**
 * The target a warrant names: the kind of evidence with the most Case behind it, among the
 * targets the police can reach in that city. Ties go Hideout, business, then personal, and
 * the boss can always be named.
 */
export function chooseWarrantTarget(weights: Readonly<Record<WarrantTarget, number>>, reachable: { hideout: boolean; business: boolean }): WarrantTarget {
  const ranked = [...TARGET_ORDER].sort((a, b) => weights[b] - weights[a] || TARGET_ORDER.indexOf(a) - TARGET_ORDER.indexOf(b));
  for (const target of ranked) {
    if (target === 'PERSONAL') return target;
    if (target === 'HIDEOUT' && reachable.hideout) return target;
    if (target === 'BUSINESS' && reachable.business) return target;
  }
  return 'PERSONAL';
}

function shareOf(cents: bigint, share: number): bigint {
  if (cents <= 0n || share <= 0) return 0n;
  return BigInt(Math.floor(Number(cents) * share));
}

/** What a served warrant may still take today: the day's cap less what police already took. */
export function policeLossRoom(netWorthCents: bigint, lostTodayCents: bigint, rules: LawWarrantRules): bigint {
  const room = shareOf(netWorthCents, rules.dailyLossCapNetWorthShare) - (lostTodayCents > 0n ? lostTodayCents : 0n);
  return room > 0n ? room : 0n;
}

/** The share of a full raid that fits in the day's room: 1 when it all fits. */
export function lossCapShare(lossCents: bigint, roomCents: bigint): number {
  if (lossCents <= 0n || roomCents >= lossCents) return 1;
  if (roomCents <= 0n) return 0;
  return Number(roomCents) / Number(lossCents);
}

/** A week of a lawyer: a share of net worth, never below the floor. */
export function retainerCents(netWorthCents: bigint, rules: LawLawyerRules): bigint {
  const share = shareOf(netWorthCents, rules.retainer.netWorthShare);
  const floor = BigInt(rules.retainer.minCents);
  return share > floor ? share : floor;
}

/** Lawyering up: a premium over what the warrant would take, never below the floor. */
export function lawyerUpCents(estimateCents: bigint, rules: LawLawyerRules): bigint {
  const fee = BigInt(Math.ceil(Number(estimateCents > 0n ? estimateCents : 0n) * rules.lawyerUp.multiplier));
  const floor = BigInt(rules.lawyerUp.minCents);
  return fee > floor ? fee : floor;
}

// --- 1.3.0-D -----------------------------------------------------------------

/** A week of an official, or a tip: a share of net worth, never below the floor. */
export function lawPriceCents(netWorthCents: bigint, price: LawOfficialPrice): bigint {
  const share = shareOf(netWorthCents, price.netWorthShare);
  const floor = BigInt(price.minCents);
  return share > floor ? share : floor;
}

/** True when this much more exposure takes an official across the Internal Affairs line. */
export function crossesIaLine(before: number, added: number, rules: LawOfficialRules): boolean {
  return added > 0 && before < rules.exposure.line && before + added >= rules.exposure.line;
}

/** Case, in hundredths, a District Attorney keeps off a rise of `delta`. */
export function daSlowed(delta: number, slowShare: number): number {
  return delta > 0 ? Math.floor(delta * slowShare) : 0;
}

/** True when a rise from `before` to `after` crosses the point a Captain warns at. */
export function captainHeadsUp(before: number, after: number, headsUpPoints: number, rules: LawRules): boolean {
  if (!rules.warrants) return false;
  const warrantAt = stageStartsAt('WARRANT', rules);
  const warnAt = warrantAt - headsUpPoints * CASE_SCALE;
  return before < warnAt && after >= warnAt && after < warrantAt;
}
