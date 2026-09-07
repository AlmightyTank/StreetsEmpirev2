/**
 * Scout for Whores. Sections 25-27.
 *
 * BALANCE_APPROXIMATION.
 *
 * Scouting is turns spent looking for people, and nothing else. Nobody is
 * working, so nothing is earned, nothing is consumed and nobody gets worn out.
 * Money is what Work the Streets is for.
 */

import { districts } from './districts.js';
import type { ScoutingRules } from '../types.js';

export const scouting = {
  /** Turns burned per unit of scouting. The player chooses how many. */
  turnCostPerScout: 1,
  minTurns: 1,

  districts,

  /**
   * Diminishing returns on recruitment.
   *
   * A district holds a finite number of people who have nowhere better to be.
   * The more of them you already run, the fewer new faces there are for you to
   * find, so a headline rate is what a nobody gets - not what an empire gets.
   *
   *   multiplier = softCap / (softCap + current)
   *
   * At the soft cap you recruit at half the headline rate, and growth over a
   * round goes from linear to roughly the square root of turns spent. That
   * gives the round a shape: recruit while you are small, then live off the
   * crew you built.
   */
  recruitment: {
    whoreSoftCap: 100,
    thugSoftCap: 50,
  },

  /**
   * Random spread on recruitment, plus or minus this fraction. Deliberately
   * wide: a scout should be able to come back with a haul or with nothing.
   */
  variance: 0.35,
} as const satisfies ScoutingRules;
