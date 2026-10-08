import { describe, expect, it } from 'vitest';
import { classicOgV15D } from '../classic-og-v1.5-d/index.js';
import { classicOgV15E } from '../classic-og-v1.5-e/index.js';

describe('1.5.0-E vehicles release', () => {
  it('trims the Sedan to 5% lower route risk and changes nothing else', () => {
    expect(classicOgV15E.meta).toEqual({ id: 'classic-og-v1.5-e', version: '1.5.0-E', name: 'Classic OG - Vehicles Release' });
    expect(classicOgV15E.vehicleCatalog.routeRisk).toEqual({ LOW_PROFILE: 0.95, HIGH_VISIBILITY: 1.15 });
    const { routeRisk: _risk, ...catalog } = classicOgV15E.vehicleCatalog;
    expect(catalog).toEqual(classicOgV15D.vehicleCatalog);
    const { meta: _meta, vehicleCatalog: _catalog, ...e } = classicOgV15E;
    const { meta: _dMeta, vehicleCatalog: _dCatalog, ...d } = classicOgV15D;
    expect(e).toEqual(d);
  });
});
