import { describe, expect, it } from 'vitest';
import { classicOgV16H } from '../classic-og-v1.6-h/index.js';
import { classicOgV165A } from '../classic-og-v1.6.5-a/index.js';
import { classicOgV165B } from '../classic-og-v1.6.5-b/index.js';
import { classicOgV165C } from '../classic-og-v1.6.5-c/index.js';
import { classicOgV165E } from '../classic-og-v1.6.5-e/index.js';
import { classicOgV165G } from '../classic-og-v1.6.5-g/index.js';
import { hideoutV2For } from '../hideout-v2.js';
import { rulesets } from '../index.js';
import type { Ruleset } from '../types.js';

describe('1.6.5-A debt foundation ruleset', () => {
  it('registers a new pinned ruleset and enables the loan shark only there and after', () => {
    expect(classicOgV165A.meta).toEqual({ id: 'classic-og-v1.6.5-a', version: '1.6.5-A', name: 'Classic OG - Debt Foundation' });
    expect(rulesets[classicOgV165A.meta.id]).toBe(classicOgV165A);
    // 1.7.0 builds on the finished 1.6.5 season, so it carries the loan shark too.
    const others = Object.values(rulesets).filter((ruleset) => !ruleset.meta.id.startsWith('classic-og-v1.6.5-') && !ruleset.meta.id.startsWith('classic-og-v1.7-')) as Ruleset[];
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

  it('adds only offers to 1.6.5-A', () => {
    expect(classicOgV165B.meta).toEqual({ id: 'classic-og-v1.6.5-b', version: '1.6.5-B', name: 'Classic OG - Loan Offers' });
    expect(rulesets[classicOgV165B.meta.id]).toBe(classicOgV165B);
    expect((rules as { pricing?: unknown }).pricing).toBeUndefined();
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

describe('1.6.5-C escalating terms ruleset', () => {
  const rules = classicOgV165C.loanShark;

  it('adds only pricing and a higher fee cap to 1.6.5-B', () => {
    expect(classicOgV165C.meta).toEqual({ id: 'classic-og-v1.6.5-c', version: '1.6.5-C', name: 'Classic OG - Escalating Loans' });
    expect(rulesets[classicOgV165C.meta.id]).toBe(classicOgV165C);
    expect((rules as { collections?: unknown }).collections).toBeUndefined();
    const { pricing: _pricing, maxContractFeePercent, ...limits } = rules;
    const { maxContractFeePercent: baseMax, ...baseLimits } = classicOgV165B.loanShark;
    expect(limits).toEqual(baseLimits);
    expect(maxContractFeePercent).toBeGreaterThan(baseMax);
    expect(maxContractFeePercent).toBeLessThan(100);
    const { meta: _meta, loanShark: _loanShark, ...rest } = classicOgV165C;
    const { meta: _baseMeta, loanShark: _baseLoanShark, ...base } = classicOgV165B;
    expect(rest).toEqual(base);
    expect(hideoutV2For(classicOgV165C)).toBe(hideoutV2For(classicOgV165B));
  });

  it('has utilization tiers that start at zero, climb, and only ever get dearer', () => {
    const tiers = rules.pricing.utilizationTiers;
    expect(tiers[0]).toMatchObject({ fromPercent: 0, surchargePercent: 0 });
    for (let index = 1; index < tiers.length; index += 1) {
      expect(tiers[index]!.fromPercent).toBeGreaterThan(tiers[index - 1]!.fromPercent);
      expect(tiers[index]!.fromPercent).toBeLessThan(100);
      expect(tiers[index]!.surchargePercent).toBeGreaterThan(tiers[index - 1]!.surchargePercent);
    }
    expect(rules.pricing.missedInstallmentSurchargePercent).toBeGreaterThan(0);
    expect(rules.pricing.maxHistorySurchargePercent).toBeGreaterThanOrEqual(rules.pricing.missedInstallmentSurchargePercent);
    // Every listed fee is still valid under the cap.
    for (const offer of rules.offers) expect(offer.contractFeeCents * 100).toBeLessThanOrEqual(offer.principalCents * rules.maxContractFeePercent);
  });
});

describe('1.6.5-E collections ruleset', () => {
  const rules = classicOgV165E.loanShark;

  it('adds only collections to 1.6.5-C while the G release snapshot is the newest 1.6.5', () => {
    expect(classicOgV165E.meta).toEqual({ id: 'classic-og-v1.6.5-e', version: '1.6.5-E', name: 'Classic OG - Loan Collections' });
    expect(rulesets[classicOgV165E.meta.id]).toBe(classicOgV165E);
    expect(Object.values(rulesets).filter((ruleset) => ruleset.meta.id.startsWith('classic-og-v1.6.5-')).at(-1)).toBe(classicOgV165G);
    const { collections: _collections, ...rest } = rules;
    expect(rest).toEqual(classicOgV165C.loanShark);
    const { meta: _meta, loanShark: _loanShark, ...others } = classicOgV165E;
    const { meta: _baseMeta, loanShark: _baseLoanShark, ...base } = classicOgV165C;
    expect(others).toEqual(base);
    expect(hideoutV2For(classicOgV165E)).toBe(hideoutV2For(classicOgV165C));
  });

  it('keeps collections bounded and recoverable', () => {
    const c = rules.collections;
    expect(c.missedInstallmentsThreshold).toBeGreaterThanOrEqual(1);
    expect(c.garnishPercent).toBeGreaterThan(0);
    expect(c.garnishPercent).toBeLessThan(100);
    expect(c.garnishCapPerDayCents).toBeGreaterThan(0);
    expect(c.recoveryOnTimeInstallments).toBeGreaterThanOrEqual(1);
    expect(c.recoveryOnTimeInstallments).toBeLessThanOrEqual(rules.maxInstallments);
    // Borrowed cash, transfers and repayments are never income to garnish.
    for (const source of c.garnishSources) expect(source).not.toMatch(/^LOAN_|ADMIN|CASINO|TRANSFER/);
    expect(c.garnishSources).toContain('DEALER_SALES');
  });
});
