import { describe, expect, it } from 'vitest';
import { classicOgV06F, classicOgV07A, classicOgV07B } from '@streets/rulesets';
import { hideoutCatalog, hideoutProductProtection, hideoutProtectedProductCapacity } from '../hideout.service.js';
import type { PlayerState } from '../action.service.js';

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    cashCents: 100_000_000n,
    crack: 100,
    pistols: 5,
    shotguns: 0,
    tek9s: 0,
    ak47s: 0,
    lowRiders: 2,
    cleanShiftStreak: 3,
    rocksSuppliedToPip: 100,
    driveBysDone: 0,
    raidsDone: 0,
    hideoutSafeRoomLevel: 2,
    hideoutLookoutsLevel: 0,
    hideoutWorkshopLevel: 0,
    hideoutBackOfficeLevel: 0,
    hideoutGarageLevel: 0,
    ...overrides,
  } as PlayerState;
}

describe('hideout v2 catalog', () => {
  it('keeps older rounds cash-only', () => {
    const catalog = hideoutCatalog(classicOgV06F, player());
    const safeRoom = catalog.rooms.find((room) => room.key === 'SAFE_ROOM')!;

    expect(catalog.rulesVersion).toBe(1);
    expect(safeRoom.nextRequirements).toEqual([]);
    expect(safeRoom.canUpgrade).toBe(true);
  });

  it('explains an unmet 0.7 progress gate and unlocks when progress is met', () => {
    const locked = hideoutCatalog(classicOgV07A, player());
    const lockedSafeRoom = locked.rooms.find((room) => room.key === 'SAFE_ROOM')!;

    expect(locked.rulesVersion).toBe(2);
    expect(lockedSafeRoom.canUpgrade).toBe(false);
    expect(lockedSafeRoom.lockReason).toContain('Raids completed 0/1');
    expect(lockedSafeRoom.nextRequirements[0]).toMatchObject({
      key: 'RAIDS_DONE',
      current: 0,
      required: 1,
      met: false,
    });

    const ready = hideoutCatalog(classicOgV07A, player({ raidsDone: 1 }));
    expect(ready.rooms.find((room) => room.key === 'SAFE_ROOM')?.canUpgrade).toBe(true);
  });

  it('protects the highest-value product first without creating a second inventory', () => {
    const p = player({ hideoutSafeRoomLevel: 3, raidsDone: 1, crack: 100 });
    const products = { COCAINE: 20, WEED: 50 };
    const protection = hideoutProductProtection(classicOgV07B, p, products);

    expect(hideoutProtectedProductCapacity(classicOgV07B, p)).toBe(25);
    expect(protection.capacity).toBe(25);
    expect(protection.protected).toMatchObject({ COCAINE: 20, WEED: 5 });
    expect(protection.exposed).toMatchObject({ COCAINE: 0, WEED: 45, CRACK: 100 });
    expect(protection.protectedUnits).toBe(25);
    expect(protection.exposedUnits).toBe(145);

    // The source inventory remains untouched; protection is a computed view.
    expect(products).toEqual({ COCAINE: 20, WEED: 50 });
  });

  it('shows exact protected and exposed assets in the 0.7-B Hideout catalog', () => {
    const p = player({ hideoutSafeRoomLevel: 5, raidsDone: 1, crack: 40, cashCents: 2_000_000n });
    const catalog = hideoutCatalog(classicOgV07B, p, { COCAINE: 80, WEED: 60 });

    expect(catalog.assetProtection).toBeDefined();
    expect(catalog.assetProtection).toMatchObject({
      protectedProductCapacity: 100,
      protectedProductUnits: 100,
      exposedProductUnits: 80,
      policy: 'HIGHEST_VALUE_FIRST',
    });
    expect(catalog.assetProtection!.products.find((row) => row.key === 'COCAINE'))
      .toMatchObject({ total: 80, protected: 80, exposed: 0 });
    expect(catalog.assetProtection!.exposedCashCents).toBeGreaterThanOrEqual(0);
  });

});
