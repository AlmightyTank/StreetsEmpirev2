import type { HeatRules, Ruleset } from '@streets/rulesets';
import type { Rng } from '../rng.js';
import type { WorkSupplyPlan } from './work-supply.js';

/**
 * 0.4.0-C. Heat: the attention a crew's product draws.
 *
 * Heat is a whole number from 0 to `max`, stored on the player. It rises with
 * the product a trip burns, decays on the turn clock, drags the take once it is
 * high and risks a bust once it is higher. Everything here is pure; the server
 * settles, rolls and writes.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Heat after `intervals` turn intervals of decay. */
export function decayHeat(heat: number, intervals: number, rules: HeatRules): number {
  return clamp(heat - Math.max(0, intervals) * rules.decayPerInterval, 0, rules.max);
}

/** Whole Heat a trip adds, from its supply plans. */
export function tripHeat(plans: Array<WorkSupplyPlan | undefined>): number {
  return Math.round(plans.reduce((sum, plan) => sum + (plan?.heat ?? 0), 0));
}

export function addHeat(heat: number, added: number, rules: HeatRules): number {
  return clamp(heat + added, 0, rules.max);
}

/** What Heat does to the take: 1 below the drag line, falling to 1 - maxTakePenalty at max. */
export function heatTakeMultiplier(heat: number, ruleset: Ruleset): number {
  const rules = ruleset.heat;
  if (!rules) return 1;
  const span = rules.max - rules.drag.startsAt;
  if (span <= 0 || heat <= rules.drag.startsAt) return 1;
  return 1 - rules.drag.maxTakePenalty * clamp((heat - rules.drag.startsAt) / span, 0, 1);
}

/** Chance a trip is busted at this Heat. */
export function bustChance(heat: number, ruleset: Ruleset): number {
  const rules = ruleset.heat;
  if (!rules || heat < rules.bust.startsAt) return 0;
  const span = rules.max - rules.bust.startsAt;
  if (span <= 0) return rules.bust.chanceAtMax;
  return rules.bust.chanceAtMax * clamp((heat - rules.bust.startsAt) / span, 0, 1);
}

export interface BustOutcome {
  busted: boolean;
  chance: number;
  /** Units seized from each product, crack included. Only products that lost something. */
  seized: Record<string, number>;
  fineCents: bigint;
  heatAfter: number;
}

/**
 * Roll for a bust at the Heat the trip started with, against what the player
 * holds once the trip is done. A bust seizes a share of every product, fines a
 * share of cash, and burns off some Heat.
 */
export function resolveBust(input: {
  heat: number;
  cashCents: bigint;
  products: Record<string, number>;
  ruleset: Ruleset;
  rng: Rng;
}): BustOutcome {
  const { heat, cashCents, products, ruleset, rng } = input;
  const chance = bustChance(heat, ruleset);
  const rules = ruleset.heat;
  if (!rules || chance <= 0 || rng() >= chance) {
    return { busted: false, chance, seized: {}, fineCents: 0n, heatAfter: heat };
  }

  const seized: Record<string, number> = {};
  for (const [key, quantity] of Object.entries(products)) {
    const taken = Math.floor(Math.max(0, quantity) * rules.bust.productSeizedFraction);
    if (taken > 0) seized[key] = taken;
  }
  const cash = cashCents > 0n ? cashCents : 0n;
  const fineCents = BigInt(Math.floor(Number(cash) * rules.bust.cashFineFraction));

  return { busted: true, chance, seized, fineCents, heatAfter: clamp(heat - rules.bust.heatDrop, 0, rules.max) };
}

/** Price of one point of Heat off: a share of net worth, never below the floor. */
export function bribeCentsPerPoint(netWorthCents: bigint, rules: HeatRules): bigint {
  const share = BigInt(Math.floor(Number(netWorthCents > 0n ? netWorthCents : 0n) * rules.bribe.netWorthFractionPerPoint));
  const floor = BigInt(rules.bribe.minCentsPerPoint);
  return share > floor ? share : floor;
}
