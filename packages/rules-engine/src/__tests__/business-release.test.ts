import { describe, expect, it } from 'vitest';
import { classicOgV11F, type Ruleset } from '@streets/rulesets';
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
    expect(heavy.crackdownCostCents).toBeGreaterThan(0);
    expect(mixed.requestedCrackdownHeat).toBe(mixed.frontOnlyCrackdownHeat);
    expect(mixed.crackdownCostCents).toBe(0);
  });

  it('makes a harsher F racket surcharge reduce the affected profile end value', () => {
    const baseline = runBusinessReleaseSimulation(classicOgV11F);
    const harsher = {
      ...classicOgV11F,
      business: {
        ...classicOgV11F.business,
        crackdown: { activeRacketHeatPerBusiness: 16 },
      },
    } as unknown as Ruleset;
    const punished = runBusinessReleaseSimulation(harsher);

    const baselineHeavy = baseline.find((row) => row.key === 'BUSINESS_HEAVY')!;
    const punishedHeavy = punished.find((row) => row.key === 'BUSINESS_HEAVY')!;
    const punishedMixed = punished.find((row) => row.key === 'MIXED')!;

    expect(punishedHeavy.racketCrackdownHeat).toBeGreaterThan(baselineHeavy.racketCrackdownHeat);
    expect(punishedHeavy.crackdownCostCents).toBeGreaterThan(baselineHeavy.crackdownCostCents);
    expect(punishedHeavy.endValueCents).toBeLessThan(baselineHeavy.endValueCents);
    expect(punishedMixed.racketCrackdownHeat).toBe(0);
    expect(punishedMixed.crackdownCostCents).toBe(0);
  });
});
