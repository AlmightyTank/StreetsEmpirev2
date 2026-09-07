/**
 * Turn regeneration. Section 13-15.
 *
 * Regeneration is lazy: nothing sweeps the player table every ten minutes.
 * Whenever turns are read we settle whole intervals and advance the clock by
 * exactly the number of intervals consumed, never to `now`, so the remainder
 * of the current interval is not thrown away on every page load.
 */

import type { TurnRules } from '../types.js';

export const turns = {
  amountPerInterval: 2,
  intervalMinutes: 10,
  cap: 200,

  awayBonus: {
    enabled: true,
    afterHours: 6,
    amount: 6,
  },

  reserveTurns: {
    enabled: false,
  },

  /** Purchased turns are a later version. */
  purchasedTurns: {
    enabled: false,
  },
} as const satisfies TurnRules;
