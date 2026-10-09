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

/** 1.6.5-C. How one offer's fee was priced: the listed fee plus surcharges, capped. */
export interface LoanOfferPricingDto {
  baseFeeCents: number;
  utilizationPercent: number;
  tierLabel: string | null;
  tierSurchargePercent: number;
  missedInstallments: number;
  historySurchargePercent: number;
  surchargeCents: number;
  /** Cut down to the most a fee can be. */
  capped: boolean;
}

/** 1.6.5-C. Where the player stands for pricing, and what the next tier would cost. */
export interface LoanCreditDto {
  utilizationPercent: number;
  tierLabel: string | null;
  tierSurchargePercent: number;
  missedInstallments: number;
  historySurchargePercent: number;
  /** The next utilization tier up, if any: at what share of the limit, and its surcharge. */
  nextTier: { label: string; fromPercent: number; surchargePercent: number } | null;
  maxFeePercent: number;
}

/** 1.6.5-B. One installment of an offer, as it would fall due if accepted now. */
export interface LoanOfferInstallmentDto {
  sequence: number;
  /** Hours after acceptance. */
  dueAfterHours: number;
  amountCents: number;
}

/** 1.6.5-B. One fixed offer, quoted against the player's debt as it stands. */
export interface LoanOfferDto {
  key: string;
  name: string;
  description: string;
  /** Cash handed over on acceptance. */
  principalCents: number;
  contractFeeCents: number;
  /** Principal plus fee: the full payback on schedule, reserved against the ceiling now. */
  obligationCents: number;
  /** Fee as a whole percent of the cash advanced, rounded to one decimal. */
  feePercent: number;
  /** 1.6.5-C. How the fee was priced for this player now; the listed fee and nothing else before C. */
  pricing: LoanOfferPricingDto;
  installmentCount: number;
  installmentIntervalHours: number;
  installments: LoanOfferInstallmentDto[];
  /** What a missed installment costs, and the most this loan can be charged for missing. */
  lateFeeCents: number;
  lateFeeCapCents: number;
  /** Net worth needed for this offer, if any. */
  minNetWorthCents: number | null;
  /** What the player would owe, and the room left, after accepting. */
  debtAfterCents: number;
  availableAfterCents: number;
  available: boolean;
  /** Why it cannot be taken right now, in player-facing words. */
  unavailableReason: string | null;
}

export type LoanEventKind = 'ACCEPTED' | 'PAYMENT' | 'INSTALLMENT_MISSED' | 'FEE_ASSESSED' | 'PAID_OFF' | 'COLLECTION_CHANGED';

/** 1.6.5-B. One line of loan history. */
export interface LoanHistoryDto {
  id: string;
  kind: LoanEventKind;
  loanId: string | null;
  offerName: string | null;
  label: string;
  /** Signed change to what the player owes. */
  debtDeltaCents: number;
  debtAfterCents: number;
  createdAt: string;
}

/** GET /api/game/loans. */
export interface LoanSharkPageDto {
  enabled: boolean;
  account: LoanAccountDto | null;
  /** 1.6.5-C. Present where new loans get dearer with debt and missed payments. */
  credit: LoanCreditDto | null;
  cashCents: number;
  netWorthCents: number;
  offers: LoanOfferDto[];
  /** Loans still owing, oldest first. */
  activeLoans: Array<LoanDto & { offerName: string; nextDueAt: string | null; nextDueCents: number }>;
  /** Paid-off loans, newest first. */
  closedLoans: Array<LoanDto & { offerName: string }>;
  history: LoanHistoryDto[];
}
