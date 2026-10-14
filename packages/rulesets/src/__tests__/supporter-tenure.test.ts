import { describe, expect, it } from 'vitest';
import { SUPPORTER_COSMETICS, SUPPORTER_TENURE, tenureTiersFor } from '../supporter.js';

describe('supporter tenure track', () => {
  it('tiers rise at 3, 6 and 12 months with unique badge keys', () => {
    expect(SUPPORTER_TENURE.map((tier) => tier.months)).toEqual([3, 6, 12]);
    const keys = new Set(SUPPORTER_TENURE.map((tier) => tier.badge.key));
    expect(keys.size).toBe(SUPPORTER_TENURE.length);
    for (const tier of SUPPORTER_TENURE) {
      expect(tier.badge.kind).toBe('TITLE_BADGE');
      expect(tier.badge.key in SUPPORTER_COSMETICS).toBe(false);
    }
  });

  it('unlocks only the tiers the paid-month count reaches', () => {
    expect(tenureTiersFor(0)).toEqual([]);
    expect(tenureTiersFor(2)).toEqual([]);
    expect(tenureTiersFor(3).map((badge) => badge.key)).toEqual(['supporter-tenure-3']);
    expect(tenureTiersFor(5).map((badge) => badge.key)).toEqual(['supporter-tenure-3']);
    expect(tenureTiersFor(6).map((badge) => badge.key)).toEqual(['supporter-tenure-3', 'supporter-tenure-6']);
    expect(tenureTiersFor(12).map((badge) => badge.key)).toEqual([
      'supporter-tenure-3',
      'supporter-tenure-6',
      'supporter-tenure-12',
    ]);
  });
});
