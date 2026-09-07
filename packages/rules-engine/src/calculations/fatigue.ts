import type { Ruleset } from '@streets/rulesets';

/**
 * Wear, and what pays it back.
 *
 * A turn worked costs the crew `wearPerTurn` points. Their share of the take
 * pays some of it back, measured against what a turn's work is actually worth
 * to a person - `fairTakePerHeadPerTurnCents` - rather than against a
 * percentage. That distinction is the whole mechanic:
 *
 *   a 20% cut of a Casino night reaches their pocket as good money
 *   a 60% cut of the Wino Slums does not
 *
 * So a stingy split is survivable somewhere rich and ruinous somewhere poor,
 * and "what should my payout be" stops having one right answer.
 */

export interface WorkFatigue {
  /** Points of wear the turns themselves cost. */
  wear: number;
  /** Points paid back by the crew's cut. */
  relief: number;
  /** wear - relief. Positive means they went home worse off. */
  change: number;
  /** relief / wear. 1.0 is break-even, above 1 is recovery. */
  reliefRatio: number;
}

export interface WorkFatigueInput {
  turns: number;
  /** Everybody who worked and expects a share. */
  crewSize: number;
  /** The crew's whole cut of the night, in cents. */
  crewTakeCents: bigint;
  /** Wear per turn for this half of the crew. */
  wearPerTurn: number;
}

export function calculateWorkFatigue(
  input: WorkFatigueInput,
  ruleset: Ruleset,
): WorkFatigue {
  const rules = ruleset.work.fatigue;

  const wear = input.wearPerTurn * input.turns;
  if (wear <= 0) return { wear: 0, relief: 0, change: 0, reliefRatio: 1 };

  if (input.crewSize <= 0 || input.turns <= 0) {
    return { wear, relief: 0, change: wear, reliefRatio: 0 };
  }

  const takePerHeadPerTurn =
    Number(input.crewTakeCents) / input.crewSize / input.turns;

  const reliefRatio = Math.min(
    rules.maxReliefMultiple,
    takePerHeadPerTurn / rules.fairTakePerHeadPerTurnCents,
  );

  const relief = wear * reliefRatio;

  return { wear, relief, change: wear - relief, reliefRatio };
}

/** Cooking pays nobody, so every point of it sticks. */
export function calculateGrindFatigue(turns: number, wearPerTurn: number): number {
  return Math.max(0, wearPerTurn * turns);
}

/** Wear shed by leaving the crew alone. Section 13's intervals, reused. */
export function calculateRest(intervals: number, ruleset: Ruleset): number {
  return Math.max(0, intervals * ruleset.happiness.fatigue.restPerInterval);
}

export function clampFatigue(value: number, ruleset: Ruleset): number {
  return Math.round(Math.min(ruleset.happiness.fatigue.max, Math.max(0, value)));
}
