import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import { assertPlayerState, type InvariantPlayerState } from '../invariant.service.js';

function valid(): InvariantPlayerState {
  return {
    cashCents: 500_000n,
    turns: 100,
    payoutPercent: 50,
    whores: 10,
    thugs: 10,
    woundedThugs: 0,
    condoms: 100,
    medicine: 10,
    crack: 100,
    beer: 100,
    pistols: 1,
    shotguns: 0,
    tek9s: 0,
    ak47s: 0,
    lowRiders: 0,
    cleanShiftStreak: 3,
    rocksSuppliedToPip: 0,
    driveBysDone: 0,
    condomsBought: 0,
    medicineBought: 0,
    beerBought: 0,
    pistolsBought: 0,
    raidsDone: 0,
    hideoutSafeRoomLevel: 0,
    hideoutLookoutsLevel: 0,
    hideoutWorkshopLevel: 0,
    hideoutBackOfficeLevel: 0,
    pistolStock: 0,
    shotgunStock: 5,
    tek9Stock: 3,
    ak47Stock: 2,
    lowRiderStock: 3,
    condomStock: 2_000,
    medicineStock: 500,
    beerStock: 5_000,
    crackStock: 500,
    thugStock: 5,
  };
}

describe('assertPlayerState', () => {
  it('rejects a weapon shelf above the ruleset cap', () => {
    const cap = classicOgV01.weapons.AK47.restock!.cap;
    expect(() => assertPlayerState({ ...valid(), ak47Stock: cap + 1 }, classicOgV01)).toThrow(
      /ak47Stock is above the ruleset cap/,
    );
  });

  it('accepts a valid player state', () => {
    expect(() => assertPlayerState(valid(), classicOgV01)).not.toThrow();
  });

  it.each(['turns', 'whores', 'thugs', 'condoms', 'crack', 'beer'] as const)(
    'rejects negative %s',
    (field) => {
      expect(() => assertPlayerState({ ...valid(), [field]: -1 }, classicOgV01)).toThrow(/invariant failed/i);
    },
  );

  it('rejects fractional inventory and negative cash', () => {
    expect(() => assertPlayerState({ ...valid(), crack: 1.5 }, classicOgV01)).toThrow();
    expect(() => assertPlayerState({ ...valid(), cashCents: -1n }, classicOgV01)).toThrow();
  });

  it('rejects wounded thugs above the owned crew', () => {
    expect(() => assertPlayerState({ ...valid(), woundedThugs: 11 }, classicOgV01)).toThrow(/woundedThugs cannot exceed total thugs/);
  });

  it('rejects a payout outside the ruleset', () => {
    expect(() => assertPlayerState({ ...valid(), payoutPercent: 0 }, classicOgV01)).toThrow();
    expect(() =>
      assertPlayerState(
        { ...valid(), payoutPercent: classicOgV01.economy.payout.max + 1 },
        classicOgV01,
      ),
    ).toThrow();
  });
});
