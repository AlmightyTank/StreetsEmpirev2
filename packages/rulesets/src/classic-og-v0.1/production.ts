/**
 * Produce Crack. Manual 3.2, spec sections 28-30.
 *
 * BALANCE_APPROXIMATION.
 *
 *   "Producing crack sends your whores out, while your thugs produce crack to
 *    keep your whores happy, and keeps them from leaving you. But the whores
 *    produce less money because the thugs are busy and not managing the hoes."
 *
 * So this is not a rest day. The girls are still out earning and still burning
 * the shelf - they just earn less, because the muscle that would normally be
 * running them is inside cooking. What you buy with that lost income is crack,
 * and crack is what keeps them from walking out on you.
 *
 * The trade is therefore: money now, or the thing that stops your stable
 * shrinking. Scouting is the greedy option; this is the one that keeps it.
 */

import type { ProductionRules } from '../types.js';

export const production = {
  turnCostPerRun: 1,
  minTurns: 1,

  crack: {
    /** Rocks per thug per turn at full thug happiness. */
    perThugPerTurn: 0.5,
    /** Output scales with thug happiness down to this floor. */
    minHappinessMultiplier: 0.25,
    /** Random spread on the batch, plus or minus this fraction. */
    variance: 0.2,
    /**
     * What the ingredients for one rock cost. BALANCE_APPROXIMATION - neither
     * the spec nor manual 3.2 mentions a cash cost for cooking.
     *
     * Crack is a running cost, not an investment. The three prices are meant
     * to be read together:
     *
     *   cook it     $5   the cheap way to get a rock you need
     *   dump it     $3   what Pip's pays, so selling is a loss you take
     *                    when you need cash more than you need supply
     *   buy it     $10   the expensive way, for when you will not spend turns
     *
     * Cooking at $5 for a rock worth $3 of net worth means the crack you
     * supply your stable with costs you money, which is the point - it is
     * upkeep. It is still half what Pip's charges, so it stays worth doing.
     *
     * A batch you cannot pay for simply comes out smaller.
     */
    ingredientCentsPerRock: 500,
  },

  /**
   * Manual 3.2: "the whores produce less money because the thugs are busy and
   * not managing the hoes". They still go out; they just work unsupervised.
   */
  unsupervisedTakeMultiplier: 0.35,

} as const satisfies ProductionRules;
