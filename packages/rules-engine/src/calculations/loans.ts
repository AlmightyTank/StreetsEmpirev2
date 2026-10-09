import type { LoanOfferRules, LoanSharkRules, Ruleset } from '@streets/rulesets';

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
 *
 * The contract fee is earned evenly over the loan's term. Paying a loan off early owes only
 * the fee earned so far; the rest is waived and comes off the debt with the payoff.
 */

export function loanSharkRules(ruleset: Ruleset): LoanSharkRules | undefined {
  return ruleset.loanShark?.enabled ? ruleset.loanShark : undefined;
}

export type LoanRefusalCode = 'LOAN_TERMS_INVALID' | 'LOAN_DEBT_CEILING' | 'LOAN_NOT_ELIGIBLE' | 'LOAN_QUOTE_CHANGED';

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

/** What a loan still has owing on one installment: its share, less what was paid or waived. */
export interface InstallmentDue {
  sequence: number;
  contractFeeDueCents: bigint;
  principalDueCents: bigint;
}

export interface InstallmentAllocation {
  sequence: number;
  contractFeeCents: bigint;
  principalCents: bigint;
  /** Unearned contract fee forgiven because this payment paid the loan off early. */
  contractFeeWaivedCents: bigint;
  /** Nothing is left owing on this installment after the payment. */
  cleared: boolean;
}

export interface LoanPaymentAllocation {
  /** What the payment actually takes: never more than the payoff amount. */
  appliedCents: bigint;
  lateFeeCents: bigint;
  contractFeeCents: bigint;
  principalCents: bigint;
  /** Unearned contract fee forgiven on an early payoff; never cash, only debt. */
  contractFeeWaivedCents: bigint;
  installments: InstallmentAllocation[];
  /** The loan owes nothing after this payment. */
  paidOff: boolean;
}

/** Everything a loan still owes on its full schedule: late fees, then each installment's fee and principal. */
export function loanOutstandingCents(lateFeesDueCents: bigint, installments: readonly InstallmentDue[]): bigint {
  return installments.reduce((sum, row) => sum + row.contractFeeDueCents + row.principalDueCents, lateFeesDueCents);
}

/**
 * The contract fee earned by `now`. It accrues evenly from acceptance to the last due time,
 * rounded up to the cent, so at each installment's due time it covers every fee share due
 * by then. A loan paid off early owes only this much of its fee; the rest is waived.
 */
export function contractFeeEarnedCents(input: {
  contractFeeCents: bigint;
  acceptedAt: Date;
  installmentCount: number;
  installmentIntervalHours: number;
  now: Date;
}): bigint {
  const term = BigInt(input.installmentCount * input.installmentIntervalHours * HOUR_MS);
  if (term <= 0n) throw new RangeError('A loan term must be positive.');
  const elapsedMs = input.now.getTime() - input.acceptedAt.getTime();
  if (elapsedMs <= 0) return 0n;
  const elapsed = BigInt(elapsedMs);
  if (elapsed >= term) return input.contractFeeCents;
  return (input.contractFeeCents * elapsed + term - 1n) / term;
}

/** Earned contract fee not yet paid: the most of the fee any payment may take now. */
export function contractFeeBudgetCents(earnedCents: bigint, paidCents: bigint): bigint {
  return maxBig(0n, earnedCents - paidCents);
}

/**
 * What clears a loan now: unpaid late fees, all unpaid principal, and the earned contract fee
 * not yet paid. Without a budget the whole remaining fee counts, as on the full schedule.
 */
export function loanPayoffCents(lateFeesDueCents: bigint, installments: readonly InstallmentDue[], contractFeeBudget?: bigint): bigint {
  const fees = installments.reduce((sum, row) => sum + row.contractFeeDueCents, 0n);
  const principal = installments.reduce((sum, row) => sum + row.principalDueCents, 0n);
  return lateFeesDueCents + principal + (contractFeeBudget === undefined ? fees : minBig(fees, contractFeeBudget));
}

/**
 * Applies a payment in the documented order: unpaid late fees first, then installments
 * oldest first, each installment's share of the contract fee before its principal. Fee is
 * only ever taken up to `contractFeeBudget`, what has been earned and not yet paid, so a
 * share not yet earned is skipped and its principal paid ahead. A payment that reaches the
 * payoff amount pays the loan off, and the fee not yet earned is waived. A payment larger
 * than the payoff amount takes only the payoff amount.
 */
export function allocateLoanPayment(
  amountCents: bigint,
  lateFeesDueCents: bigint,
  installments: readonly InstallmentDue[],
  contractFeeBudget?: bigint,
): LoanPaymentAllocation {
  if (amountCents <= 0n) throw new RangeError('A payment must be positive.');
  if (lateFeesDueCents < 0n) throw new RangeError('lateFeesDueCents cannot be negative.');
  if (contractFeeBudget !== undefined && contractFeeBudget < 0n) throw new RangeError('contractFeeBudget cannot be negative.');
  const ordered = [...installments].sort((a, b) => a.sequence - b.sequence);
  for (const row of ordered) {
    if (row.contractFeeDueCents < 0n || row.principalDueCents < 0n) throw new RangeError('An amount due cannot be negative.');
  }
  const payoff = loanPayoffCents(lateFeesDueCents, ordered, contractFeeBudget);
  let left = minBig(amountCents, payoff);
  let budget = contractFeeBudget ?? ordered.reduce((sum, row) => sum + row.contractFeeDueCents, 0n);
  const take = (due: bigint): bigint => {
    const paid = minBig(left, due);
    left -= paid;
    return paid;
  };
  const lateFeeCents = take(lateFeesDueCents);
  const paidOff = minBig(amountCents, payoff) === payoff;
  let contractFeeCents = 0n;
  let principalCents = 0n;
  let contractFeeWaivedCents = 0n;
  const rows: InstallmentAllocation[] = [];
  for (const row of ordered) {
    const fee = take(minBig(row.contractFeeDueCents, budget));
    budget -= fee;
    const principal = take(row.principalDueCents);
    const waived = paidOff ? row.contractFeeDueCents - fee : 0n;
    contractFeeCents += fee;
    principalCents += principal;
    contractFeeWaivedCents += waived;
    rows.push({
      sequence: row.sequence,
      contractFeeCents: fee,
      principalCents: principal,
      contractFeeWaivedCents: waived,
      cleared: fee + waived === row.contractFeeDueCents && principal === row.principalDueCents,
    });
  }
  return {
    appliedCents: lateFeeCents + contractFeeCents + principalCents,
    lateFeeCents,
    contractFeeCents,
    principalCents,
    contractFeeWaivedCents,
    installments: rows,
    paidOff,
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

const dollars = (cents: bigint | number): string => `$${(Number(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** 1.6.5-B. The fixed offers a ruleset puts on the Loan Shark page, in display order. */
export function loanOffers(rules: LoanSharkRules): readonly LoanOfferRules[] {
  return rules.offers ?? [];
}

/** What a player's record looks like to the loan shark when pricing a new loan. */
export interface LoanCreditInput {
  position: DebtPosition;
  /** Installments missed this round, whether or not they were paid since. */
  missedInstallments: number;
}

/** 1.6.5-C. How one offer's fee was priced for this player, right now. */
export interface LoanOfferPricing {
  /** The offer's listed fee. */
  baseFeeCents: bigint;
  /** Owed / ceiling before the loan, whole percent rounded down. */
  utilizationPercent: number;
  tierLabel: string | null;
  tierSurchargePercent: number;
  missedInstallments: number;
  historySurchargePercent: number;
  /** Both surcharges, as cents of the cash advanced. */
  surchargeCents: bigint;
  /** The fee this loan would be fixed at. */
  contractFeeCents: bigint;
  /** The fee was cut down to the ruleset's most a fee can be. */
  capped: boolean;
}

/** Owed as a whole percent of the ceiling, rounded down. */
export function debtUtilizationPercent(position: Pick<DebtPosition, 'debtCents' | 'ceilingCents'>): number {
  if (position.ceilingCents <= 0n) return position.debtCents > 0n ? 100 : 0;
  return Number((position.debtCents * 100n) / position.ceilingCents);
}

/**
 * 1.6.5-C. Prices an offer for a player: its listed fee, plus whole points of the cash
 * advanced for the utilization tier reached and for installments missed this round, never
 * more in total than the ruleset's most a fee can be. Without pricing rules, the listed fee.
 * Deterministic: the same debt and history always give the same price.
 */
export function priceLoanOffer(rules: LoanSharkRules, offer: LoanOfferRules, credit: LoanCreditInput): LoanOfferPricing {
  const principal = BigInt(offer.principalCents);
  const baseFeeCents = BigInt(offer.contractFeeCents);
  const utilizationPercent = debtUtilizationPercent(credit.position);
  const missedInstallments = Math.max(0, Math.trunc(credit.missedInstallments));
  const pricing = rules.pricing;
  let tier: { label: string; surchargePercent: number } | null = null;
  for (const candidate of pricing?.utilizationTiers ?? []) if (utilizationPercent >= candidate.fromPercent) tier = candidate;
  const tierSurchargePercent = tier?.surchargePercent ?? 0;
  const historySurchargePercent = pricing
    ? Math.min(pricing.maxHistorySurchargePercent, missedInstallments * pricing.missedInstallmentSurchargePercent)
    : 0;
  const surchargeCents = (principal * BigInt(tierSurchargePercent + historySurchargePercent)) / 100n;
  const most = (principal * BigInt(rules.maxContractFeePercent)) / 100n;
  const uncapped = baseFeeCents + surchargeCents;
  return {
    baseFeeCents,
    utilizationPercent,
    tierLabel: tier?.label ?? null,
    tierSurchargePercent,
    missedInstallments,
    historySurchargePercent,
    surchargeCents,
    contractFeeCents: uncapped > most ? most : uncapped,
    capped: uncapped > most,
  };
}

/** An offer's terms, at its listed fee or at the fee it was priced at. */
export function loanOfferTerms(offer: LoanOfferRules, contractFeeCents: bigint = BigInt(offer.contractFeeCents)): LoanTerms {
  return {
    principalCents: BigInt(offer.principalCents),
    contractFeeCents,
    installmentCount: offer.installmentCount,
  };
}

/**
 * 1.6.5-B. Why a player cannot take an offer right now, in words they can act on, or null
 * when they can. Deterministic: the same debt and net worth always give the same answer.
 * Checked in order: who the offer is open to, then room under the ceiling for the whole
 * obligation at the fee it is priced at (1.6.5-C), then the ruleset's own limits.
 */
export function loanOfferRefusal(
  rules: LoanSharkRules,
  offer: LoanOfferRules,
  input: { position: DebtPosition; netWorthCents: bigint; contractFeeCents?: bigint },
): { code: LoanRefusalCode; message: string } | null {
  if (offer.minNetWorthCents !== undefined && input.netWorthCents < BigInt(offer.minNetWorthCents)) {
    return { code: 'LOAN_NOT_ELIGIBLE', message: `The loan shark only fronts ${offer.name} to a boss worth ${dollars(offer.minNetWorthCents)} or more.` };
  }
  const terms = loanOfferTerms(offer, input.contractFeeCents);
  const obligation = terms.principalCents + terms.contractFeeCents;
  const room = debtRoomCents(input.position);
  if (obligation > room) {
    return {
      code: 'LOAN_DEBT_CEILING',
      message: room === 0n
        ? `You owe the loan shark as much as he will let you (${dollars(input.position.ceilingCents)}). Pay some back first.`
        : `This would take what you owe past ${dollars(input.position.ceilingCents)}. You have ${dollars(room)} of room left.`,
    };
  }
  try {
    validateLoanTerms(rules, terms);
  } catch (error) {
    if (error instanceof LoanError) return { code: error.code, message: error.message };
    throw error;
  }
  return null;
}
