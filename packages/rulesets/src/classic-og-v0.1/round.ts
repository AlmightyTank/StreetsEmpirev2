/**
 * Round shape and everything a brand new RoundPlayer starts with.
 * See GAME 0.1.0 sections 8, 10, 11, 12.
 */

import type { RoundRules } from '../types.js';

export const round = {
  /** Default length of a Classic round, used when an admin does not override it. */
  defaultDurationDays: 28,

  /**
   * OG-style public player ids start here and increment per round, so nobody
   * ever sees a raw database id and #1 does not look like a test account.
   */
  publicPimpIdStart: 1000,

  /** Every player starts here until Travel ships. */
  startingCitySlug: 'new-york-city',

  /** Section 11. Cash is in integer cents: $5,000 = 500_000. */
  startingPlayer: {
    cashCents: 500_000,

    turns: 200,

    whores: 1,
    thugs: 1,

    condoms: 250,
    medicine: 0,
    crack: 100,
    beer: 10,

    pistols: 0,
    shotguns: 0,
    tek9s: 0,
    ak47s: 0,

    lowRiders: 0,

    payoutPercent: 50,
  },
} as const satisfies RoundRules;
