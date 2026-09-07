/**
 * Happiness. Sections 19-21.
 *
 * Thug happiness is the frozen Classic formula and must not drift.
 *
 * Whore happiness is a BALANCE_APPROXIMATION, and it is no longer a pure
 * reading of the shelves: it is what you have stocked, minus the wear the crew
 * is carrying. Fatigue is stored on the player and moved by actions - working
 * a district for a cut that does not justify it drives it up, paying well or
 * resting brings it back down.
 *
 * The payout percentage deliberately does NOT appear here. A cut is only
 * generous relative to what the block actually pays, so it does its work
 * through fatigue in work.ts rather than as a flat penalty.
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

  fatigue: {
    /** Fatigue is a 0..100 scale, subtracted straight off happiness. */
    max: 100,
    /**
     * Wear shed per turn-regeneration interval of rest. At two turns every ten
     * minutes, a night away clears most of a hard day.
     */
    restPerInterval: 0.5,
  },
} as const satisfies HappinessRules;
