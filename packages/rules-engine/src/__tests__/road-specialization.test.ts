import { describe, expect, it } from 'vitest';
import { classicOgV15C, classicOgV15D } from '@streets/rulesets';
import { vehicleServiceCents, vehicleServiceDiscount } from '../calculations/runs.js';
import { racketStorePrice } from '../calculations/rackets.js';

describe('1.5.0-D road specialization discounts', () => {
  it('gives nothing before D, and nothing to a crew without the road lane', () => {
    expect(vehicleServiceDiscount(classicOgV15C, 'REPAIR', { racketEffects: { RUN_MODS: 1 }, roadSaintsTier: 'INNER_CIRCLE' })).toEqual({ percent: 0, sources: [] });
    expect(vehicleServiceDiscount(classicOgV15D, 'REPAIR', { racketEffects: {}, roadSaintsTier: 'KNOWN' })).toEqual({ percent: 0, sources: [] });
  });

  it('scales an Auto Garage with its strongest racket and only cuts repairs', () => {
    const effects = { RUN_MODS: 0.4, GETAWAY_CARS: 0.8 };
    expect(vehicleServiceDiscount(classicOgV15D, 'REPAIR', { racketEffects: effects })).toEqual({ percent: 20, sources: [{ source: 'AUTO_GARAGE', percent: 20 }] });
    expect(vehicleServiceDiscount(classicOgV15D, 'RECOVER', { racketEffects: effects }).percent).toBe(0);
  });

  it('lets the Chop Shop cut recovery and Road Saints at Trusted cut both, under the cap', () => {
    const recovery = vehicleServiceDiscount(classicOgV15D, 'RECOVER', { racketEffects: { VEHICLE_RECOVERY: 1 }, roadSaintsTier: 'CONNECTED' });
    expect(recovery).toEqual({ percent: 35, sources: [{ source: 'CHOP_SHOP', percent: 25 }, { source: 'ROAD_SAINTS', percent: 10 }] });
    expect(vehicleServiceDiscount(classicOgV15D, 'REPAIR', { racketEffects: {}, roadSaintsTier: 'TRUSTED' }).percent).toBe(10);
    expect(vehicleServiceCents(classicOgV15D, 'VAN', 'RECOVER', 2, recovery.percent)).toBe(2n * 221_000n);
  });

  it('extends Stolen Low-Riders to Sedans and Vans in Charlie’s garage', () => {
    expect(racketStorePrice(classicOgV15D, { STOLEN_LOW_RIDERS: 1 }, 'CHARLIE', 'VAN').buyDiscountPercent).toBe(8);
    expect(racketStorePrice(classicOgV15C, { STOLEN_LOW_RIDERS: 1 }, 'CHARLIE', 'VAN').buyDiscountPercent).toBe(0);
  });
});
