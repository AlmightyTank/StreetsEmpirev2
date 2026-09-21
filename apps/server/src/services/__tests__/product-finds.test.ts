import { describe, expect, it } from 'vitest';
import { classicOgV03D, classicOgV05F } from '@streets/rulesets';
import { streetProductFinds } from '../product-inventory.service.js';

describe('mixed street product finds', () => {
  it('keeps older single-product rounds crack-only', () => {
    expect(streetProductFinds(classicOgV03D, 'new-york-city', 5, () => 0.5))
      .toEqual([{ key: 'CRACK', name: 'Product', quantity: 5 }]);
  });

  it('uses city supply and find-point costs for valuable products', () => {
    // Miami has plentiful Cocaine. Eight old crack-find points are exactly
    // enough for two Cocaine units at the current net-worth values.
    expect(streetProductFinds(classicOgV05F, 'miami-beach', 8, () => 0.5))
      .toEqual([{ key: 'COCAINE', name: 'Cocaine', quantity: 2 }]);
  });

  it('does not prefer a product the city does not normally carry', () => {
    const found = streetProductFinds(classicOgV05F, 'beverly-hills', 4, () => 0);
    expect(found).toEqual([{ key: 'WEED', name: 'Weed', quantity: 4 }]);
    expect(found.some((row) => row.key === 'CRACK' || row.key === 'METH')).toBe(false);
  });
});
