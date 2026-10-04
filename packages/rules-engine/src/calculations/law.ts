import type { LawRules, WantedStage } from '@streets/rulesets';

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
