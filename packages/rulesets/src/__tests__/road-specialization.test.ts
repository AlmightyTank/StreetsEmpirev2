import { describe, expect, it } from 'vitest';
import { classicOgV15C } from '../classic-og-v1.5-c/index.js';
import { classicOgV15D } from '../classic-og-v1.5-d/index.js';

describe('1.5.0-D road specialization', () => {
  it('pins capped service discounts and leaves every vehicle and route value alone', () => {
    expect(classicOgV15D.meta).toEqual({ id: 'classic-og-v1.5-d', version: '1.5.0-D', name: 'Classic OG - Road Specialization' });
    expect(classicOgV15D.vehicleCatalog.classes).toEqual(classicOgV15C.vehicleCatalog.classes);
    const { specialization, ...service } = classicOgV15D.vehicleCatalog.service;
    expect(service).toEqual(classicOgV15C.vehicleCatalog.service);
    expect(specialization).toEqual({ autoGarageRepairPercent: 25, chopShopRecoveryPercent: 25, roadSaints: { tier: 'TRUSTED', percent: 10 }, maxDiscountPercent: 35 });
    expect(specialization.maxDiscountPercent).toBeLessThan(50);
  });

  it('only rewords the road rackets and widens Stolen Low-Riders to the new classes', () => {
    const before = classicOgV15C.business.rackets.catalog;
    const after = classicOgV15D.business.rackets.catalog;
    expect(after.STOLEN_LOW_RIDERS.effect).toEqual({ kind: 'STORE_PRICE', store: 'CHARLIE', items: ['LOW_RIDER', 'SEDAN', 'VAN'], buyDiscountPercent: 8 });
    for (const key of ['VEHICLE_RECOVERY', 'RUN_MODS', 'GETAWAY_CARS'] as const) {
      expect(after[key].effect).toEqual(before[key].effect);
      expect(after[key].heatPerHour).toBe(before[key].heatPerHour);
    }
    const { business: _business, vehicleCatalog: _catalog, meta: _meta, ...d } = classicOgV15D;
    const { business: _cBusiness, vehicleCatalog: _cCatalog, meta: _cMeta, ...c } = classicOgV15C;
    expect(d).toEqual(c);
    const { rackets: _rackets, ...dBusiness } = classicOgV15D.business;
    const { rackets: _cRackets, ...cBusiness } = classicOgV15C.business;
    expect(dBusiness).toEqual(cBusiness);
  });
});
