/**
 * Produce Crack. Sections 28-30.
 *
 * BALANCE_APPROXIMATION.
 *
 * Turns and money in, crack out. Nobody earns anything cooking, and it grinds
 * the thugs down harder than a night on the block does, because there is no
 * take to pay them back with.
 *
 * The reason to do it anyway is the price: ingredients cost a fraction of what
 * Pip's charges for a finished rock, so a crew with muscle to spare turns cash
 * into product at a discount instead of buying it retail.
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
     * What the ingredients for one rock cost. Pip's sells a finished rock for
     * ten times this, which is the whole argument for cooking your own. A
     * batch you cannot pay for simply comes out smaller.
     */
    ingredientCentsPerRock: 100,
  },

  /** Thugs on shift still drink. */
  consumption: {
    beerPerThugPerTurn: 0.02,
  },

  fatigue: {
    /** Cooking is unpaid grind, so it wears harder than working a district. */
    thugPerTurn: 0.6,
  },
} as const satisfies ProductionRules;
