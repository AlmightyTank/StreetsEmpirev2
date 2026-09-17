import { describe, expect, it } from 'vitest';
import { classicOgV01, classicOgV03D, classicOgV04A } from '@streets/rulesets';
import { productKeys } from '../product-inventory.service.js';

describe('productKeys', () => {
  it('lists the catalog in display order, crack first', () => {
    expect(productKeys(classicOgV04A)).toEqual(['CRACK', 'WEED', 'ECSTASY', 'COCAINE', 'METH', 'HEROIN']);
  });

  it('knows only crack on rounds without a catalog', () => {
    expect(productKeys(classicOgV03D)).toEqual(['CRACK']);
    expect(productKeys(classicOgV01)).toEqual(['CRACK']);
  });
});
