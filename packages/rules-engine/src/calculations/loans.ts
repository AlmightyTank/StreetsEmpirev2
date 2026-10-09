import type { LoanSharkRules, Ruleset } from '@streets/rulesets';

/**
 * 1.6.5-A. The loan shark's debt, as pure integer-cent arithmetic: what a quote reserves
 * against the debt ceiling, how a contract splits into installments, what a missed
 * installment may be charged, and how a payment is applied. Nothing here reads the clock,
 * rolls, or touches cash; the server settles everything on its own time.
 *
 * The obligation of a loan is its principal plus its fixed contract fee. It is reserved in
 * full against the ceiling at acceptance, so stacking contracts can never overrun it. Late
 * fees are the only debt that grows afterwards, and only within three caps: the loan's, the
 * player's round-wide fee cap, and the room left under the ceiling. Fees never earn fees.
 */

export function loanSharkRules(ruleset: Ruleset): LoanSharkRules | undefined {
  return ruleset.loanShark?.enabled ? ruleset.loanShark : undefined;
}

export type LoanRefusalCode = 'LOAN_TERMS_INVALID' | 'LOAN_DEBT_CEILING';

/** A refusal a player can act on, as opposed to a RangeError, which is a server bug. */
export class LoanError extends Error {
  constructor(readonly code: LoanRefusalCode, message: string) {
    super(message);
    this.name = 'LoanError';
  }
}

export interface LoanTerms {
  principalCents: bigint;
  contractFeeCents: bigint;
  installmentCount: number;
}

/** A player's debt against the round's limits. */
export interface DebtPosition {
  debtCents: bigint;
  ceilingCents: bigint;
  feesAssessedCents: bigint;
  feeCapCents: bigint;
}

export interface ScheduledInstallment {
  /** 1-based, in due order. */
  sequence: number;
  dueAt: Date;
  principalCents: bigint;
  contractFeeCents: bigint;
  amountCents: bigint;
}

export interface LoanQuote {
  principalCents: bigint;
  contractFeeCents: bigint;
  /** Principal plus contract fee: what is reserved against the ceiling now. */
  obligationCents: bigint;
  installments: ScheduledInstallment[];
  /** What one missed installment costs, and the most this loan can ever be charged for missing. */
  lateFeeCents: bigint;
  lateFeeCapCents: bigint;
  debtBeforeCents: bigint;
  debtAfterCents: bigint;
  roomAfterCents: bigint;
}

const HOUR_MS = 3_600_000;

const minBig = (...values: bigint[]): bigint => values.reduce((low, value) => (value < low ? value : low));
const maxBig = (a: bigint, b: bigint): bigint => (a > b ? a : b);

/** Room left under the ceiling. Never negative. */
export function debtRoomCents(position: Pick<DebtPosition, 'debtCents' | 'ceilingCents'>): bigint {
  return maxBig(0n, position.ceilingCents - position.debtCents);
}

/** Room left under the round-wide fee cap. Never negative. */
export function feeRoomCents(position: Pick<DebtPosition, 'feesAssessedCents' | 'feeCapCents'>): bigint {
  return maxBig(0n, position.feeCapCents - position.feesAssessedCents);
}

/** The per-round limits a player's account is held to. */
export function debtLimits(rules: LoanSharkRules): Pick<DebtPosition, 'ceilingCents' | 'feeCapCents'> {
  return { ceilingCents: BigInt(rules.debtCeilingCents), feeCapCents: BigInt(rules.feeCapCents) };
}

/** Refuses terms the ruleset would never quote. */
export function validateLoanTerms(rules: LoanSharkRules, terms: LoanTerms): void {
  const { principalCents, contractFeeCents, installmentCount } = terms;
  if (principalCents <= 0n) throw new LoanError('LOAN_TERMS_INVALID', 'A loan has to advance some cash.');
  if (contractFeeCents < 0n) throw new LoanError('LOAN_TERMS_INVALID', 'A contract fee cannot be negative.');
  if (contractFeeCents * 100n > principalCents * BigInt(rules.maxContractFeePercent)) {
    throw new LoanError('LOAN_TERMS_INVALID', `A contract fee cannot be more than ${rules.maxContractFeePercent}% of the cash advanced.`);
  }
  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1 || installmentCount > rules.maxInstallments) {
    throw new LoanError('LOAN_TERMS_INVALID', `A loan is repaid in 1 to ${rules.maxInstallments} installments.`);
  }
}

/**
 * Splits a contract evenly into installments, one interval apart from acceptance. Each
 * installment carries its share of principal and of the contract fee; any remainder cents
 * fall on the last one, so the schedule always sums exactly to the obligation.
 */
export function buildInstallmentSchedule(terms: LoanTerms, intervalHours: number, acceptedAt: Date): ScheduledInstallment[] {
  if (!(intervalHours > 0)) throw new RangeError('intervalHours must be positive.');
  const count = BigInt(terms.installmentCount);
  const principalShare = terms.principalCents / count;
  const feeShare = terms.contractFeeCents / count;
  return Array.from({ length: terms.installmentCount }, (_, index) => {
    const last = index === terms.installmentCount - 1;
    const principalCents = last ? terms.principalCents - principalShare * (count - 1n) : principalShare;
    const contractFeeCents = last ? terms.contractFeeCents - feeShare * (count - 1n) : feeShare;
    return {
      sequence: index + 1,
      dueAt: new Date(acceptedAt.getTime() + (index + 1) * intervalHours * HOUR_MS),
      principalCents,
      contractFeeCents,
      amountCents: principalCents + contractFeeCents,
    };
  });
}

/**
 * The full contract for some terms, against the player's debt as it stands. Refuses terms
 * whose whole obligation will not fit under the ceiling: a loan is never partly reserved.
 */
export function quoteLoan(rules: LoanSharkRules, terms: LoanTerms, position: DebtPosition, acceptedAt: Date): LoanQuote {
  validateLoanTerms(rules, terms);
  const obligationCents = terms.principalCents + terms.contractFeeCents;
  const room = debtRoomCents(position);
  if (obligationCents > room) {
    throw new LoanError('LOAN_DEBT_CEILING', 'That loan would take you past what the loan shark will let you owe.');
  }
  const debtAfterCents = position.debtCents + obligationCents;
  return {
    principalCents: terms.principalCents,
    contractFeeCents: terms.contractFeeCents,
    obligationCents,
    installments: buildInstallmentSchedule(terms, rules.installmentIntervalHours, acceptedAt),
    lateFeeCents: BigInt(rules.lateFeeCents),
    lateFeeCapCents: BigInt(rules.lateFeeCapPerLoanCents),
    debtBeforeCents: position.debtCents,
    debtAfterCents,
    roomAfterCents: position.ceilingCents - debtAfterCents,
  };
}

/**
 * What one missed installment is charged: the loan's fixed late fee, cut down to whatever
 * the loan's own cap, the player's fee cap and the debt ceiling still allow. Zero once any
 * of them is full: the balance stops growing there.
 */
export function lateFeeChargeCents(input: {
  lateFeeCents: bigint;
  loanLateFeesAssessedCents: bigint;
  loanLateFeeCapCents: bigint;
  position: DebtPosition;
}): bigint {
  return maxBig(0n, minBig(
    input.lateFeeCents,
    input.loanLateFeeCapCents - input.loanLateFeesAssessedCents,
    feeRoomCents(input.position),
    debtRoomCents(input.position),
  ));
}

/** What a loan still has owing on one installment. */
export interface InstallmentDue {
  sequence: number;
  contractFeeDueCents: bigint;
  principalDueCents: bigint;
}

export interface InstallmentAllocation {
  sequence: number;
  contractFeeCents: bigint;
  principalCents: bigint;
  /** Nothing is left owing on this installment after the payment. */
  cleared: boolean;
}

export interface LoanPaymentAllocation {
  /** What the payment actually takes: never more than the loan has owing. */
  appliedCents: bigint;
  lateFeeCents: bigint;
  contractFeeCents: bigint;
  principalCents: bigint;
  installments: InstallmentAllocation[];
  /** The loan owes nothing after this payment. */
  paidOff: boolean;
}

/** Everything a loan still owes: late fees, then each installment's fee and principal. */
export function loanOutstandingCents(lateFeesDueCents: bigint, installments: readonly InstallmentDue[]): bigint {
  return installments.reduce((sum, row) => sum + row.contractFeeDueCents + row.principalDueCents, lateFeesDueCents);
}

/**
 * Applies a payment in the documented order: unpaid late fees first, then installments
 * oldest first, each installment's share of the contract fee before its principal. A
 * payment larger than the balance takes only the balance.
 */
export function allocateLoanPayment(amountCents: bigint, lateFeesDueCents: bigint, installments: readonly InstallmentDue[]): LoanPaymentAllocation {
  if (amountCents <= 0n) throw new RangeError('A payment must be positive.');
  if (lateFeesDueCents < 0n) throw new RangeError('lateFeesDueCents cannot be negative.');
  let left = amountCents;
  const take = (due: bigint): bigint => {
    if (due < 0n) throw new RangeError('An amount due cannot be negative.');
    const paid = minBig(left, due);
    left -= paid;
    return paid;
  };
  const lateFeeCents = take(lateFeesDueCents);
  let contractFeeCents = 0n;
  let principalCents = 0n;
  const rows: InstallmentAllocation[] = [];
  for (const row of [...installments].sort((a, b) => a.sequence - b.sequence)) {
    const fee = take(row.contractFeeDueCents);
    const principal = take(row.principalDueCents);
    contractFeeCents += fee;
    principalCents += principal;
    rows.push({
      sequence: row.sequence,
      contractFeeCents: fee,
      principalCents: principal,
      cleared: fee === row.contractFeeDueCents && principal === row.principalDueCents,
    });
  }
  const appliedCents = amountCents - left;
  return {
    appliedCents,
    lateFeeCents,
    contractFeeCents,
    principalCents,
    installments: rows,
    paidOff: appliedCents === loanOutstandingCents(lateFeesDueCents, installments),
  };
}

/**
 * Borrowed cash is not wealth: debt comes off net worth at the same weight cash goes on,
 * rounded up so that borrowing can never round into a gain.
 */
export function weightedDebtCents(debtCents: bigint | number, cashWeightPercent: number): bigint {
  const debt = BigInt(debtCents);
  if (debt <= 0n) return 0n;
  return (debt * BigInt(cashWeightPercent) + 99n) / 100n;
}
