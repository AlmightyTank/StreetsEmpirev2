import { describe, expect, it } from 'vitest';
import { classicOgV23A, classicOgV24A, classicOgV24B, classicOgV24C, classicOgV24D, classicOgV24E, classicOgV24F, classicOgV25A } from '../index.js';
import { territoryCatalogForRuleset } from '../territory-perks.js';

describe('ammo and vehicle parts foundation', () => {
  it('keeps the catalog absent from historical rulesets and disabled in the new foundation ruleset', () => {
    expect('ammoParts' in classicOgV23A).toBe(false);
    expect('ammoParts' in classicOgV24A).toBe(false);
    expect(classicOgV24B.ammoParts?.enabled).toBe(false);
    expect(classicOgV24B.ammoParts?.catalogVersion).toBe('ammo-parts-v1');
  });

  it('pins the roadmap values in the versioned catalog', () => {
    expect(classicOgV24B.ammoParts?.ammo).toMatchObject({
      costPerRoundCents: 30,
      roundsPerFight: { PISTOL: 12, SHOTGUN: 30, TEK9: 90, AK47: 180 },
      defenderFloor: 10,
      lootShareBps: 1_500,
      sellbackBps: 2_500,
      storeStockCap: 25_000,
      packs: [
        { key: 'box', rounds: 100, priceCents: 4_000 },
        { key: 'case', rounds: 1_000, priceCents: 30_000 },
        { key: 'crate', rounds: 10_000, priceCents: 250_000 },
      ],
    });
    expect(classicOgV24B.ammoParts?.vehicleParts).toMatchObject({
      storeStockCap: 2_000,
      packs: [
        { key: 'box', parts: 10, priceCents: 10_000 },
        { key: 'crate', parts: 100, priceCents: 80_000 },
        { key: 'pallet', parts: 1_000, priceCents: 700_000 },
      ],
      repairs: {
        SEDAN: { damagedParts: 5, damagedCashCents: 25_000, disabledParts: 20, disabledCashCents: 70_000 },
        LOW_RIDER: { damagedParts: 10, damagedCashCents: 40_000, disabledParts: 40, disabledCashCents: 100_000 },
        VAN: { damagedParts: 20, damagedCashCents: 70_000, disabledParts: 80, disabledCashCents: 170_000 },
      },
    });
  });

  it('enables ammo stores in the next version and leaves parts packs for the garage slice', () => {
    expect(classicOgV24C.ammoParts?.enabled).toBe(true);
    expect(classicOgV24C.stores.TOMMY.items).toMatchObject({
      AMMO_BOX: { field: 'ammo', unitsPerOrder: 100, buyCents: 4_000, sellCents: 1_000 },
      AMMO_CASE: { field: 'ammo', unitsPerOrder: 1_000, buyCents: 30_000, sellCents: 7_500 },
      AMMO_CRATE: { field: 'ammo', unitsPerOrder: 10_000, buyCents: 250_000, sellCents: 62_500 },
    });
    expect(classicOgV24C.stores.CHARLIE.items).not.toHaveProperty('PARTS_BOX');
    expect('combatEnabled' in classicOgV24C.ammoParts!).toBe(false);
    expect(classicOgV24D.ammoParts?.combatEnabled).toBe(true);
    expect(classicOgV24D.meta.version).toBe('2.4.0-D');
  });

  it('enables parts service, Charlie packs, and the per-vehicle launch fees only in 2.4.0-E', () => {
    expect(classicOgV24D.vehicleCatalog?.classes.every((vehicle) => !('runFeeCents' in vehicle))).toBe(true);
    expect('enabled' in classicOgV24D.ammoParts!.vehicleParts).toBe(false);
    expect(classicOgV24E.ammoParts?.vehicleParts).toMatchObject({
      enabled: true,
      cashOnlyMultiplierBps: 15_000,
      cashOnlyServiceTurnsPerVehicle: 1,
      scrapYieldParts: { SEDAN: 10, LOW_RIDER: 15, VAN: 30 },
    });
    expect(classicOgV24E.vehicleCatalog?.classes.map(({ id, runFeeCents }) => [id, runFeeCents])).toEqual([
      ['LOW_RIDER', 6_500], ['SEDAN', 3_500], ['VAN', 13_000],
    ]);
    expect(classicOgV24E.stores.CHARLIE.items).toMatchObject({
      PARTS_BOX: { field: 'vehicleParts', unitsPerOrder: 10, buyCents: 10_000, restock: { cap: 2_000, perInterval: 2_000 } },
      PARTS_CRATE: { field: 'vehicleParts', unitsPerOrder: 100, buyCents: 80_000 },
      PARTS_PALLET: { field: 'vehicleParts', unitsPerOrder: 1_000, buyCents: 700_000 },
    });
  });

  it('enables territory ammo/parts yields, in-kind tolls, low-ammo notices, and rollout only in F', () => {
    expect(classicOgV24F.ammoParts).toMatchObject({ lowAmmoNotificationsEnabled: true, territoryYieldsEnabled: true });
    const earlier = territoryCatalogForRuleset(classicOgV24E);
    const f = territoryCatalogForRuleset(classicOgV24F)!;
    expect(earlier?.yieldProfiles[f.cities.chicago!.yieldProfileKey]?.goodsPerHour).not.toHaveProperty('AMMO');
    expect(f.yieldProfiles[f.cities.chicago!.yieldProfileKey]?.goodsPerHour).toHaveProperty('AMMO', 150);
    expect(f.yieldProfiles[f.cities.detroit!.yieldProfileKey]?.goodsPerHour).toHaveProperty('VEHICLE_PARTS', 1);
    expect(f.cities.chicago!.access).toMatchObject({ accessType: 'toll', tollAmmoPerUse: 20, dailyTollCapAmmo: 100 });
    expect(f.cities.detroit!.access).toMatchObject({ tollVehiclePartsPerUse: 2, dailyTollCapVehicleParts: 10 });
  });

  it('gives the current individual-armory round starter both ammo and vehicle parts', () => {
    expect(classicOgV25A.round.startingPlayer).toMatchObject({ ammo: 100, vehicleParts: 50 });
  });
});
