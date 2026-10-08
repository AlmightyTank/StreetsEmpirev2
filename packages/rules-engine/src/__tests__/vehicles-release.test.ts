import { describe, expect, it } from 'vitest';
import { classicOgV14G, classicOgV15A, classicOgV15B, classicOgV15E } from '@streets/rulesets';
import { routeProfileRisk, runCapacity, vehicleRiskMultiplier } from '../calculations/runs.js';
import { classGaps, runVehicleSimulation, vehicleGate, vehicleMarkdown, VEHICLE_CLASSES } from '../simulations/vehicles.js';

describe('1.5.0-E vehicles release', () => {
  it('reads route-profile risk from the ruleset, with 1.5.0-B numbers as the default', () => {
    expect(routeProfileRisk(classicOgV15B, 'LOW_PROFILE')).toBe(0.9);
    expect(routeProfileRisk(classicOgV15B, 'HIGH_VISIBILITY')).toBe(1.15);
    expect(routeProfileRisk(classicOgV15E, 'LOW_PROFILE')).toBe(0.95);
    expect(vehicleRiskMultiplier(classicOgV15B, { SEDAN: 1 })).toBe(0.9);
    expect(vehicleRiskMultiplier(classicOgV15E, { SEDAN: 1 })).toBe(0.95);
  });

  it('keeps every historical round on its own vehicle rules', () => {
    expect('vehicleCatalog' in classicOgV14G).toBe(false);
    expect(vehicleRiskMultiplier(classicOgV14G, { LOW_RIDER: 3 })).toBe(1);
    for (const ruleset of [classicOgV15A, classicOgV15E]) {
      expect(runCapacity(ruleset, 4)).toBe(runCapacity(classicOgV14G, 4));
      expect(runCapacity(ruleset, { LOW_RIDER: 4 })).toBe(runCapacity(classicOgV14G, 4));
      expect(vehicleRiskMultiplier(ruleset, { LOW_RIDER: 4 })).toBe(1);
    }
  });

  it('passes the vehicle release gate: every class a reasonable pick somewhere, none a must-have', () => {
    const result = runVehicleSimulation(classicOgV15E, 800);
    expect(vehicleGate(classicOgV15E, result)).toEqual([]);
    for (const classId of VEHICLE_CLASSES) {
      expect(Math.min(...result.scenarios.map((entry) => classGaps(entry)[classId]))).toBeLessThanOrEqual(0.03);
    }
    expect(vehicleMarkdown(classicOgV15E, result)).toContain('## Hot road');
  });
});
