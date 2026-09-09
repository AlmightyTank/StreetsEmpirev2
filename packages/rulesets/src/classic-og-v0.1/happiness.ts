/**
 * Happiness. Sections 19-21.
 *
 * Thug happiness is the frozen Classic formula and must not drift.
 *
 * Whore happiness is a BALANCE_APPROXIMATION of the Classic behaviour, and it
 * is a pure reading of the player's current state - the cut they keep, what is
 * on the shelves, and whether anyone is watching them. Nothing accumulates and
 * nothing needs to be waited out: every input here is something the player can
 * change on their next action.
 */

import type { HappinessRules } from '../types.js';

export const happiness = {
  min: 0,
  max: 100,

  /** Frozen. 1 unhappiness per thug without a beer, 1 per thug without a gun. */
  thug: {
    penaltyPerThugWithoutBeer: 1,
    penaltyPerThugWithoutWeapon: 1,
  },

  whore: {
    /** Payout at or above this costs nothing. */
    neutralPayoutPercent: 50,
    /** Unhappiness per percentage point below neutral. */
    penaltyPerPayoutPercentBelowNeutral: 1,

    /** Condoms a whore expects to have stocked for her. */
    condomsPerWhore: 5,
    /** Worst case penalty when the condom shelf is completely empty. */
    maxCondomPenalty: 30,

    /** Rocks a whore expects to have stocked for her. */
    crackPerWhore: 2,
    /** Worst case penalty when the crack shelf is completely empty. */
    maxCrackPenalty: 25,

    /** One thug can look after this many whores. */
    whoresPerThug: 10,
    /** Worst case penalty when nobody is protected. */
    maxProtectionPenalty: 25,
  },

} as const satisfies HappinessRules;
