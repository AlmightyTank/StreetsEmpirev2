import { describe, expect, it } from 'vitest';
import { classicOgV11F } from '@streets/rulesets';
import { businessReleaseGate, runBusinessReleaseSimulation } from '../simulations/business-release.js';

describe('1.1.0-F business release scenarios', () => {
  it('keeps mixed play ahead of business-heavy play and makes the Fed warning actionable', () => {
    const rows = runBusinessReleaseSimulation(classicOgV11F);
    expect(rows.map((row) => row.key)).toEqual(['BUSINESS_HEAVY', 'TURF_RAIDER', 'RUNNER', 'MIXED']);
    expect(businessReleaseGate(classicOgV11F, rows)).toEqual([]);

    const heavy = rows.find((row) => row.key === 'BUSINESS_HEAVY')!;
    const mixed = rows.find((row) => row.key === 'MIXED')!;
    expect(mixed.endValueCents).toBeGreaterThan(heavy.endValueCents);
    expect(heavy.requestedCrackdownHeat).toBeGreaterThan(heavy.frontOnlyCrackdownHeat);
    expect(mixed.requestedCrackdownHeat).toBe(mixed.frontOnlyCrackdownHeat);
  });
});
