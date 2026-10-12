import { describe, expect, it } from 'vitest';
import { classicOgV16G } from '../classic-og-v1.6-g/index.js';
import { classicOgV16H } from '../classic-og-v1.6-h/index.js';
import { rulesets } from '../index.js';

describe('1.6.0-H international lanes ruleset', () => {
  it('adds lanes and changes nothing else from G', () => {
    expect(classicOgV16H.meta).toEqual({ id: 'classic-og-v1.6-h', version: '1.6.0-H', name: 'Classic OG - International Lanes' });
    const { lanes, ...network } = classicOgV16H.supplyNetwork;
    expect(network).toEqual(classicOgV16G.supplyNetwork);
    expect(Object.keys(lanes.routes).sort()).toEqual(['AIR', 'FREIGHT', 'NORTHERN', 'OVERLAND']);
    const { meta: _m, supplyNetwork: _s, ...rest } = classicOgV16H;
    const { meta: _m2, supplyNetwork: _s2, ...base } = classicOgV16G;
    expect(rest).toEqual(base);
    expect(rulesets[classicOgV16H.meta.id]).toBe(classicOgV16H);
  });

  it('sells abroad cheaper than at home, in bigger lots', () => {
    const domestic = classicOgV16G.supplyNetwork.suppliers;
    for (const supplier of classicOgV16H.supplyNetwork.lanes.suppliers) {
      for (const [product, offer] of Object.entries(supplier.offers)) {
        const home = domestic.flatMap((entry) => (entry.offers as Record<string, { unitCostCents: number; minOrderQuantity: number }>)[product] ?? []);
        if (!home.length) continue;
        expect(offer.unitCostCents).toBeLessThan(Math.min(...home.map((entry) => entry.unitCostCents)));
        expect(offer.minOrderQuantity).toBeGreaterThan(Math.min(...home.map((entry) => entry.minOrderQuantity)));
      }
    }
  });
});
