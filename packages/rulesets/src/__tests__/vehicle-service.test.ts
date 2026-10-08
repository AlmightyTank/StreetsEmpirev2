import { describe, expect, it } from 'vitest';
import { classicOgV15B } from '../classic-og-v1.5-b/index.js';
import { classicOgV15C } from '../classic-og-v1.5-c/index.js';

describe('1.5.0-C garage service', () => {
  it('pins repair and recovery terms on the B fleet without changing anything else', () => {
    expect(classicOgV15C.meta).toEqual({ id: 'classic-og-v1.5-c', version: '1.5.0-C', name: 'Classic OG - Garage Service & Recovery' });
    expect(classicOgV15C.vehicleCatalog.classes).toEqual(classicOgV15B.vehicleCatalog.classes);
    expect(classicOgV15C.vehicleCatalog.service).toEqual({
      repairCents: { LOW_RIDER: 75_000, SEDAN: 50_000, VAN: 125_000 },
      recoveryCents: { LOW_RIDER: 200_000, SEDAN: 140_000, VAN: 340_000 },
      damage: { bust: 1, convoyLoss: 1 },
      disable: { arrest: 1 },
      damageOrder: ['VAN', 'LOW_RIDER', 'SEDAN'],
    });
    const { meta: _meta, vehicleCatalog: _catalog, ...c } = classicOgV15C;
    const { meta: _bMeta, vehicleCatalog: _bCatalog, ...b } = classicOgV15B;
    expect(c).toEqual(b);
  });

  it('keeps every repair below recovery, and recovery below the price of a new car', () => {
    const service = classicOgV15C.vehicleCatalog.service;
    const lowRiderPrice = classicOgV15C.stores.CHARLIE!.items.LOW_RIDER!.buyCents;
    for (const vehicle of classicOgV15C.vehicleCatalog.classes) {
      const price = vehicle.purchasePriceCents ?? lowRiderPrice;
      expect(service.repairCents[vehicle.id]).toBeLessThan(service.recoveryCents[vehicle.id]);
      expect(service.recoveryCents[vehicle.id]).toBeLessThan(price / 2);
    }
    // The Sedan is the cheap car to keep running; the Van the dear one.
    expect(service.repairCents.SEDAN).toBeLessThan(service.repairCents.LOW_RIDER);
    expect(service.repairCents.VAN).toBeGreaterThan(service.repairCents.LOW_RIDER);
  });
});
