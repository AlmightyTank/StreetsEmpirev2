import { describe, expect, it } from 'vitest';
import { readVehicleLoadout, trimVehicleLoadout } from '../vehicle-fleet.service.js';

describe('vehicle fleet persistence helpers', () => {
  it('reads older run rows as Low-Riders and restores a valid mixed loadout', () => {
    expect(readVehicleLoadout(null, 3)).toEqual({ LOW_RIDER: 3, SEDAN: 0, VAN: 0 });
    expect(readVehicleLoadout({ LOW_RIDER: 1, SEDAN: 2, VAN: 1 }, 4)).toEqual({ LOW_RIDER: 1, SEDAN: 2, VAN: 1 });
  });

  it('removes damaged or lost vehicles in a deterministic order', () => {
    expect(trimVehicleLoadout({ LOW_RIDER: 1, SEDAN: 2, VAN: 1 }, 2)).toEqual({ LOW_RIDER: 0, SEDAN: 1, VAN: 1 });
  });
});
