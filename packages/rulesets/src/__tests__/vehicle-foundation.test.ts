import { describe, expect, it } from 'vitest';
import { classicOgV14G } from '../classic-og-v1.4-g/index.js';
import { classicOgV15A } from '../classic-og-v1.5-a/index.js';

describe('1.5.0-A vehicle foundation', () => {
  it('pins a single legacy Low-Rider class without changing 1.4.0-G gameplay values', () => {
    expect(classicOgV15A.meta).toEqual({ id: 'classic-og-v1.5-a', version: '1.5.0-A', name: 'Classic OG - Fleet Foundation' });
    expect(classicOgV15A.vehicleCatalog?.classes).toEqual([{
      id: 'LOW_RIDER',
      name: 'Low-Rider',
      description: 'The familiar all-purpose ride. Existing vehicles keep their current travel and street-work behavior.',
      legacyResource: 'lowRiders',
    }]);
    const { meta: _meta, vehicleCatalog: _catalog, ...foundation } = classicOgV15A;
    const { meta: _baseMeta, ...base } = classicOgV14G;
    expect(foundation).toEqual(base);
  });
});
