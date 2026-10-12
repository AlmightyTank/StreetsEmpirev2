import type { Loan, LoanInstallment, LoanPaymentKind, LoanStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  allocateLoanPayment,
  contractFeeBudgetCents,
  contractFeeEarnedCents,
  loanPayoffCents,
  nextLoanStanding,
  type InstallmentDue,
  type LoanPaymentAllocation,
} from '@streets/rules-engine';
import type { LoanSharkRules } from '@streets/rulesets';
import type { LoanAccountDto, LoanCollectionState, LoanDto, LoanPaymentPreviewDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import type { EconomyLedgerWrite } from './economy-ledger.service.js';

/**
 * 1.6.5-A. The loan shark's books, shared by acceptance, repayment and the scheduled
 * settle. Every write here happens under the player's lock, inside the caller's
 * transaction, and is keyed so that a retry finds the first write instead of making another.
 *
 * Callers own the player's cash and debt columns: an action hands them back through
 * `next`, the settle writes them itself. Nothing here ever moves cash between loans.
 */

/** Where loan cash comes from and goes, in the economy ledger. */
export const LOAN_LEDGER = {
  /** Loan shark → player cash. */
  PROCEEDS: 'LOAN_PROCEEDS',
  /** Player cash → loan shark, by what the payment settled. */
  PRINCIPAL: 'LOAN_PRINCIPAL',
  CONTRACT_FEE: 'LOAN_CONTRACT_FEE',
  LATE_FEE: 'LOAN_LATE_FEE',
  /** 1.6.5-E. Player cash → loan shark, taken under collection pressure. */
  COLLECTION: 'LOAN_COLLECTION',
} as const;

const SHARK = 'loan-shark';
const CASH = 'cash';

export type LoanWithInstallments = Loan & { installments: LoanInstallment[] };

export function installmentDue(row: LoanInstallment): InstallmentDue {
  return {
    sequence: row.sequence,
    contractFeeDueCents: row.contractFeeCents - row.contractFeePaidCents - row.contractFeeWaivedCents,
    principalDueCents: row.principalCents - row.principalPaidCents,
  };
}

export function lateFeesDueCents(loan: Loan): bigint {
  return loan.lateFeesAssessedCents - loan.lateFeesPaidCents - loan.lateFeesWaivedCents;
}

/**
 * 1.6.5-F. The settle keys for one installment. An excusal reschedules it, and each excusal
 * starts a new generation, so a re-scheduled installment can be collected or missed again
 * once, and never twice in the same generation.
 */
export function installmentGeneration(row: Pick<LoanInstallment, 'id' | 'excusedAt'>): string {
  return row.excusedAt ? `${row.id}:${row.excusedAt.getTime()}` : row.id;
}

/** Everything a loan still owes on its full schedule, the whole contract fee included. */
export function loanOutstanding(loan: Loan): bigint {
  return (loan.principalCents - loan.principalPaidCents)
    + (loan.contractFeeCents - loan.contractFeePaidCents - loan.contractFeeWaivedCents)
    + lateFeesDueCents(loan);
}

/**
 * Contract fee earned by `at` and not yet paid: the most of the fee a payment may take then.
 * Earned is the even accrual over the term, and never less than the fee shares of every
 * installment already due, so an installment that has fallen due always owes its full share.
 */
export function loanFeeBudget(loan: LoanWithInstallments, at: Date): bigint {
  const accrued = contractFeeEarnedCents({ ...loan, now: at });
  const due = loan.installments.reduce((sum, row) => (row.dueAt.getTime() <= at.getTime() ? sum + row.contractFeeCents : sum), 0n);
  return contractFeeBudgetCents(accrued > due ? accrued : due, loan.contractFeePaidCents);
}

/** What pays the loan off at `at`: late fees, principal, and only the fee earned so far. */
export function loanPayoff(loan: LoanWithInstallments, at: Date): bigint {
  return loanPayoffCents(lateFeesDueCents(loan), loan.installments.map(installmentDue), loanFeeBudget(loan, at));
}

/**
 * 1.6.5-D. What is overdue on a loan at `at`: its unpaid late fees and whatever is still owed
 * on every installment whose due time has passed. Paying this much, in the documented order,
 * clears every missed installment and brings the loan current.
 */
export function loanOverdue(loan: LoanWithInstallments, at: Date): bigint {
  return loan.installments.reduce((sum, row) => {
    if (row.status === 'PAID' || row.dueAt.getTime() > at.getTime()) return sum;
    const owed = installmentDue(row);
    return sum + owed.contractFeeDueCents + owed.principalDueCents;
  }, lateFeesDueCents(loan));
}

/** How long a payoff quote is held: a payoff confirmed within this window never costs more. */
export const PAYOFF_HOLD_MS = 10 * 60_000;

/**
 * 1.6.5-D. Exactly what a payment of `amountCents` would do to a loan at `at`, without doing
 * it: the split, any fee waived, the loan's state after, and the player's debt and cash after.
 * The payment itself applies the same allocation, against the loan as it stands when it lands.
 */
export function loanPaymentPreview(
  loan: LoanWithInstallments,
  amountCents: bigint,
  at: Date,
  account: { debtCents: bigint; cashCents: bigint },
): LoanPaymentPreviewDto {
  const payoff = loanPayoff(loan, at);
  const overdue = loanOverdue(loan, at);
  const base = {
    loanId: loan.id,
    requestedCents: Number(amountCents),
    payoffCents: Number(payoff),
    payoffHoldCents: Number(loanPayoff(loan, new Date(at.getTime() + PAYOFF_HOLD_MS))),
    overdueCents: Number(overdue),
  };
  if (amountCents <= 0n || payoff === 0n) {
    return {
      ...base, paidCents: 0, lateFeeCents: 0, contractFeeCents: 0, principalCents: 0, contractFeeWaivedCents: 0,
      paysOff: payoff === 0n, clearsOverdue: overdue === 0n, statusAfter: loan.status,
      debtAfterCents: Number(account.debtCents), cashAfterCents: Number(account.cashCents), enoughCash: true,
    };
  }
  const allocation = allocateLoanPayment(amountCents, lateFeesDueCents(loan), loan.installments.map(installmentDue), loanFeeBudget(loan, at));
  const cleared = new Set(allocation.installments.filter((row) => row.cleared).map((row) => row.sequence));
  const stillMissed = loan.installments.some((row) => row.status === 'MISSED' && !cleared.has(row.sequence));
  return {
    ...base,
    paidCents: Number(allocation.appliedCents),
    lateFeeCents: Number(allocation.lateFeeCents),
    contractFeeCents: Number(allocation.contractFeeCents),
    principalCents: Number(allocation.principalCents),
    contractFeeWaivedCents: Number(allocation.contractFeeWaivedCents),
    paysOff: allocation.paidOff,
    clearsOverdue: allocation.appliedCents >= overdue,
    statusAfter: allocation.paidOff ? 'PAID_OFF' : stillMissed ? 'DELINQUENT' : 'ACTIVE',
    debtAfterCents: Number(account.debtCents - allocation.appliedCents - allocation.contractFeeWaivedCents),
    cashAfterCents: Number(account.cashCents - allocation.appliedCents),
    enoughCash: allocation.appliedCents <= account.cashCents,
  };
}

export function loanDto(loan: LoanWithInstallments, at: Date): LoanDto {
  return {
    id: loan.id,
    offerKey: loan.offerKey,
    status: loan.status,
    principalCents: Number(loan.principalCents),
    contractFeeCents: Number(loan.contractFeeCents),
    obligationCents: Number(loan.obligationCents),
    lateFeeCents: Number(loan.lateFeeCents),
    lateFeeCapCents: Number(loan.lateFeeCapCents),
    lateFeesAssessedCents: Number(loan.lateFeesAssessedCents),
    contractFeeWaivedCents: Number(loan.contractFeeWaivedCents),
    outstandingCents: Number(loanOutstanding(loan)),
    payoffCents: Number(loanPayoff(loan, at)),
    overdueCents: Number(loanOverdue(loan, at)),
    installments: [...loan.installments].sort((a, b) => a.sequence - b.sequence).map((row) => {
      const due = installmentDue(row);
      return {
        id: row.id,
        sequence: row.sequence,
        dueAt: row.dueAt.toISOString(),
        amountCents: Number(row.principalCents + row.contractFeeCents),
        principalCents: Number(row.principalCents),
        contractFeeCents: Number(row.contractFeeCents),
        remainingCents: Number(due.principalDueCents + due.contractFeeDueCents),
        status: row.status,
        missedAt: row.missedAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
      };
    }),
    acceptedAt: loan.acceptedAt.toISOString(),
    paidOffAt: loan.paidOffAt?.toISOString() ?? null,
  };
}

/** The player's debt against the limits the round's ruleset sets now. */
export function loanAccountDto(rules: LoanSharkRules, account: {
  loanDebtCents: bigint;
  loanFeesAssessedCents: bigint;
  loanCollectionState: LoanCollectionState;
  loanRecoveryNeeded?: number;
}): LoanAccountDto {
  const room = BigInt(rules.debtCeilingCents) - account.loanDebtCents;
  return {
    debtCents: Number(account.loanDebtCents),
    debtCeilingCents: rules.debtCeilingCents,
    availableCents: Number(room > 0n ? room : 0n),
    feesAssessedCents: Number(account.loanFeesAssessedCents),
    feeCapCents: rules.feeCapCents,
    collectionState: account.loanCollectionState,
    recoveryNeeded: account.loanRecoveryNeeded ?? 0,
  };
}

export function loadLoan(db: Db | PrismaClient, loanId: string): Promise<LoanWithInstallments | null> {
  return db.loan.findUnique({ where: { id: loanId }, include: { installments: { orderBy: { sequence: 'asc' } } } });
}

/** What a loan's state becomes once its balance and installments are as given. */
function loanStatusFor(outstanding: bigint, installments: readonly LoanInstallment[]): LoanStatus {
  if (outstanding === 0n) return 'PAID_OFF';
  return installments.some((row) => row.status === 'MISSED') ? 'DELINQUENT' : 'ACTIVE';
}

/** 1.6.5-D. A loan's offer by name, for history and the activity feed. */
export function loanOfferName(rules: LoanSharkRules | undefined, offerKey: string): string {
  return rules?.offers?.find((offer) => offer.key === offerKey)?.name ?? 'Loan';
}

/**
 * 1.6.5-D. The activity-feed payload for a payment. Deliberately no `cashCents` key: paying
 * the loan shark is not earning, and no Job may count it as such.
 */
export function loanPaymentActivity(loan: Pick<Loan, 'id' | 'offerKey'>, rules: LoanSharkRules | undefined, kind: LoanPaymentKind, allocation: LoanPaymentAllocation, debtAfterCents: bigint): Prisma.InputJsonValue {
  return {
    loanId: loan.id,
    offerName: loanOfferName(rules, loan.offerKey),
    kind,
    paidCents: Number(allocation.appliedCents),
    lateFeeCents: Number(allocation.lateFeeCents),
    contractFeeCents: Number(allocation.contractFeeCents),
    principalCents: Number(allocation.principalCents),
    contractFeeWaivedCents: Number(allocation.contractFeeWaivedCents),
    paidOff: allocation.paidOff,
    debtAfterCents: Number(debtAfterCents),
  };
}

/** The cash lines a payment writes: one per thing it settled, or one collection line. */
export function loanPaymentLedger(
  kind: LoanPaymentKind,
  allocation: Pick<LoanPaymentAllocation, 'lateFeeCents' | 'contractFeeCents' | 'principalCents' | 'appliedCents'>,
  metadata: { loanId: string; paymentId: string; offerKey: string },
): EconomyLedgerWrite[] {
  const meta = { ...metadata, kind, from: CASH, to: SHARK };
  if (kind === 'COLLECTION') {
    return [{
      source: LOAN_LEDGER.COLLECTION,
      label: 'Loan shark · collection',
      amountCents: -allocation.appliedCents,
      metadata: {
        ...meta,
        lateFeeCents: Number(allocation.lateFeeCents),
        contractFeeCents: Number(allocation.contractFeeCents),
        principalCents: Number(allocation.principalCents),
      },
    }];
  }
  const verb = kind === 'SCHEDULED' ? 'installment' : 'payment';
  return [
    { source: LOAN_LEDGER.LATE_FEE, label: `Loan shark · late fees (${verb})`, amountCents: -allocation.lateFeeCents, metadata: meta },
    { source: LOAN_LEDGER.CONTRACT_FEE, label: `Loan shark · contract fee (${verb})`, amountCents: -allocation.contractFeeCents, metadata: meta },
    { source: LOAN_LEDGER.PRINCIPAL, label: `Loan shark · principal (${verb})`, amountCents: -allocation.principalCents, metadata: meta },
  ].filter((line) => line.amountCents !== 0n);
}

export function proceedsLedger(loan: Pick<Loan, 'id' | 'offerKey' | 'principalCents'>): EconomyLedgerWrite {
  return {
    source: LOAN_LEDGER.PROCEEDS,
    label: 'Loan shark · cash advance',
    amountCents: loan.principalCents,
    metadata: { loanId: loan.id, offerKey: loan.offerKey, from: SHARK, to: CASH },
  };
}

export async function writeLoanEvent(db: Db, data: {
  roundPlayerId: string;
  loanId?: string | null;
  kind: Prisma.LoanEventCreateManyInput['kind'];
  debtDeltaCents?: bigint;
  debtAfterCents: bigint;
  requestKey: string;
  metadata?: Prisma.InputJsonValue;
  at: Date;
}): Promise<void> {
  await db.loanEvent.create({
    data: {
      roundPlayerId: data.roundPlayerId,
      loanId: data.loanId ?? null,
      kind: data.kind,
      debtDeltaCents: data.debtDeltaCents ?? 0n,
      debtAfterCents: data.debtAfterCents,
      requestKey: data.requestKey,
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      createdAt: data.at,
    },
  });
}

export interface AppliedLoanPayment {
  paymentId: string;
  allocation: LoanPaymentAllocation;
  /** 1.6.5-E. Installments this payment cleared that were never missed: paid on time or early. */
  onTimeCleared: number;
  /** Cash taken plus fee waived: what comes off the player's debt. */
  debtReductionCents: bigint;
  loan: LoanWithInstallments;
  ledger: EconomyLedgerWrite[];
}

/**
 * Applies cash the caller has already checked the player has to one loan, in the documented
 * order (late fees, then installments oldest first, fee share before principal, fee only as
 * far as it has been earned), and writes the receipt, the installments, the loan and the
 * journal. Takes no more than the payoff amount; reaching it pays the loan off and waives the
 * fee not yet earned. The caller takes `allocation.appliedCents` off cash and
 * `debtReductionCents` off debt.
 */
export async function applyLoanPayment(db: Db, input: {
  roundPlayerId: string;
  loan: LoanWithInstallments;
  kind: LoanPaymentKind;
  requestKey: string;
  amountCents: bigint;
  debtBeforeCents: bigint;
  at: Date;
}): Promise<AppliedLoanPayment> {
  const { loan, at } = input;
  const allocation = allocateLoanPayment(input.amountCents, lateFeesDueCents(loan), loan.installments.map(installmentDue), loanFeeBudget(loan, at));
  if (allocation.appliedCents <= 0n) throw new RangeError('A loan payment has to settle something.');
  const debtReductionCents = allocation.appliedCents + allocation.contractFeeWaivedCents;
  const debtAfterCents = input.debtBeforeCents - debtReductionCents;
  if (debtAfterCents < 0n) throw new RangeError('A loan payment cannot take debt below zero.');

  const payment = await db.loanPayment.create({
    data: {
      loanId: loan.id,
      roundPlayerId: input.roundPlayerId,
      kind: input.kind,
      requestKey: input.requestKey,
      amountCents: allocation.appliedCents,
      lateFeeCents: allocation.lateFeeCents,
      contractFeeCents: allocation.contractFeeCents,
      principalCents: allocation.principalCents,
      contractFeeWaivedCents: allocation.contractFeeWaivedCents,
      debtAfterCents,
      createdAt: at,
    },
  });

  const bySequence = new Map(allocation.installments.map((row) => [row.sequence, row]));
  const installments: LoanInstallment[] = [];
  let onTimeCleared = 0;
  for (const row of loan.installments) {
    const paid = bySequence.get(row.sequence);
    if (!paid || (paid.contractFeeCents === 0n && paid.principalCents === 0n && paid.contractFeeWaivedCents === 0n && !paid.cleared)) {
      installments.push(row);
      continue;
    }
    const cleared = paid.cleared && row.status !== 'PAID';
    if (cleared && row.status === 'SCHEDULED' && row.missedAt === null) onTimeCleared += 1;
    installments.push(await db.loanInstallment.update({
      where: { id: row.id },
      data: {
        contractFeePaidCents: { increment: paid.contractFeeCents },
        contractFeeWaivedCents: { increment: paid.contractFeeWaivedCents },
        principalPaidCents: { increment: paid.principalCents },
        ...(cleared ? { status: 'PAID', paidAt: at } : {}),
      },
    }));
  }

  const outstandingAfter = loanOutstanding(loan) - debtReductionCents;
  const status = loanStatusFor(outstandingAfter, installments);
  const updated = await db.loan.update({
    where: { id: loan.id },
    data: {
      lateFeesPaidCents: { increment: allocation.lateFeeCents },
      contractFeePaidCents: { increment: allocation.contractFeeCents },
      contractFeeWaivedCents: { increment: allocation.contractFeeWaivedCents },
      principalPaidCents: { increment: allocation.principalCents },
      status,
      ...(status === 'PAID_OFF' ? { paidOffAt: at } : {}),
    },
  });

  await writeLoanEvent(db, {
    roundPlayerId: input.roundPlayerId,
    loanId: loan.id,
    kind: 'PAYMENT',
    debtDeltaCents: -debtReductionCents,
    debtAfterCents,
    requestKey: `${input.requestKey}:payment`,
    metadata: {
      paymentId: payment.id,
      kind: input.kind,
      lateFeeCents: Number(allocation.lateFeeCents),
      contractFeeCents: Number(allocation.contractFeeCents),
      principalCents: Number(allocation.principalCents),
      contractFeeWaivedCents: Number(allocation.contractFeeWaivedCents),
    },
    at,
  });
  if (status === 'PAID_OFF') {
    await writeLoanEvent(db, {
      roundPlayerId: input.roundPlayerId,
      loanId: loan.id,
      kind: 'PAID_OFF',
      debtAfterCents,
      requestKey: `${input.requestKey}:paid-off`,
      metadata: { early: allocation.contractFeeWaivedCents > 0n, contractFeeWaivedCents: Number(allocation.contractFeeWaivedCents) },
      at,
    });
  }

  return {
    paymentId: payment.id,
    allocation,
    onTimeCleared,
    debtReductionCents,
    loan: { ...updated, installments },
    ledger: loanPaymentLedger(input.kind, allocation, { loanId: loan.id, paymentId: payment.id, offerKey: loan.offerKey }),
  };
}

/** Where a player stands with the loan shark, as stored. */
export interface LoanStandingRow {
  loanCollectionState: LoanCollectionState;
  loanRecoveryNeeded: number;
  loanCollectionsSince: Date | null;
}

const STANDING_WORDS: Record<LoanCollectionState, string> = {
  CLEAR: 'in good standing',
  DELINQUENT: 'delinquent',
  COLLECTIONS: 'in collections',
  RECOVERING: 'recovering',
};

/**
 * The player's standing after a change to their loans (1.6.5-E: see `nextLoanStanding`).
 * Writes it, journals any change, and tells the feed (and the bell) when the player goes
 * into collections, out of it, or clears recovery. Returns the standing either way.
 */
export async function refreshCollectionState(db: Db, input: {
  roundPlayerId: string;
  rules: LoanSharkRules | undefined;
  current: LoanStandingRow;
  debtAfterCents: bigint;
  onTimeCleared: number;
  requestKey: string;
  at: Date;
  /**
   * 1.6.5-F. A staff correction (an excused miss) that leaves nothing missed restores the
   * player to good standing outright: the miss was the server's error, not theirs.
   */
  skipRecovery?: boolean;
}): Promise<LoanStandingRow> {
  const missedOutstanding = await db.loanInstallment.count({ where: { roundPlayerId: input.roundPlayerId, status: 'MISSED' } });
  const before = input.current;
  const next = input.rules
    ? nextLoanStanding(input.rules, {
      current: before.loanCollectionState,
      recoveryNeeded: before.loanRecoveryNeeded,
      missedOutstanding,
      owesAnything: input.debtAfterCents > 0n,
      onTimeCleared: input.onTimeCleared,
    })
    : { state: missedOutstanding > 0 ? 'DELINQUENT' as const : 'CLEAR' as const, recoveryNeeded: 0 };
  if (input.skipRecovery && next.state === 'RECOVERING') {
    next.state = 'CLEAR';
    next.recoveryNeeded = 0;
  }
  const result: LoanStandingRow = {
    loanCollectionState: next.state,
    loanRecoveryNeeded: next.recoveryNeeded,
    // Only income earned after going into collections is ever garnished.
    loanCollectionsSince: next.state === 'COLLECTIONS' ? before.loanCollectionsSince ?? input.at : null,
  };
  const changed = result.loanCollectionState !== before.loanCollectionState;
  if (!changed && result.loanRecoveryNeeded === before.loanRecoveryNeeded && result.loanCollectionsSince?.getTime() === before.loanCollectionsSince?.getTime()) {
    return result;
  }
  await db.roundPlayer.update({ where: { id: input.roundPlayerId }, data: result });
  if (!changed) return result;
  await writeLoanEvent(db, {
    roundPlayerId: input.roundPlayerId,
    kind: 'COLLECTION_CHANGED',
    debtAfterCents: input.debtAfterCents,
    requestKey: `${input.requestKey}:collection`,
    metadata: { from: before.loanCollectionState, to: result.loanCollectionState, missedInstallments: missedOutstanding, recoveryNeeded: result.loanRecoveryNeeded },
    at: input.at,
  });
  // Going into collections, out of it, and clearing recovery reach the feed and the bell.
  const into = result.loanCollectionState === 'COLLECTIONS';
  const out = before.loanCollectionState === 'COLLECTIONS' || before.loanCollectionState === 'RECOVERING';
  if (input.rules?.collections && (into || out)) {
    await ActivityService.log(db, input.roundPlayerId, 'LOAN_COLLECTIONS', {
      from: before.loanCollectionState,
      to: result.loanCollectionState,
      fromLabel: STANDING_WORDS[before.loanCollectionState],
      toLabel: STANDING_WORDS[result.loanCollectionState],
      missedInstallments: missedOutstanding,
      recoveryNeeded: result.loanRecoveryNeeded,
      garnishPercent: input.rules.collections.garnishPercent,
      debtAfterCents: Number(input.debtAfterCents),
    });
  }
  return result;
}
