/**
 * Working without protection. BALANCE_APPROXIMATION.
 *
 * The spec stocks Medicine at the Corner Store and gives it a net worth value,
 * but never says what it is for. This is what it is for.
 *
 * Any shift that puts the girls out - scouting a district or working while the
 * thugs cook - burns condoms. Come up short and there is a chance somebody
 * catches something, scaled by how short you were: a fully stocked stable is
 * never at risk, an empty one is at the full rate every turn.
 *
 * An infection is treated automatically if you are carrying medicine. If you
 * are not, she stops working for you. That is the whole loop: condoms are the
 * cheap prevention at $1, medicine is the expensive cure at $20, and a whore
 * is worth $2,000 - so neglecting both is by far the most expensive option.
 */

import type { HealthRules } from '../types.js';

export const health = {
  /**
   * Chance per turn worked that an entirely unprotected shift infects
   * somebody. Scaled down by however much of the shelf you did have.
   */
  infectionChancePerTurnUnprotected: 0.06,

  /** Medicine consumed treating one infection. */
  medicinePerTreatment: 1,

  /**
   * Ceiling on how much of the stable one action can infect, so a long trip
   * on an empty shelf is a bad night rather than an extinction event.
   */
  maxInfectedFractionPerAction: 0.08,
} as const satisfies HealthRules;
