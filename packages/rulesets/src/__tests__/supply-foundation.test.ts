import { describe, expect, it } from 'vitest';
import { classicOgV15E3 } from '../classic-og-v1.5-e3/index.js';
import { classicOgV16A } from '../classic-og-v1.6-a/index.js';
import { classicOgV16B } from '../classic-og-v1.6-b/index.js';
import { rulesets } from '../index.js';
import type { Ruleset } from '../types.js';

describe('1.6.0-A supply foundation ruleset', () => {
  it('registers a new pinned ruleset and enables supply only there', () => {
    expect(classicOgV16A.meta).toEqual({
      id: 'classic-og-v1.6-a',
      version: '1.6.0-A',
      name: 'Classic OG - Supply Foundation',
    });
    expect(classicOgV16A.supplyNetwork).toEqual({ enabled: true });
    expect((classicOgV15E3 as Ruleset).supplyNetwork).toBeUndefined();
    expect(rulesets[classicOgV16A.meta.id]).toBe(classicOgV16A);
  });

  it('preserves the previous round values apart from the new capability and version metadata', () => {
    const { meta: _meta, supplyNetwork: _supplyNetwork, ...next } = classicOgV16A;
    const { meta: _baseMeta, ...base } = classicOgV15E3;
    expect(next).toEqual(base);
  });

  it('pins prepaid suppliers to B and validates their offer catalog shape', () => {
    expect(classicOgV16B.meta.version).toBe('1.6.0-B');
    expect((classicOgV16A as Ruleset).supplyNetwork?.suppliers).toBeUndefined();
    expect(classicOgV16B.supplyNetwork.maxOpenOrders).toBe(3);
    for (const supplier of classicOgV16B.supplyNetwork.suppliers) {
      expect(Object.keys(classicOgV16B.cities)).toContain(supplier.citySlug);
      for (const [product, offer] of Object.entries(supplier.offers)) {
        const availableProductKeys = [
          ...Object.keys(classicOgV16B.products ?? {}),
          ...Object.keys(classicOgV16B.stores.PIP.items),
        ];
        expect(availableProductKeys).toContain(product);
        expect(offer.unitCostCents).toBeGreaterThan(0);
        expect(offer.minOrderQuantity).toBeGreaterThan(0);
        expect(offer.maxOrderQuantity).toBeGreaterThanOrEqual(offer.minOrderQuantity);
        expect(offer.stockPerRound).toBeGreaterThanOrEqual(offer.maxOrderQuantity);
      }
    }
    expect(rulesets[classicOgV16B.meta.id]).toBe(classicOgV16B);
  });
});
