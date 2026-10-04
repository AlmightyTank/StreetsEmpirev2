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
