import { describe, expect, it } from 'vitest';
import { classicOgV06F, classicOgV07A } from '@streets/rulesets';
import { hideoutCatalog } from '../hideout.service.js';
import type { PlayerState } from '../action.service.js';

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    cashCents: 100_000_000n,
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
});
