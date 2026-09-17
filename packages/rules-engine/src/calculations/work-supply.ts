import type { Ruleset } from '@streets/rulesets';

/**
 * 0.4.0-B. Work supply: which products a job burns, in what order, and what
 * running short part-way through costs.
 *
 * A job is a district worked on a Scout trip, or PRODUCE for the shift the girls
 * work while the thugs cook. The player sets a policy per job; the trip is then
 * split into slices by product, so a trip that runs out part-way is charged and
 * paid for each slice rather than all-or-nothing.
 */

export const PRODUCE_JOB = 'PRODUCE';

export interface WorkSupplyPolicy {
  primary: string;
  fallback: string | null;
  emergency: string | null;
  /** Only the primary is ever burned; fallback and emergency are ignored. */
  strict: boolean;
}

export type WorkSupplyState = 'supplied' | 'substituted' | 'dry';

export interface WorkSupplySlice {
  /** Null for the dry slice. */
  product: string | null;
  state: WorkSupplyState;
  /** Product units this slice burns. The dry slice is the units that were missing. */
  units: number;
  /** Share of the trip this slice covers, 0..1. Slices sum to 1. */
  share: number;
  /** The same share in turns, for display. Not rounded. */
  turns: number;
  /** What this slice does to the take. */
  takeMultiplier: number;
}

export interface WorkSupplyPlan {
  job: string;
  policy: WorkSupplyPolicy;
  /** Product units the whole trip wants. */
  need: number;
  /** Units the trip would use per turn, for "turns of supply left". */
  perTurn: number;
  slices: WorkSupplySlice[];
  /** Units taken from each product. */
  consumed: Record<string, number>;
  /** Share-weighted take multiplier for the whole trip. */
  takeMultiplier: number;
  /** Turn at which supply first switches away from the primary, or null if it never does. */
  switchesAtTurn: number | null;
}

/** The policy a job uses before the player has set one: crack, nothing else, as every older round works. */
export function defaultWorkSupplyPolicy(): WorkSupplyPolicy {
  return { primary: 'CRACK', fallback: null, emergency: null, strict: false };
}

/** Products the policy may burn, in order, without repeats. */
export function workSupplyOrder(policy: WorkSupplyPolicy): string[] {
  const order = policy.strict ? [policy.primary] : [policy.primary, policy.fallback, policy.emergency];
  return order.filter((key, index): key is string => Boolean(key) && order.indexOf(key) === index);
}

function productTakeMultiplier(ruleset: Ruleset, key: string): number {
  return ruleset.products?.[key]?.work?.takeMultiplier ?? 1;
}

/**
 * Split a trip across the products its policy allows.
 *
 * `need` is computed the way crack always has been, floor(whores x rate x turns),
 * so a crack-only policy burns exactly what older rounds burn. Each product then
 * covers as much of the need as its stock allows; whatever is left is dry. A
 * slice's share is its units over the need, so one unit of a great product never
 * supplies a hundred workers.
 */
export function planWorkSupply(input: {
  job: string;
  whores: number;
  turns: number;
  policy: WorkSupplyPolicy;
  inventory: Record<string, number>;
  ruleset: Ruleset;
}): WorkSupplyPlan {
  const { job, whores, turns, policy, inventory, ruleset } = input;
  const rate = ruleset.workSupply?.productPerWhorePerTurn ?? ruleset.scouting.consumption.crackPerWhorePerTurn;
  const dryMultiplier = ruleset.workSupply?.dryTakeMultiplier ?? 1;
  const perTurn = Math.max(0, whores) * rate;
  const need = Math.floor(perTurn * Math.max(0, turns));
  const order = workSupplyOrder(policy);

  const slices: WorkSupplySlice[] = [];
  const consumed: Record<string, number> = {};
  let remaining = need;

  if (need === 0) {
    // Nobody to supply: the trip counts as fully supplied by the primary, and burns nothing.
    slices.push({ product: policy.primary, state: 'supplied', units: 0, share: 1, turns, takeMultiplier: productTakeMultiplier(ruleset, policy.primary) });
  } else {
    order.forEach((product, index) => {
      if (remaining <= 0) return;
      const units = Math.min(Math.max(0, inventory[product] ?? 0), remaining);
      if (units <= 0) return;
      remaining -= units;
      consumed[product] = units;
      const share = units / need;
      slices.push({ product, state: index === 0 ? 'supplied' : 'substituted', units, share, turns: share * turns, takeMultiplier: productTakeMultiplier(ruleset, product) });
    });
    if (remaining > 0) {
      const share = remaining / need;
      slices.push({ product: null, state: 'dry', units: remaining, share, turns: share * turns, takeMultiplier: dryMultiplier });
    }
  }

  const takeMultiplier = slices.reduce((sum, slice) => sum + slice.share * slice.takeMultiplier, 0);
  const primary = slices[0];
  const switchesAtTurn = primary && primary.product === policy.primary && primary.share < 1 ? primary.turns : primary?.product === policy.primary ? null : 0;

  return { job, policy, need, perTurn, slices, consumed, takeMultiplier, switchesAtTurn };
}
