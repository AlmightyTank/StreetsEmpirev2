/**
 * Money and net worth. Section 16.
 *
 * All money is integer cents. $1.00 = 100, $0.10 = 10. Never floats.
 */

import type { EconomyRules } from '../types.js';

export const economy = {
  currency: {
    centsPerDollar: 100,
    symbol: '$',
    code: 'USD',
  },

  /**
   * Net worth contribution per unit owned, in cents.
   * Beer and weapons deliberately contribute nothing in Classic.
   */
  netWorth: {
    perWhoreCents: 200_000, //   $2,000
    perThugCents: 75_000, //     $750
    perLowRiderCents: 300_000, //$3,000
    perMedicineCents: 500, //    $5
    perCrackCents: 300, //       $3
    perCondomCents: 10, //       $0.10
  },

  /** Whore payout split. Section 31. */
  payout: {
    min: 1,
    max: 99,
    default: 50,
  },

  /** Documented for clarity; these are simply absent from the formula. */
  netWorthExcluded: ['beer', 'pistols', 'shotguns', 'tek9s', 'ak47s'],
} as const satisfies EconomyRules;
