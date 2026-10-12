import { classicOgV165C } from '../classic-og-v1.6.5-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.5-E — Collection Pressure & Recovery. 1.6.5-D added payments without a ruleset, so
 * this builds on 1.6.5-C and changes nothing else.
 *
 * - Delinquent (any missed installment still owing): no new loans.
 * - Collections (two or more at once): 25% of each eligible income line is garnished toward
 *   what is overdue, at most $25,000 in any 24 hours, never more than is overdue or on hand.
 *   Eligible income is what the crew earns: street work, store and dealer sales, business,
 *   turf and racket income, run sales, and raid, convoy and hit winnings. Never borrowed cash.
 * - Recovery: clearing everything overdue ends collections; new loans unlock after two
 *   installments are paid on time, or as soon as nothing is owed.
 *
 * BALANCE_APPROXIMATION throughout, for 1.6.5-G.
 */
export const classicOgV165E = {
  ...classicOgV165C,
  meta: { id: 'classic-og-v1.6.5-e', version: '1.6.5-E', name: 'Classic OG - Loan Collections' },
  loanShark: {
    ...classicOgV165C.loanShark,
    collections: {
      missedInstallmentsThreshold: 2,
      garnishPercent: 25,
      garnishCapPerDayCents: 2_500_000,
      garnishSources: [
        'SCOUT',
        'STORE_SELL',
        'DEALER_SALES',
        'BUSINESS_INCOME',
        'TURF_TAX',
        'RACKETS',
        'RUN_SALE',
        'RUN_TRADE',
        'RAID',
        'CONVOY_ATTACK',
        'BOSS_HIT_ATTACK',
      ],
      recoveryOnTimeInstallments: 2,
    },
  },
} as const satisfies Ruleset;
