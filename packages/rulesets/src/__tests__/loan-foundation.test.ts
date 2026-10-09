import { describe, expect, it } from 'vitest';
import { classicOgV16H } from '../classic-og-v1.6-h/index.js';
import { classicOgV165A } from '../classic-og-v1.6.5-a/index.js';
import { classicOgV165B } from '../classic-og-v1.6.5-b/index.js';
import { hideoutV2For } from '../hideout-v2.js';
import { rulesets } from '../index.js';
import type { Ruleset } from '../types.js';

describe('1.6.5-A debt foundation ruleset', () => {
  it('registers a new pinned ruleset and enables the loan shark only there', () => {
    expect(classicOgV165A.meta).toEqual({ id: 'classic-og-v1.6.5-a', version: '1.6.5-A', name: 'Classic OG - Debt Foundation' });
    expect(rulesets[classicOgV165A.meta.id]).toBe(classicOgV165A);
    const others = Object.values(rulesets).filter((ruleset) => !ruleset.meta.id.startsWith('classic-og-v1.6.5-')) as Ruleset[];
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
    expect((rules as { offers?: unknown }).offers).toBeUndefined();
    expect(rules.feeCapCents).toBeLessThan(rules.debtCeilingCents);
    expect(rules.lateFeeCapPerLoanCents).toBeLessThanOrEqual(rules.feeCapCents);
    expect(rules.lateFeeCents).toBeLessThanOrEqual(rules.lateFeeCapPerLoanCents);
    expect(rules.maxContractFeePercent).toBeLessThan(100);
    // A whole round fits a full schedule many times over.
    expect(rules.installmentIntervalHours * rules.maxInstallments).toBeLessThan(classicOgV165A.round.defaultDurationDays * 24);
  });
});

describe('1.6.5-B loan offers ruleset', () => {
  const rules = classicOgV165B.loanShark;

  it('is the ruleset new rounds start on, and adds only offers to 1.6.5-A', () => {
    expect(classicOgV165B.meta).toEqual({ id: 'classic-og-v1.6.5-b', version: '1.6.5-B', name: 'Classic OG - Loan Offers' });
    expect(rulesets[classicOgV165B.meta.id]).toBe(classicOgV165B);
    expect(Object.values(rulesets).at(-1)).toBe(classicOgV165B);
    const { offers: _offers, ...limits } = rules;
    expect(limits).toEqual(classicOgV165A.loanShark);
    const { meta: _meta, loanShark: _loanShark, ...rest } = classicOgV165B;
    const { meta: _baseMeta, loanShark: _baseLoanShark, ...base } = classicOgV165A;
    expect(rest).toEqual(base);
    expect(hideoutV2For(classicOgV165B)).toBe(hideoutV2For(classicOgV165A));
  });

  it('starts with a small set of fixed, valid, distinct tiers that each fit under the ceiling', () => {
    expect(rules.offers.length).toBeGreaterThanOrEqual(2);
    expect(rules.offers.length).toBeLessThanOrEqual(5);
    expect(new Set(rules.offers.map((offer) => offer.key)).size).toBe(rules.offers.length);
    for (const offer of rules.offers) {
      expect(offer.key).toMatch(/^[A-Z][A-Z0-9_]{1,31}$/);
      expect(offer.principalCents).toBeGreaterThan(0);
      expect(offer.contractFeeCents).toBeGreaterThan(0);
      expect(offer.contractFeeCents * 100).toBeLessThanOrEqual(offer.principalCents * rules.maxContractFeePercent);
      expect(offer.installmentCount).toBeGreaterThanOrEqual(1);
      expect(offer.installmentCount).toBeLessThanOrEqual(rules.maxInstallments);
      expect(offer.principalCents + offer.contractFeeCents).toBeLessThanOrEqual(rules.debtCeilingCents);
    }
  });

  it('makes bigger advances cost more a dollar, so no tier is the automatic pick', () => {
    const tiers = [...rules.offers].sort((a, b) => a.principalCents - b.principalCents);
    for (let index = 1; index < tiers.length; index += 1) {
      const rate = (offer: (typeof tiers)[number]) => offer.contractFeeCents / offer.principalCents;
      expect(rate(tiers[index]!)).toBeGreaterThan(rate(tiers[index - 1]!));
    }
    // The smallest tier is open to everyone; a new boss is never shut out entirely.
    expect('minNetWorthCents' in tiers[0]!).toBe(false);
  });
});
