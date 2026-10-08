import { describe, expect, it } from 'vitest';
import { classicOgV15B, classicOgV15C } from '@streets/rulesets';
import { clampVehicleDamage, markRunVehicles, noVehicleDamage, vehicleServiceCents } from '../calculations/runs.js';
import { calculateNetWorthCents } from '../calculations/net-worth.js';

const fleet = { LOW_RIDER: 1, SEDAN: 1, VAN: 1 };

describe('1.5.0-C vehicle condition', () => {
  it('damages the most visible running vehicle first and never a car twice', () => {
    let damage = markRunVehicles(classicOgV15C, fleet, noVehicleDamage(), 'damaged', 1);
    expect(damage.damaged).toEqual({ LOW_RIDER: 0, SEDAN: 0, VAN: 1 });
    damage = markRunVehicles(classicOgV15C, fleet, damage, 'damaged', 5);
    expect(damage.damaged).toEqual({ LOW_RIDER: 1, SEDAN: 1, VAN: 1 });
    expect(damage.disabled).toEqual({ LOW_RIDER: 0, SEDAN: 0, VAN: 0 });
  });

  it('disables a running car before a damaged one, and turns damage into disabled when nothing else runs', () => {
    const vanDamaged = markRunVehicles(classicOgV15C, { LOW_RIDER: 1, SEDAN: 0, VAN: 1 }, noVehicleDamage(), 'damaged', 1);
    const arrested = markRunVehicles(classicOgV15C, { LOW_RIDER: 1, SEDAN: 0, VAN: 1 }, vanDamaged, 'disabled', 1);
    expect(arrested).toEqual({ damaged: { LOW_RIDER: 0, SEDAN: 0, VAN: 1 }, disabled: { LOW_RIDER: 1, SEDAN: 0, VAN: 0 } });
    const again = markRunVehicles(classicOgV15C, { LOW_RIDER: 1, SEDAN: 0, VAN: 1 }, arrested, 'disabled', 1);
    expect(again).toEqual({ damaged: { LOW_RIDER: 0, SEDAN: 0, VAN: 0 }, disabled: { LOW_RIDER: 1, SEDAN: 0, VAN: 1 } });
    // Nothing left to hit: unchanged.
    expect(markRunVehicles(classicOgV15C, { LOW_RIDER: 1, SEDAN: 0, VAN: 1 }, again, 'disabled', 1)).toEqual(again);
  });

  it('keeps a damage record inside a loadout that lost cars', () => {
    const damage = { damaged: { LOW_RIDER: 2, SEDAN: 0, VAN: 0 }, disabled: { LOW_RIDER: 1, SEDAN: 0, VAN: 0 } };
    expect(clampVehicleDamage({ LOW_RIDER: 2, SEDAN: 0, VAN: 0 }, damage)).toEqual({
      damaged: { LOW_RIDER: 1, SEDAN: 0, VAN: 0 },
      disabled: { LOW_RIDER: 1, SEDAN: 0, VAN: 0 },
    });
  });

  it('prices service per vehicle and has no service before C', () => {
    expect(vehicleServiceCents(classicOgV15C, 'VAN', 'REPAIR', 2)).toBe(250_000n);
    expect(vehicleServiceCents(classicOgV15C, 'SEDAN', 'RECOVER', 1)).toBe(140_000n);
    expect(vehicleServiceCents(classicOgV15B, 'VAN', 'REPAIR', 1)).toBeNull();
  });

  it('keeps a vehicle in the garage on the books at the same value', () => {
    const base = { cashCents: 0, whores: 0, thugs: 0, lowRiders: 1, sedans: 0, vans: 0, medicine: 0, crack: 0, condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
    const ready = calculateNetWorthCents({ ...base, vans: 1 }, classicOgV15C);
    expect(calculateNetWorthCents({ ...base, damagedVans: 1 }, classicOgV15C)).toBe(ready);
    expect(calculateNetWorthCents({ ...base, disabledVans: 1 }, classicOgV15C)).toBe(ready);
  });
});
