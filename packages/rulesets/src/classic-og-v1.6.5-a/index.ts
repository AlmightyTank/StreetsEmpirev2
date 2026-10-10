import { classicOgV16H } from '../classic-og-v1.6-h/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.5-A — Debt Foundation. Pins the loan shark's hard limits and schedule clock on top of
 * the full 1.6.0 supply season, and changes nothing else. There are no offers yet, so nobody
 * can borrow: 1.6.5-B adds the offers and the page that accepts them.
 *
 * - One debt ceiling a player, a round: every loan's unpaid obligation and unpaid late fees.
 * - A separate fee cap a player, a round, and another a loan, on late fees only.
 * - Installments fall due on the server clock, every `installmentIntervalHours`.
 *
 * BALANCE_APPROXIMATION throughout, for 1.6.5-G.
 */
export const classicOgV165A = {
  ...classicOgV16H,
  meta: { id: 'classic-og-v1.6.5-a', version: '1.6.5-A', name: 'Classic OG - Debt Foundation' },
  loanShark: {
    enabled: true,
    debtCeilingCents: 15_000_000,
    feeCapCents: 1_500_000,
    lateFeeCapPerLoanCents: 750_000,
    lateFeeCents: 250_000,
    installmentIntervalHours: 12,
    maxInstallments: 4,
    maxContractFeePercent: 40,
  },
} as const satisfies Ruleset;
