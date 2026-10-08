import { describe, expect, it } from 'vitest';
import { classicOgV15E } from '../classic-og-v1.5-e/index.js';
import { classicOgV15E2 } from '../classic-og-v1.5-e2/index.js';

describe("1.5.0-E2 Charlie's fleet", () => {
  it('puts Sedans and Vans on Charlie’s shelf at their 1.5 prices, with no buyback', () => {
    expect(classicOgV15E2.meta).toEqual({ id: 'classic-og-v1.5-e2', version: '1.5.0-E2', name: "Classic OG - Charlie's Fleet" });
    const items = classicOgV15E2.stores.CHARLIE.items;
    expect(items.SEDAN).toMatchObject({ field: 'sedans', vehicleClass: 'SEDAN', buyCents: 350_000, sellCents: null });
    expect(items.VAN).toMatchObject({ field: 'vans', vehicleClass: 'VAN', buyCents: 850_000, sellCents: null });
    expect(items.LOW_RIDER).toEqual(classicOgV15E.stores.CHARLIE.items.LOW_RIDER);
    for (const vehicle of classicOgV15E2.vehicleCatalog.classes) {
      if (vehicle.purchasePriceCents) expect(items[vehicle.id as 'SEDAN' | 'VAN'].buyCents).toBe(vehicle.purchasePriceCents);
    }
  });

  it('opens each class through one of Wheels’s jobs, and nothing else changes', () => {
    const rewards = (key: 'PACK_YOUR_BAGS' | 'WHEELS_HEAVY_HAUL') => classicOgV15E2.questDefinitions[key].rewards;
    expect(rewards('PACK_YOUR_BAGS')).toContainEqual({ kind: 'PERMANENT_UNLOCK', key: 'VEHICLE_SEDAN_ACCESS' });
    expect(rewards('WHEELS_HEAVY_HAUL')).toContainEqual({ kind: 'PERMANENT_UNLOCK', key: 'VEHICLE_VAN_ACCESS' });
    expect(classicOgV15E2.permanentUnlocks.VEHICLE_SEDAN_ACCESS.effect).toEqual({ kind: 'VEHICLE_PURCHASE_ACCESS', classId: 'SEDAN' });
    expect(classicOgV15E2.permanentUnlocks.VEHICLE_VAN_ACCESS.effect).toEqual({ kind: 'VEHICLE_PURCHASE_ACCESS', classId: 'VAN' });
    // Every unlock in the round is paid by some quest, so every locked shelf can name one.
    for (const unlock of Object.keys(classicOgV15E2.permanentUnlocks)) {
      const granted = Object.values(classicOgV15E2.questDefinitions).some((quest) => quest.rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK' && reward.key === unlock));
      expect(granted, unlock).toBe(true);
    }
    const { meta: _m, stores: _s, permanentUnlocks: _p, questDefinitions: _q, ...e2 } = classicOgV15E2;
    const { meta: _em, stores: _es, permanentUnlocks: _ep, questDefinitions: _eq, ...e } = classicOgV15E;
    expect(e2).toEqual(e);
  });
});
