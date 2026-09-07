/**
 * Work the Streets. The only action that makes money.
 *
 * BALANCE_APPROXIMATION.
 *
 * You take the crew out to a district and put them to work. The girls earn,
 * you take your cut, and everybody comes home more tired than they left.
 *
 * The tension, and the reason the payout slider matters:
 *
 *   a turn worked costs the crew `wearPerTurn` points of fatigue, and their
 *   share of the take pays some of it back. Pay them what the work is worth
 *   and they break even. Pay less and they wear down every night until they
 *   walk. Pay more, or work a district rich enough that even a thin slice is
 *   good money, and they recover.
 *
 * That is why a stingy cut can be perfectly fine in the Casino and ruinous in
 * the Wino Slums: relief is measured in what actually reaches their pocket,
 * not in the percentage.
 */

import { districts } from './districts.js';
import type { WorkRules } from '../types.js';

export const work = {
  turnCostPerRun: 1,
  minTurns: 1,

  districts,

  /** Gross a whore brings in per turn worked, before happiness and district. */
  grossPerWhorePerTurnCents: 1_500,

  /**
   * Earnings scale linearly with whore happiness, all the way to nothing.
   * A worn out, badly paid stable does not earn its way back out.
   */
  minHappinessMultiplier: 0,

  /** Random spread on a night's take. */
  variance: 0.15,

  /** Working is the only thing that burns supplies. */
  consumption: {
    condomsPerWhorePerTurn: 0.1,
    crackPerWhorePerTurn: 0.05,
    beerPerThugPerTurn: 0.02,
  },

  /** Shortages add lasting wear; a generous cut cannot cancel it. */
  shortages: {
    whorePerTurnWithoutCondoms: 1,
    thugPerTurnWithoutBeer: 1,
  },

  fatigue: {
    /** Points of wear per turn worked. */
    whorePerTurn: 0.8,
    thugPerTurn: 0.4,

    /**
     * The take per head per turn that exactly cancels a turn's wear. The whole
     * crew is paid out of one pot, so hiring muscle you cannot pay for thins
     * everybody's share.
     */
    fairTakePerHeadPerTurnCents: 600,

    /** Relief is capped, so no district makes the crew immortal. */
    maxReliefMultiple: 2,
  },

  /**
   * Working a block your crew cannot cover. Girls with nobody watching them
   * get moved along, so the take suffers, and the night is harder on everyone.
   */
  exposure: {
    /** Fraction of the take lost when nobody at all is covered. */
    maxTakePenalty: 0.6,
    /** Extra wear multiplier at full exposure: 1.0 means double. */
    maxExtraFatigue: 1,
  },

  /** Every so often a night's work turns up product rather than cash. */
  finds: {
    chancePerTurn: 0.08,
    crackMin: 1,
    crackMax: 6,
  },
} as const satisfies WorkRules;
