import { describe, expect, it } from 'vitest';
import { classicOgV16H, classicOgV165A, classicOgV165B, classicOgV165C, classicOgV165E, type LoanSharkRules, type Ruleset } from '@streets/rulesets';
import {
  LoanError,
  allocateLoanPayment,
  buildInstallmentSchedule,
  contractFeeBudgetCents,
  contractFeeEarnedCents,
  loanPayoffCents,
  calculateNetWorthCents,
  debtLimits,
  debtRoomCents,
  lateFeeChargeCents,
  loanOfferRefusal,
  nextLoanStanding,
  loanStandingRefusal,
  garnishCents,
  priceLoanOffer,
  debtUtilizationPercent,
  loanOfferTerms,
  loanOffers,
  loanOutstandingCents,
  loanSharkRules,
  quoteLoan,
  validateLoanTerms,
  weightedDebtCents,
  type DebtPosition,
} from '../index.js';
import { classicOgV01 } from '@streets/rulesets';

const rules = classicOgV165A.loanShark as LoanSharkRules;
const at = new Date('2026-10-09T12:00:00.000Z');
const fresh = (): DebtPosition => ({ debtCents: 0n, ...debtLimits(rules), feesAssessedCents: 0n });

describe('1.6.5-A loan quotes', () => {
  it('only lends where the ruleset has a loan shark', () => {
    expect(loanSharkRules(classicOgV165A)).toBe(rules);
    expect(loanSharkRules(classicOgV16H as Ruleset)).toBeUndefined();
  });

  it('reserves the whole obligation and splits it exactly into installments', () => {
    const quote = quoteLoan(rules, { principalCents: 1_000_001n, contractFeeCents: 200_003n, installmentCount: 3 }, fresh(), at);
    expect(quote.obligationCents).toBe(1_200_004n);
    expect(quote.debtAfterCents).toBe(1_200_004n);
    expect(quote.roomAfterCents).toBe(BigInt(rules.debtCeilingCents) - 1_200_004n);
    expect(quote.installments.map((row) => row.sequence)).toEqual([1, 2, 3]);
    expect(quote.installments.reduce((sum, row) => sum + row.principalCents, 0n)).toBe(1_000_001n);
    expect(quote.installments.reduce((sum, row) => sum + row.contractFeeCents, 0n)).toBe(200_003n);
    expect(quote.installments.reduce((sum, row) => sum + row.amountCents, 0n)).toBe(quote.obligationCents);
    expect(quote.installments.map((row) => row.dueAt.getTime() - at.getTime()))
      .toEqual([1, 2, 3].map((n) => n * rules.installmentIntervalHours * 3_600_000));
  });

  it('refuses a loan whose full obligation would not fit under the ceiling', () => {
    const ceiling = BigInt(rules.debtCeilingCents);
    const position = { ...fresh(), debtCents: ceiling - 100n };
    expect(() => quoteLoan(rules, { principalCents: 100n, contractFeeCents: 1n, installmentCount: 1 }, position, at))
      .toThrow(expect.objectContaining({ code: 'LOAN_DEBT_CEILING' }));
    expect(quoteLoan(rules, { principalCents: 80n, contractFeeCents: 20n, installmentCount: 1 }, position, at).roomAfterCents).toBe(0n);
  });

  it('never lets a stack of individually valid loans pass the ceiling', () => {
    const terms = { principalCents: 3_000_000n, contractFeeCents: 1_000_000n, installmentCount: 4 };
    let position = fresh();
    let accepted = 0;
    for (let i = 0; i < 20; i += 1) {
      try {
        position = { ...position, debtCents: quoteLoan(rules, terms, position, at).debtAfterCents };
        accepted += 1;
      } catch (error) {
        expect(error).toBeInstanceOf(LoanError);
      }
    }
    expect(accepted).toBe(Math.floor(rules.debtCeilingCents / 4_000_000));
    expect(position.debtCents).toBeLessThanOrEqual(BigInt(rules.debtCeilingCents));
  });

  it('refuses terms the ruleset would never quote', () => {
    const bad = [
      { principalCents: 0n, contractFeeCents: 0n, installmentCount: 1 },
      { principalCents: 100n, contractFeeCents: -1n, installmentCount: 1 },
      { principalCents: 100n, contractFeeCents: BigInt(rules.maxContractFeePercent) + 1n, installmentCount: 1 },
      { principalCents: 100n, contractFeeCents: 0n, installmentCount: 0 },
      { principalCents: 100n, contractFeeCents: 0n, installmentCount: rules.maxInstallments + 1 },
      { principalCents: 100n, contractFeeCents: 0n, installmentCount: 1.5 },
    ];
    for (const terms of bad) {
      expect(() => validateLoanTerms(rules, terms)).toThrow(expect.objectContaining({ code: 'LOAN_TERMS_INVALID' }));
    }
    expect(() => validateLoanTerms(rules, { principalCents: 100n, contractFeeCents: BigInt(rules.maxContractFeePercent), installmentCount: rules.maxInstallments })).not.toThrow();
  });

  it('builds schedules only on a positive interval', () => {
    expect(() => buildInstallmentSchedule({ principalCents: 1n, contractFeeCents: 0n, installmentCount: 1 }, 0, at)).toThrow(RangeError);
  });
});

describe('1.6.5-A late fees', () => {
  const base = { lateFeeCents: 250_000n, loanLateFeesAssessedCents: 0n, loanLateFeeCapCents: 750_000n };

  it('charges the fixed fee while every cap has room', () => {
    expect(lateFeeChargeCents({ ...base, position: { ...fresh(), debtCents: 1_000_000n } })).toBe(250_000n);
  });

  it('cuts the fee to the loan cap, the fee cap and the ceiling, then stops', () => {
    const position = { ...fresh(), debtCents: 1_000_000n };
    expect(lateFeeChargeCents({ ...base, loanLateFeesAssessedCents: 600_000n, position })).toBe(150_000n);
    expect(lateFeeChargeCents({ ...base, loanLateFeesAssessedCents: 750_000n, position })).toBe(0n);
    expect(lateFeeChargeCents({ ...base, position: { ...position, feesAssessedCents: position.feeCapCents - 1n } })).toBe(1n);
    expect(lateFeeChargeCents({ ...base, position: { ...position, feesAssessedCents: position.feeCapCents } })).toBe(0n);
    expect(lateFeeChargeCents({ ...base, position: { ...position, debtCents: position.ceilingCents - 7n } })).toBe(7n);
    expect(lateFeeChargeCents({ ...base, position: { ...position, debtCents: position.ceilingCents } })).toBe(0n);
  });

  it('keeps total fees at or under the cap and debt at or under the ceiling, however many are missed', () => {
    let position = { ...fresh(), debtCents: BigInt(rules.debtCeilingCents) - 2_000_000n };
    const loans = Array.from({ length: 6 }, () => ({ assessed: 0n }));
    for (let round = 0; round < 50; round += 1) {
      for (const loan of loans) {
        const charge = lateFeeChargeCents({ lateFeeCents: BigInt(rules.lateFeeCents), loanLateFeesAssessedCents: loan.assessed, loanLateFeeCapCents: BigInt(rules.lateFeeCapPerLoanCents), position });
        loan.assessed += charge;
        position = { ...position, debtCents: position.debtCents + charge, feesAssessedCents: position.feesAssessedCents + charge };
        expect(loan.assessed).toBeLessThanOrEqual(BigInt(rules.lateFeeCapPerLoanCents));
      }
    }
    expect(position.feesAssessedCents).toBeLessThanOrEqual(position.feeCapCents);
    expect(position.debtCents).toBeLessThanOrEqual(position.ceilingCents);
    expect(debtRoomCents(position)).toBeGreaterThanOrEqual(0n);
  });
});

describe('1.6.5-A payment allocation', () => {
  const installments = [
    { sequence: 2, contractFeeDueCents: 50n, principalDueCents: 500n },
    { sequence: 1, contractFeeDueCents: 50n, principalDueCents: 500n },
  ];

  it('pays late fees, then the oldest installment fee before its principal', () => {
    const paid = allocateLoanPayment(400n, 100n, installments);
    expect(paid).toMatchObject({ appliedCents: 400n, lateFeeCents: 100n, contractFeeCents: 50n, principalCents: 250n, paidOff: false });
    expect(paid.installments).toEqual([
      { sequence: 1, contractFeeCents: 50n, principalCents: 250n, contractFeeWaivedCents: 0n, cleared: false },
      { sequence: 2, contractFeeCents: 0n, principalCents: 0n, contractFeeWaivedCents: 0n, cleared: false },
    ]);
  });

  it('never takes more than the loan owes', () => {
    const owed = loanOutstandingCents(100n, installments);
    const paid = allocateLoanPayment(owed + 10_000n, 100n, installments);
    expect(paid.appliedCents).toBe(owed);
    expect(paid.paidOff).toBe(true);
    expect(paid.installments.every((row) => row.cleared)).toBe(true);
    expect(paid.lateFeeCents + paid.contractFeeCents + paid.principalCents).toBe(paid.appliedCents);
  });

  it('takes the contract fee only as far as it is earned, paying principal ahead', () => {
    const paid = allocateLoanPayment(600n, 0n, installments, 30n);
    expect(paid).toMatchObject({ appliedCents: 600n, contractFeeCents: 30n, principalCents: 570n, contractFeeWaivedCents: 0n, paidOff: false });
    expect(paid.installments[0]).toMatchObject({ sequence: 1, contractFeeCents: 30n, principalCents: 500n, cleared: false });
    expect(paid.installments[1]).toMatchObject({ sequence: 2, contractFeeCents: 0n, principalCents: 70n });
  });

  it('pays off early for the principal, late fees and earned fee, and waives the rest', () => {
    const payoff = loanPayoffCents(100n, installments, 30n);
    expect(payoff).toBe(100n + 1_000n + 30n);
    expect(payoff).toBeLessThan(loanOutstandingCents(100n, installments));
    const paid = allocateLoanPayment(5_000n, 100n, installments, 30n);
    expect(paid).toMatchObject({ appliedCents: payoff, lateFeeCents: 100n, contractFeeCents: 30n, principalCents: 1_000n, contractFeeWaivedCents: 70n, paidOff: true });
    expect(paid.installments.every((row) => row.cleared)).toBe(true);
    expect(paid.installments.reduce((sum, row) => sum + row.contractFeeCents + row.contractFeeWaivedCents, 0n)).toBe(100n);
    // On the full schedule the whole fee is earned and nothing is waived.
    expect(allocateLoanPayment(5_000n, 100n, installments, 1_000n)).toMatchObject({ contractFeeWaivedCents: 0n, contractFeeCents: 100n, paidOff: true });
  });

  it('rejects non-positive payments and negative balances', () => {
    expect(() => allocateLoanPayment(1n, 0n, installments, -1n)).toThrow(RangeError);
    expect(() => allocateLoanPayment(0n, 0n, installments)).toThrow(RangeError);
    expect(() => allocateLoanPayment(1n, -1n, installments)).toThrow(RangeError);
  });
});

describe('1.6.5-A contract fee accrual', () => {
  const loan = { contractFeeCents: 100_001n, acceptedAt: at, installmentCount: 4, installmentIntervalHours: 12 };
  const after = (hours: number) => contractFeeEarnedCents({ ...loan, now: new Date(at.getTime() + hours * 3_600_000) });

  it('earns the fee evenly over the term, rounded up, and never more than the fee', () => {
    expect(after(-1)).toBe(0n);
    expect(after(0)).toBe(0n);
    expect(after(24)).toBe(50_001n);
    expect(after(48)).toBe(100_001n);
    expect(after(500)).toBe(100_001n);
    expect(after(1 / 3_600_000)).toBe(1n);
    for (let hour = 1; hour <= 48; hour += 1) expect(after(hour)).toBeGreaterThanOrEqual(after(hour - 1));
  });

  it('has always earned every fee share due by an installment\'s due time', () => {
    const schedule = buildInstallmentSchedule({ principalCents: 1_000n, contractFeeCents: loan.contractFeeCents, installmentCount: 4 }, 12, at);
    let shares = 0n;
    for (const row of schedule) {
      shares += row.contractFeeCents;
      expect(contractFeeEarnedCents({ ...loan, now: row.dueAt })).toBeGreaterThanOrEqual(shares);
    }
  });

  it('never budgets fee already paid', () => {
    expect(contractFeeBudgetCents(50n, 20n)).toBe(30n);
    expect(contractFeeBudgetCents(50n, 80n)).toBe(0n);
  });
});

describe('1.6.5-A debt and net worth', () => {
  const player = {
    cashCents: 1_000_000n, whores: 3, thugs: 4, lowRiders: 1, medicine: 0, crack: 0, condoms: 0, beer: 0,
    pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0,
  };

  it('never raises net worth by borrowing', () => {
    const before = calculateNetWorthCents(player, classicOgV165A);
    for (const [principal, fee] of [[1n, 0n], [3n, 0n], [999_999n, 0n], [1_000_000n, 250_000n]] as const) {
      const after = calculateNetWorthCents({ ...player, cashCents: player.cashCents + principal, loanDebtCents: principal + fee }, classicOgV165A);
      expect(after).toBeLessThanOrEqual(before);
    }
  });

  it('floors net worth at zero and leaves debt-free players unchanged', () => {
    expect(calculateNetWorthCents({ ...player, loanDebtCents: 10_000_000_000n }, classicOgV165A)).toBe(0n);
    expect(calculateNetWorthCents({ ...player, loanDebtCents: 0n }, classicOgV01)).toBe(calculateNetWorthCents(player, classicOgV01));
    expect(weightedDebtCents(0n, 75)).toBe(0n);
    expect(weightedDebtCents(1n, 75)).toBe(1n);
    expect(weightedDebtCents(4n, 75)).toBe(3n);
  });
});

describe('1.6.5-B offers', () => {
  const offerRules = classicOgV165B.loanShark;
  const [quick, street, heavy] = offerRules.offers;
  const rich = 1_000_000_000n;

  it('lists the ruleset offers in order, and none before B', () => {
    expect(loanOffers(offerRules).map((offer) => offer.key)).toEqual(['QUICK_CASH', 'STREET_ADVANCE', 'HEAVY_BANKROLL']);
    expect(loanOffers(rules)).toEqual([]);
    expect(loanOfferTerms(quick!)).toEqual({ principalCents: 1_000_000n, contractFeeCents: 150_000n, installmentCount: 2 });
  });

  it('says who an offer is for before it talks about room', () => {
    const position = { ...fresh(), debtCents: BigInt(offerRules.debtCeilingCents) };
    expect(loanOfferRefusal(offerRules, heavy!, { position, netWorthCents: 0n })).toMatchObject({ code: 'LOAN_NOT_ELIGIBLE' });
    expect(loanOfferRefusal(offerRules, heavy!, { position: fresh(), netWorthCents: BigInt(heavy!.minNetWorthCents!) })).toBeNull();
    expect(loanOfferRefusal(offerRules, heavy!, { position: fresh(), netWorthCents: BigInt(heavy!.minNetWorthCents!) - 1n })?.message)
      .toBe('The loan shark only fronts Heavy Bankroll to a boss worth $50,000 or more.');
  });

  it('refuses an offer that would pass the ceiling, with the room left', () => {
    const ceiling = BigInt(offerRules.debtCeilingCents);
    const nearly = { ...fresh(), debtCents: ceiling - 1_000_000n };
    expect(loanOfferRefusal(offerRules, street!, { position: nearly, netWorthCents: rich })).toEqual({
      code: 'LOAN_DEBT_CEILING',
      message: 'This would take what you owe past $150,000. You have $10,000 of room left.',
    });
    expect(loanOfferRefusal(offerRules, quick!, { position: { ...fresh(), debtCents: ceiling }, netWorthCents: rich })?.message)
      .toBe('You owe the loan shark as much as he will let you ($150,000). Pay some back first.');
    expect(loanOfferRefusal(offerRules, quick!, { position: { ...fresh(), debtCents: ceiling - 1_150_000n }, netWorthCents: rich })).toBeNull();
  });
});

describe('1.6.5-C escalating terms', () => {
  const c = classicOgV165C.loanShark;
  const quick = c.offers[0]!;
  const heavy = c.offers[2]!;
  const at = (percent: number): DebtPosition => ({ ...fresh(), debtCents: (BigInt(c.debtCeilingCents) * BigInt(percent)) / 100n });

  it('charges the listed fee to a clean borrower, and nothing changes without pricing rules', () => {
    expect(priceLoanOffer(c, quick, { position: fresh(), missedInstallments: 0 })).toMatchObject({
      contractFeeCents: 150_000n, baseFeeCents: 150_000n, surchargeCents: 0n, tierLabel: 'Clean', capped: false,
    });
    expect(priceLoanOffer(classicOgV165B.loanShark, quick, { position: at(90), missedInstallments: 9 })).toMatchObject({
      contractFeeCents: 150_000n, surchargeCents: 0n, tierLabel: null,
    });
  });

  it('adds the tier reached by utilization before the loan', () => {
    expect(debtUtilizationPercent(at(24))).toBe(24);
    expect(priceLoanOffer(c, quick, { position: at(24), missedInstallments: 0 }).contractFeeCents).toBe(150_000n);
    expect(priceLoanOffer(c, quick, { position: at(25), missedInstallments: 0 })).toMatchObject({ tierLabel: 'Leaning', contractFeeCents: 190_000n });
    expect(priceLoanOffer(c, quick, { position: at(50), missedInstallments: 0 })).toMatchObject({ tierLabel: 'Stretched', contractFeeCents: 230_000n });
    expect(priceLoanOffer(c, quick, { position: at(80), missedInstallments: 0 })).toMatchObject({ tierLabel: 'In deep', contractFeeCents: 300_000n });
  });

  it('adds points for missed installments up to the history cap', () => {
    expect(priceLoanOffer(c, quick, { position: fresh(), missedInstallments: 2 })).toMatchObject({ historySurchargePercent: 6, contractFeeCents: 210_000n });
    expect(priceLoanOffer(c, quick, { position: fresh(), missedInstallments: 50 })).toMatchObject({ historySurchargePercent: 15, contractFeeCents: 300_000n });
  });

  it('never prices past the most a fee can be', () => {
    // The worst case for the dearest tier lands exactly on the cap as shipped.
    const worst = priceLoanOffer(c, heavy, { position: at(80), missedInstallments: 50 });
    expect(worst.contractFeeCents).toBe((BigInt(heavy.principalCents) * BigInt(c.maxContractFeePercent)) / 100n);
    const tight = { ...c, maxContractFeePercent: 50 };
    const capped = priceLoanOffer(tight, heavy, { position: at(80), missedInstallments: 50 });
    expect(capped).toMatchObject({ capped: true, contractFeeCents: (BigInt(heavy.principalCents) * 50n) / 100n });
  });

  it('only ever gets dearer as debt and missed installments grow', () => {
    for (const offer of c.offers) {
      let last = 0n;
      for (let percent = 0; percent <= 100; percent += 5) {
        for (let missed = 0; missed <= 6; missed += 1) {
          const fee = priceLoanOffer(c, offer, { position: at(percent), missedInstallments: missed }).contractFeeCents;
          if (missed === 0) {
            expect(fee).toBeGreaterThanOrEqual(last);
            last = fee;
          }
          expect(fee).toBeGreaterThanOrEqual(priceLoanOffer(c, offer, { position: at(percent), missedInstallments: Math.max(0, missed - 1) }).contractFeeCents);
        }
      }
    }
  });

  it('checks the ceiling against the priced obligation', () => {
    const fee = priceLoanOffer(c, quick, { position: at(80), missedInstallments: 0 }).contractFeeCents;
    const position = { ...fresh(), debtCents: BigInt(c.debtCeilingCents) - BigInt(quick.principalCents) - fee + 1n };
    expect(loanOfferRefusal(c, quick, { position, netWorthCents: 0n, contractFeeCents: fee })).toMatchObject({ code: 'LOAN_DEBT_CEILING' });
    expect(loanOfferRefusal(c, quick, { position: { ...position, debtCents: position.debtCents - 1n }, netWorthCents: 0n, contractFeeCents: fee })).toBeNull();
  });
});

describe('1.6.5-E standing and collections', () => {
  const e = classicOgV165E.loanShark;
  const base = { recoveryNeeded: 0, missedOutstanding: 0, owesAnything: true, onTimeCleared: 0 };

  it('goes delinquent on a miss and into collections at the threshold, and stays there until cleared', () => {
    expect(nextLoanStanding(e, { ...base, current: 'CLEAR', missedOutstanding: 1 })).toEqual({ state: 'DELINQUENT', recoveryNeeded: 0 });
    expect(nextLoanStanding(e, { ...base, current: 'DELINQUENT', missedOutstanding: 2 })).toEqual({ state: 'COLLECTIONS', recoveryNeeded: 0 });
    expect(nextLoanStanding(e, { ...base, current: 'COLLECTIONS', missedOutstanding: 1 })).toEqual({ state: 'COLLECTIONS', recoveryNeeded: 0 });
  });

  it('recovers through on-time installments, or at once when nothing is owed', () => {
    expect(nextLoanStanding(e, { ...base, current: 'COLLECTIONS' })).toEqual({ state: 'RECOVERING', recoveryNeeded: 2 });
    expect(nextLoanStanding(e, { ...base, current: 'DELINQUENT' })).toEqual({ state: 'RECOVERING', recoveryNeeded: 2 });
    expect(nextLoanStanding(e, { ...base, current: 'RECOVERING', recoveryNeeded: 2, onTimeCleared: 1 })).toEqual({ state: 'RECOVERING', recoveryNeeded: 1 });
    expect(nextLoanStanding(e, { ...base, current: 'RECOVERING', recoveryNeeded: 1, onTimeCleared: 3 })).toEqual({ state: 'CLEAR', recoveryNeeded: 0 });
    expect(nextLoanStanding(e, { ...base, current: 'COLLECTIONS', owesAnything: false })).toEqual({ state: 'CLEAR', recoveryNeeded: 0 });
    expect(nextLoanStanding(e, { ...base, current: 'RECOVERING', recoveryNeeded: 2, owesAnything: false })).toEqual({ state: 'CLEAR', recoveryNeeded: 0 });
    // A miss during recovery starts over.
    expect(nextLoanStanding(e, { ...base, current: 'RECOVERING', recoveryNeeded: 1, missedOutstanding: 1 })).toEqual({ state: 'DELINQUENT', recoveryNeeded: 0 });
  });

  it('keeps the earlier rounds\' simple delinquency without collections rules', () => {
    const c = classicOgV165C.loanShark;
    expect(nextLoanStanding(c, { ...base, current: 'CLEAR', missedOutstanding: 5 })).toEqual({ state: 'DELINQUENT', recoveryNeeded: 0 });
    expect(nextLoanStanding(c, { ...base, current: 'DELINQUENT' })).toEqual({ state: 'CLEAR', recoveryNeeded: 0 });
    expect(loanStandingRefusal(c, 'DELINQUENT', 0)).toBeNull();
  });

  it('pauses new loans until the player is clear, and says what is left', () => {
    expect(loanStandingRefusal(e, 'CLEAR', 0)).toBeNull();
    expect(loanStandingRefusal(e, 'DELINQUENT', 0)).toMatchObject({ code: 'LOAN_PAUSED' });
    expect(loanStandingRefusal(e, 'COLLECTIONS', 0)).toMatchObject({ code: 'LOAN_PAUSED' });
    expect(loanStandingRefusal(e, 'RECOVERING', 1)?.message).toContain('Pay 1 more installment on time');
  });

  it('garnishes a share of income, never past the day cap, what is overdue, or the cash on hand', () => {
    const at = { incomeCents: 1_000_000n, garnishedLast24hCents: 0n, overdueCents: 10_000_000n, cashCents: 10_000_000n };
    expect(garnishCents(e, at)).toBe(250_000n);
    expect(garnishCents(e, { ...at, incomeCents: 100_000_000n })).toBe(BigInt(e.collections.garnishCapPerDayCents));
    expect(garnishCents(e, { ...at, garnishedLast24hCents: BigInt(e.collections.garnishCapPerDayCents) - 10n })).toBe(10n);
    expect(garnishCents(e, { ...at, garnishedLast24hCents: BigInt(e.collections.garnishCapPerDayCents) + 10n })).toBe(0n);
    expect(garnishCents(e, { ...at, overdueCents: 7n })).toBe(7n);
    expect(garnishCents(e, { ...at, cashCents: 3n })).toBe(3n);
    expect(garnishCents(e, { ...at, incomeCents: 0n })).toBe(0n);
    expect(garnishCents(classicOgV165C.loanShark, at)).toBe(0n);
  });
});
