import { describe, expect, it } from 'vitest';
import { classicOgV15A, classicOgV15B } from '@streets/rulesets';
import { runCapacity, vehicleLoadoutSeats, vehicleRiskMultiplier } from '../calculations/runs.js';
import { bustChance } from '../calculations/heat.js';

describe('vehicle loadout calculations', () => {
  it('keeps historic numeric Low-Rider capacity while applying B class capacities', () => {
    const base = classicOgV15A.travel!.cargoPerLowRider;
    expect(runCapacity(classicOgV15A, 2)).toBe(base * 2);
    expect(runCapacity(classicOgV15B, { LOW_RIDER: 1, SEDAN: 1, VAN: 1 })).toBe(Math.floor(base * 3.15));
    expect(vehicleLoadoutSeats(classicOgV15B, { LOW_RIDER: 1, SEDAN: 1, VAN: 1 })).toBe(classicOgV15B.lowRiderThugCapacity * 2 + 4);
  });

  it('keeps A’s Low-Rider route risk normal and preserves each class tradeoff in B', () => {
    expect(vehicleRiskMultiplier(classicOgV15A, { LOW_RIDER: 1 })).toBe(1);
    expect(vehicleRiskMultiplier(classicOgV15B, { SEDAN: 1 })).toBe(0.9);
    expect(vehicleRiskMultiplier(classicOgV15B, { VAN: 1 })).toBe(1.15);
    const heat = classicOgV15B.heat!.max;
    const normal = bustChance(heat, classicOgV15B);
    expect(bustChance(heat, classicOgV15B, vehicleRiskMultiplier(classicOgV15B, { SEDAN: 1 }))).toBeLessThan(normal);
    expect(bustChance(heat, classicOgV15B, vehicleRiskMultiplier(classicOgV15B, { VAN: 1 }))).toBeGreaterThan(normal);
  });
});
