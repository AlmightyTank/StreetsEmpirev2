import { describe, expect, it } from 'vitest';
import { classicOgV15A } from '../classic-og-v1.5-a/index.js';
import { classicOgV15B } from '../classic-og-v1.5-b/index.js';

describe('1.5.0-B vehicle classes', () => {
  it('pins Sedan and Van roles on the A catalog without changing the underlying game rules', () => {
    expect(classicOgV15B.meta).toEqual({ id: 'classic-og-v1.5-b', version: '1.5.0-B', name: 'Classic OG - Vehicle Classes & Run Loadouts' });
    expect(classicOgV15B.vehicleCatalog?.classes.map(({ id, cargoPercent, crewSeats, purchasePriceCents, routeProfile }) => ({ id, cargoPercent, crewSeats, purchasePriceCents, routeProfile }))).toEqual([
      { id: 'LOW_RIDER', cargoPercent: 100, crewSeats: null, purchasePriceCents: null, routeProfile: 'NORMAL' },
      { id: 'SEDAN', cargoPercent: 65, crewSeats: 4, purchasePriceCents: 350_000, routeProfile: 'LOW_PROFILE' },
      { id: 'VAN', cargoPercent: 150, crewSeats: null, purchasePriceCents: 850_000, routeProfile: 'HIGH_VISIBILITY' },
    ]);
    const { meta: _meta, vehicleCatalog: _catalog, ...b } = classicOgV15B;
    const { meta: _aMeta, vehicleCatalog: _aCatalog, ...a } = classicOgV15A;
    expect(b).toEqual(a);
  });
});
