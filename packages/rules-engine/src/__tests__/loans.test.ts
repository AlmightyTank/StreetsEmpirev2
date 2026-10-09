import { describe, expect, it } from 'vitest';
import { classicOgV16H, classicOgV165A, type LoanSharkRules, type Ruleset } from '@streets/rulesets';
import {
  LoanError,
  allocateLoanPayment,
  buildInstallmentSchedule,
  calculateNetWorthCents,
  debtLimits,
  debtRoomCents,
  lateFeeChargeCents,
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
      { sequence: 1, contractFeeCents: 50n, principalCents: 250n, cleared: false },
      { sequence: 2, contractFeeCents: 0n, principalCents: 0n, cleared: false },
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

  it('rejects non-positive payments and negative balances', () => {
    expect(() => allocateLoanPayment(0n, 0n, installments)).toThrow(RangeError);
    expect(() => allocateLoanPayment(1n, -1n, installments)).toThrow(RangeError);
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
