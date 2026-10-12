import { classicOgV165B } from '../classic-og-v1.6.5-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.5-C — Repeat Borrowing & Escalating Terms. Players can keep stacking loans under the
 * one shared ceiling, but each new loan costs more the deeper they already are and the
 * more installments they have missed this round. The offers and every other limit are
 * 1.6.5-B's; the fee ceiling rises so a deep, late borrower can really be charged for it.
 *
 * - Utilization: owed / ceiling before the loan. Under 25% is clean; 25%, 50% and 75% add
 *   4, 8 and 15 points of the cash advanced to the fee.
 * - History: 3 points for each installment missed this round, at most 15.
 * - Total fee never more than 60% of the cash advanced.
 *
 * BALANCE_APPROXIMATION throughout, for 1.6.5-G.
 */
export const classicOgV165C = {
  ...classicOgV165B,
  meta: { id: 'classic-og-v1.6.5-c', version: '1.6.5-C', name: 'Classic OG - Escalating Loans' },
  loanShark: {
    ...classicOgV165B.loanShark,
    maxContractFeePercent: 60,
    pricing: {
      utilizationTiers: [
        { fromPercent: 0, surchargePercent: 0, label: 'Clean' },
        { fromPercent: 25, surchargePercent: 4, label: 'Leaning' },
        { fromPercent: 50, surchargePercent: 8, label: 'Stretched' },
        { fromPercent: 75, surchargePercent: 15, label: 'In deep' },
      ],
      missedInstallmentSurchargePercent: 3,
      maxHistorySurchargePercent: 15,
    },
  },
} as const satisfies Ruleset;
