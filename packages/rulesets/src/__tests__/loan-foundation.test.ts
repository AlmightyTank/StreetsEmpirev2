import { describe, expect, it } from 'vitest';
import { classicOgV16H } from '../classic-og-v1.6-h/index.js';
import { classicOgV165A } from '../classic-og-v1.6.5-a/index.js';
import { hideoutV2For } from '../hideout-v2.js';
import { rulesets } from '../index.js';
import type { Ruleset } from '../types.js';

describe('1.6.5-A debt foundation ruleset', () => {
  it('registers a new pinned ruleset and enables the loan shark only there', () => {
    expect(classicOgV165A.meta).toEqual({ id: 'classic-og-v1.6.5-a', version: '1.6.5-A', name: 'Classic OG - Debt Foundation' });
    expect(rulesets[classicOgV165A.meta.id]).toBe(classicOgV165A);
    expect(Object.values(rulesets).at(-1)).toBe(classicOgV165A);
    const others = Object.values(rulesets).filter((ruleset) => ruleset !== classicOgV165A) as Ruleset[];
    expect(others.length).toBeGreaterThan(100);
    for (const ruleset of others) expect(ruleset.loanShark, ruleset.meta.id).toBeUndefined();
  });

  it('changes nothing from 1.6.0-H apart from the loan shark and its version', () => {
    const { meta: _meta, loanShark: _loanShark, ...next } = classicOgV165A;
    const { meta: _baseMeta, ...base } = classicOgV16H;
    expect(next).toEqual(base);
    expect(hideoutV2For(classicOgV165A)).toBe(hideoutV2For(classicOgV16H));
  });

  it('sets hard, finite, consistent limits', () => {
    const rules = classicOgV165A.loanShark;
    for (const value of Object.values(rules).filter((entry) => typeof entry === 'number')) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(rules.enabled).toBe(true);
    expect(rules.feeCapCents).toBeLessThan(rules.debtCeilingCents);
    expect(rules.lateFeeCapPerLoanCents).toBeLessThanOrEqual(rules.feeCapCents);
    expect(rules.lateFeeCents).toBeLessThanOrEqual(rules.lateFeeCapPerLoanCents);
    expect(rules.maxContractFeePercent).toBeLessThan(100);
    // A whole round fits a full schedule many times over.
    expect(rules.installmentIntervalHours * rules.maxInstallments).toBeLessThan(classicOgV165A.round.defaultDurationDays * 24);
  });
});
