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
  /** Still owing on this installment. */
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
  /** Everything still owing: unpaid principal, contract fee and late fees. */
  outstandingCents: number;
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
  replayed: boolean;
}
