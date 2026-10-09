import { describe, expect, it } from 'vitest';
import { classicOgV15E3 } from '../classic-og-v1.5-e3/index.js';
import { classicOgV16A } from '../classic-og-v1.6-a/index.js';
import { classicOgV16B } from '../classic-og-v1.6-b/index.js';
import { classicOgV16C } from '../classic-og-v1.6-c/index.js';
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

  it('pins pickups to C and changes nothing else from B', () => {
    expect(classicOgV16C.meta).toEqual({ id: 'classic-og-v1.6-c', version: '1.6.0-C', name: 'Classic OG - Supply Pickup Routes' });
    expect((classicOgV16B as Ruleset).supplyNetwork?.pickups).toBeUndefined();
    const { pickups, ...network } = classicOgV16C.supplyNetwork;
    expect(network).toEqual(classicOgV16B.supplyNetwork);
    expect(pickups.homeStashUnits).toBeGreaterThanOrEqual(
      classicOgV16C.supplyNetwork.maxOpenOrders * Math.max(...classicOgV16C.supplyNetwork.suppliers.flatMap((supplier) => Object.values(supplier.offers).map((offer) => offer.maxOrderQuantity))),
    );
    expect(pickups.localPickupTurns).toBeGreaterThan(0);
    const { meta: _meta, supplyNetwork: _network, ...rest } = classicOgV16C;
    const { meta: _baseMeta, supplyNetwork: _baseNetwork, ...base } = classicOgV16B;
    expect(rest).toEqual(base);
    expect(rulesets[classicOgV16C.meta.id]).toBe(classicOgV16C);
  });
});
