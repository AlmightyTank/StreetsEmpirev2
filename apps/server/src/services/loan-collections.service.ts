import type { LoanSharkRules } from '@streets/rulesets';
import { garnishCents } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';
import type { EconomyLedgerWrite } from './economy-ledger.service.js';
import { ActivityService } from './activity.service.js';
import { applyLoanPayment, loanOverdue, loanPaymentActivity } from './loan-ledger.service.js';

/**
 * 1.6.5-E. Garnishing income while a player is in collections.
 *
 * Eligible income is every positive economy-ledger line from the ruleset's garnish sources
 * (what the crew earns, never borrowed cash) recorded since the player went into
 * collections and not yet considered. Each line is considered exactly once: it is marked
 * whether anything was taken from it or not, so income above the day's cap is never taken
 * later. What is taken is a share of that income, capped for the rolling 24 hours, by what
 * is overdue and by the cash on hand, and is applied to overdue loans oldest first as a
 * COLLECTION payment: late fees, then missed installments. It never prepays the future.
 */

const ENTRY_BATCH = 500;
const DAY_MS = 86_400_000;

export interface GarnishOutcome {
  takenCents: bigint;
  debtReductionCents: bigint;
  /** Lines considered, whether or not anything was taken from them. */
  considered: number;
  ledger: EconomyLedgerWrite[];
}

export async function garnishIncome(db: Db, input: {
  roundPlayerId: string;
  rules: LoanSharkRules;
  since: Date | null;
  cashCents: bigint;
  debtCents: bigint;
  at: Date;
}): Promise<GarnishOutcome | null> {
  const collections = input.rules.collections;
  if (!collections || !input.since) return null;
  const entries = await db.economyLedgerEntry.findMany({
    where: {
      roundPlayerId: input.roundPlayerId,
      loanCollectedAt: null,
      createdAt: { gte: input.since, lte: input.at },
      amountCents: { gt: 0n },
      source: { in: [...collections.garnishSources] },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, amountCents: true },
    take: ENTRY_BATCH,
  });
  if (!entries.length) return null;

  const incomeCents = entries.reduce((sum, row) => sum + row.amountCents, 0n);
  const [taken24h, loans] = await Promise.all([
    db.loanPayment.aggregate({
      where: { roundPlayerId: input.roundPlayerId, kind: 'COLLECTION', createdAt: { gt: new Date(input.at.getTime() - DAY_MS) } },
      _sum: { amountCents: true },
    }),
    db.loan.findMany({
      where: { roundPlayerId: input.roundPlayerId, status: { not: 'PAID_OFF' } },
      include: { installments: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ acceptedAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const overdueCents = loans.reduce((sum, loan) => sum + loanOverdue(loan, input.at), 0n);
  const take = garnishCents(input.rules, {
    incomeCents,
    garnishedLast24hCents: taken24h._sum.amountCents ?? 0n,
    overdueCents,
    cashCents: input.cashCents,
  });

  // Considered once, taken from or not.
  await db.economyLedgerEntry.updateMany({ where: { id: { in: entries.map((row) => row.id) } }, data: { loanCollectedAt: input.at } });

  const outcome: GarnishOutcome = { takenCents: 0n, debtReductionCents: 0n, considered: entries.length, ledger: [] };
  let left = take;
  let debt = input.debtCents;
  for (const loan of loans) {
    if (left <= 0n) break;
    const overdue = loanOverdue(loan, input.at);
    if (overdue <= 0n) continue;
    const amount = left < overdue ? left : overdue;
    const applied = await applyLoanPayment(db, {
      roundPlayerId: input.roundPlayerId,
      loan,
      kind: 'COLLECTION',
      // The first line considered is never considered again, so this key is never reused.
      requestKey: `collection:${entries[0]!.id}:${loan.id}`,
      amountCents: amount,
      debtBeforeCents: debt,
      at: input.at,
    });
    left -= applied.allocation.appliedCents;
    debt -= applied.debtReductionCents;
    outcome.takenCents += applied.allocation.appliedCents;
    outcome.debtReductionCents += applied.debtReductionCents;
    outcome.ledger.push(...applied.ledger);
    await ActivityService.log(db, input.roundPlayerId, 'LOAN_PAYMENT', {
      ...(loanPaymentActivity(loan, input.rules, 'COLLECTION', applied.allocation, debt) as Record<string, unknown>),
      incomeCents: Number(incomeCents),
      garnishPercent: collections.garnishPercent,
    });
  }
  return outcome;
}
