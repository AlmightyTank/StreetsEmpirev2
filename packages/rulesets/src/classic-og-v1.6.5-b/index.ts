import { classicOgV165A } from '../classic-og-v1.6.5-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.5-B — Loan Offers & Acceptance. Three fixed tiers on the Loan Shark page, the same
 * terms for everyone they are open to. Bigger advances cost more a dollar, take longer to
 * repay, and are only fronted to bosses already worth something. Every tier's obligation is
 * reserved in full against the 1.6.5-A ceiling, so the tiers can be stacked only as far as
 * the ceiling allows. Nothing else changes from 1.6.5-A.
 *
 * BALANCE_APPROXIMATION throughout, for 1.6.5-G.
 */
export const classicOgV165B = {
  ...classicOgV165A,
  meta: { id: 'classic-og-v1.6.5-b', version: '1.6.5-B', name: 'Classic OG - Loan Offers' },
  loanShark: {
    ...classicOgV165A.loanShark,
    offers: [
      {
        key: 'QUICK_CASH',
        name: 'Quick Cash',
        description: 'A small advance to cover a gap. Paid back in two installments over a day.',
        principalCents: 1_000_000,
        contractFeeCents: 150_000,
        installmentCount: 2,
      },
      {
        key: 'STREET_ADVANCE',
        name: 'Street Advance',
        description: 'Enough for a supply order or a new ride. Three installments over a day and a half.',
        principalCents: 3_000_000,
        contractFeeCents: 600_000,
        installmentCount: 3,
        minNetWorthCents: 1_000_000,
      },
      {
        key: 'HEAVY_BANKROLL',
        name: 'Heavy Bankroll',
        description: 'Serious money for a serious play, at a serious price. Four installments over two days.',
        principalCents: 7_500_000,
        contractFeeCents: 2_250_000,
        installmentCount: 4,
        minNetWorthCents: 5_000_000,
      },
    ],
  },
} as const satisfies Ruleset;
