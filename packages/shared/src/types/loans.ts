/**
 * 1.6.5-A. The loan shark's records as the server reports them. Cash is integer cents.
 * 1.6.5-B builds the Loan Shark page on these.
 */

export type LoanStatus = 'ACTIVE' | 'DELINQUENT' | 'PAID_OFF';
export type LoanInstallmentStatus = 'SCHEDULED' | 'PAID' | 'MISSED';
export type LoanPaymentKind = 'SCHEDULED' | 'MANUAL' | 'COLLECTION';
export type LoanCollectionState = 'CLEAR' | 'DELINQUENT' | 'COLLECTIONS';

export interface LoanInstallmentDto {
  sequence: number;
  dueAt: string;
  amountCents: number;
  principalCents: number;
  contractFeeCents: number;
  /** Still owing on this installment, less any fee waived by an early payoff. */
  remainingCents: number;
  status: LoanInstallmentStatus;
  missedAt: string | null;
  paidAt: string | null;
}

export interface LoanDto {
  id: string;
  offerKey: string;
  status: LoanStatus;
  principalCents: number;
  contractFeeCents: number;
  /** Principal plus contract fee, as quoted. */
  obligationCents: number;
  lateFeeCents: number;
  lateFeeCapCents: number;
  lateFeesAssessedCents: number;
  /** Contract fee forgiven by an early payoff. */
  contractFeeWaivedCents: number;
  /** Everything still owing on the full schedule: unpaid principal, contract fee and late fees. */
  outstandingCents: number;
  /** What pays it off right now: unpaid principal and late fees, and only the fee earned so far. */
  payoffCents: number;
  installments: LoanInstallmentDto[];
  acceptedAt: string;
  paidOffAt: string | null;
}

/** A player's debt against the round's limits. */
export interface LoanAccountDto {
  debtCents: number;
  debtCeilingCents: number;
  /** Room left under the ceiling. */
  availableCents: number;
  feesAssessedCents: number;
  feeCapCents: number;
  collectionState: LoanCollectionState;
}

export interface LoanAcceptResult {
  loan: LoanDto;
  account: LoanAccountDto;
  /** Cash advanced by this acceptance; zero on a replay. */
  creditedCents: number;
  replayed: boolean;
}

export interface LoanPaymentResult {
  loan: LoanDto;
  account: LoanAccountDto;
  kind: LoanPaymentKind;
  /** What the payment actually took, and how it was applied. */
  paidCents: number;
  lateFeeCents: number;
  contractFeeCents: number;
  principalCents: number;
  /** Unearned contract fee forgiven because this payment paid the loan off early. */
  contractFeeWaivedCents: number;
  replayed: boolean;
}
