import { describe, expect, it } from 'vitest';
import { classicOgV06F, classicOgV07A, classicOgV07B, classicOgV07C, classicOgV07D, classicOgV07F, classicOgV07G } from '@streets/rulesets';
import {
  hideoutCatalog,
  hideoutBackOfficeBonusCents,
  hideoutDefenseBonusPercent,
  hideoutGarageRelocationDiscountPercent,
  hideoutGarageRunLimit,
  hideoutMedicineEfficiencyPercent,
  hideoutProductProtection,
  hideoutProtectedCashBonusCents,
  hideoutProtectedProductCapacity,
  hideoutWorkshopIngredientCentsPerUnit,
  hideoutWorkshopIngredientEfficiencyPercent,
  hideoutSpecializationKey,
  hideoutWorkshopOutputBonusPercent,
  hideoutWeaponPriority,
} from '../hideout.service.js';
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
  it('gates higher Lookouts levels on live turf ownership only in 0.7-C', () => {
    const level3 = player({ hideoutLookoutsLevel: 3 });
    const locked4 = hideoutCatalog(classicOgV07C, level3, {}, { turfBlocksHeld: 0 });
    const lookouts4 = locked4.rooms.find((room) => room.key === 'LOOKOUTS')!;
    expect(lookouts4.canUpgrade).toBe(false);
    expect(lookouts4.lockReason).toContain('Turf blocks held 0/1');

    const ready4 = hideoutCatalog(classicOgV07C, level3, {}, { turfBlocksHeld: 1 });
    expect(ready4.rooms.find((room) => room.key === 'LOOKOUTS')?.canUpgrade).toBe(true);

    const level4 = player({ hideoutLookoutsLevel: 4 });
    const locked5 = hideoutCatalog(classicOgV07C, level4, {}, { turfBlocksHeld: 2 });
    expect(locked5.rooms.find((room) => room.key === 'LOOKOUTS')?.lockReason)
      .toContain('Turf blocks held 2/3');

    const ready5 = hideoutCatalog(classicOgV07C, level4, {}, { turfBlocksHeld: 3 });
    expect(ready5.rooms.find((room) => room.key === 'LOOKOUTS')?.canUpgrade).toBe(true);

    // B never gained the turf gate.
    expect(hideoutCatalog(classicOgV07B, level3).rooms.find((room) => room.key === 'LOOKOUTS')?.canUpgrade)
      .toBe(true);
  });

  it('describes the new Lookouts warning behavior without activating a specialization', () => {
    const catalog = hideoutCatalog(classicOgV07C, player({ hideoutLookoutsLevel: 3 }), {}, { turfBlocksHeld: 1 });
    const lookouts = catalog.rooms.find((room) => room.key === 'LOOKOUTS')!;
    expect(lookouts.currentEffect).toContain('named recon warnings for 8h');
    expect(lookouts.currentEffect).toContain('home raid defense strength');
    expect(lookouts.specialization?.selectedKey).toBeNull();
  });

  it('separates Workshop output from ingredient efficiency in 0.7-D', () => {
    const p = player({ hideoutWorkshopLevel: 5 });
    expect(hideoutWorkshopOutputBonusPercent(classicOgV07D, p)).toBe(15);
    expect(hideoutWorkshopIngredientEfficiencyPercent(classicOgV07D, p)).toBe(8);
    expect(hideoutWorkshopIngredientCentsPerUnit(1_000, classicOgV07D, p)).toBe(920);

    // C retains the old output path and has no ingredient discount.
    expect(hideoutWorkshopOutputBonusPercent(classicOgV07C, p)).toBe(15);
    expect(hideoutWorkshopIngredientEfficiencyPercent(classicOgV07C, p)).toBe(0);

    const catalog = hideoutCatalog(classicOgV07D, p);
    expect(catalog.workshop).toMatchObject({
      level: 5,
      outputBonusPercent: 15,
      ingredientEfficiencyPercent: 8,
    });
    expect(catalog.workshop!.recipes.length).toBeGreaterThan(1);
    expect(catalog.workshop!.recipes.every((recipe) =>
      recipe.effectiveIngredientCentsPerUnit <= recipe.baseIngredientCentsPerUnit)).toBe(true);

    for (const recipe of catalog.workshop!.recipes) {
      const sellFloor = recipe.key === 'CRACK'
        ? classicOgV07D.stores.PIP.items.CRACK?.sellCents ?? 0
        : classicOgV07D.products?.[recipe.key]?.economy?.pip?.sellCents ?? 0;
      expect(recipe.effectiveIngredientCentsPerUnit * 100)
        .toBeGreaterThanOrEqual(sellFloor * (100 + catalog.workshop!.outputBonusPercent));
    }
  });

  it('ties the 0.7-D Garage to Low-Riders and keeps logistics modest', () => {
    const locked = hideoutCatalog(classicOgV07D, player({ lowRiders: 1, hideoutGarageLevel: 0 }));
    const garage = locked.rooms.find((room) => room.key === 'GARAGE')!;
    expect(garage.canUpgrade).toBe(false);
    expect(garage.lockReason).toContain('Low-Riders owned 1/2');

    const readyPlayer = player({ lowRiders: 2, hideoutGarageLevel: 0 });
    const ready = hideoutCatalog(classicOgV07D, readyPlayer);
    expect(ready.rooms.find((room) => room.key === 'GARAGE')?.canUpgrade).toBe(true);

    // Ownership includes cars currently away on active runs; the page/service supplies this live context.
    const oneHomeOneAway = hideoutCatalog(
      classicOgV07D,
      player({ lowRiders: 1, hideoutGarageLevel: 0 }),
      {},
      { lowRidersOwned: 2 },
    );
    expect(oneHomeOneAway.rooms.find((room) => room.key === 'GARAGE')?.canUpgrade).toBe(true);
    expect(hideoutGarageRunLimit(classicOgV07D, readyPlayer)).toBe(1);
    expect(hideoutGarageRelocationDiscountPercent(classicOgV07D, readyPlayer)).toBe(0);

    const built = player({ lowRiders: 2, hideoutGarageLevel: 1 });
    expect(hideoutGarageRunLimit(classicOgV07D, built)).toBe(2);
    expect(hideoutGarageRelocationDiscountPercent(classicOgV07D, built)).toBe(5);
    expect(hideoutCatalog(classicOgV07D, built).garage).toEqual({
      level: 1,
      runLimit: 2,
      relocationFeeDiscountPercent: 5,
    });
  });

  it('keeps Armory POWER as the default and caps F Infirmary savings at 15%', () => {
    const base = player({ hideoutWorkshopLevel: 5, hideoutWeaponPriority: 'POWER' });
    expect(hideoutWeaponPriority(classicOgV07F, base)).toBe('POWER');
    expect(hideoutMedicineEfficiencyPercent(classicOgV07F, base)).toBe(15);

    const conserve = player({ hideoutWorkshopLevel: 3, hideoutWeaponPriority: 'CONSERVE' });
    expect(hideoutWeaponPriority(classicOgV07F, conserve)).toBe('CONSERVE');
    expect(hideoutMedicineEfficiencyPercent(classicOgV07F, conserve)).toBe(5);

    // Earlier 0.7 slices do not opt into either F behavior.
    expect(hideoutWeaponPriority(classicOgV07D, conserve)).toBe('POWER');
    expect(hideoutMedicineEfficiencyPercent(classicOgV07D, conserve)).toBe(0);
  });

  it('activates bounded permanent specialization effects only in 0.7-G', () => {
    const vault = player({
      hideoutSafeRoomLevel: 3,
      hideoutSafeRoomSpecialization: 'VAULT',
    });
    expect(hideoutSpecializationKey(classicOgV07G, vault, 'SAFE_ROOM')).toBe('VAULT');
    expect(hideoutProtectedProductCapacity(classicOgV07G, vault)).toBe(75);
    expect(hideoutProtectedCashBonusCents(classicOgV07G, vault)).toBe(550_000);

    const defense = player({
      hideoutSafeRoomLevel: 3,
      hideoutLookoutsLevel: 5,
      hideoutSafeRoomSpecialization: 'PANIC_ROOM',
      hideoutLookoutsSpecialization: 'ARMED_WATCH',
    });
    expect(hideoutDefenseBonusPercent(classicOgV07G, defense)).toBe(20);

    const drugLab = player({
      hideoutWorkshopLevel: 5,
      hideoutWorkshopSpecialization: 'DRUG_LAB',
    });
    expect(hideoutWorkshopOutputBonusPercent(classicOgV07G, drugLab)).toBe(20);

    const garageFocus = player({
      hideoutGarageLevel: 1,
      hideoutWorkshopLevel: 3,
      hideoutWorkshopSpecialization: 'GARAGE',
    });
    expect(hideoutGarageRelocationDiscountPercent(classicOgV07G, garageFocus)).toBe(10);
    expect(hideoutGarageRunLimit(classicOgV07G, garageFocus)).toBe(2);

    const connections = player({
      hideoutBackOfficeLevel: 3,
      hideoutBackOfficeSpecialization: 'CONNECTIONS',
    });
    expect(hideoutBackOfficeBonusCents(10_000n, classicOgV07G, connections)).toBe(800n);

    // F exposes branch metadata but never activates strings from storage.
    expect(hideoutSpecializationKey(classicOgV07F, defense, 'LOOKOUTS')).toBeNull();
    expect(hideoutDefenseBonusPercent(classicOgV07F, defense)).toBe(10);
    expect(hideoutWorkshopOutputBonusPercent(classicOgV07F, drugLab)).toBe(15);
    expect(hideoutGarageRelocationDiscountPercent(classicOgV07F, garageFocus)).toBe(5);
    expect(hideoutBackOfficeBonusCents(10_000n, classicOgV07F, connections)).toBe(600n);
  });

  it('exposes the selected G branch in the room catalog', () => {
    const catalog = hideoutCatalog(classicOgV07G, player({
      hideoutSafeRoomLevel: 3,
      hideoutSafeRoomSpecialization: 'VAULT',
    }));
    const safeRoom = catalog.rooms.find((room) => room.key === 'SAFE_ROOM')!;
    expect(safeRoom.specialization?.selectedKey).toBe('VAULT');
    expect(safeRoom.specialization?.choices.find((choice) => choice.key === 'VAULT')?.blurb)
      .toContain('$2,500');
  });


});
