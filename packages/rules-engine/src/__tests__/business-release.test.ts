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
    expect(mixed.requestedCrackdownHeat).toBe(mixed.frontOnlyCrackdownHeat);
    expect(mixed.racketCrackdownHeat).toBe(0);
    expect(mixed.crackdownCostCents).toBe(0);
    expect(mixed.racketPauseDays).toBe(1);
  });

  it('keeps away-business operating costs full while discounting away output', () => {
    const baseline = runBusinessReleaseSimulation(classicOgV11F);
    const noAwayOutput = {
      ...classicOgV11F,
      business: {
        ...classicOgV11F.business,
        awayOutputShare: 0,
      },
    } as unknown as Ruleset;
    const reduced = runBusinessReleaseSimulation(noAwayOutput);

    const baselineRunner = baseline.find((row) => row.key === 'RUNNER')!;
    const reducedRunner = reduced.find((row) => row.key === 'RUNNER')!;
    const baselineHeavy = baseline.find((row) => row.key === 'BUSINESS_HEAVY')!;
    const reducedHeavy = reduced.find((row) => row.key === 'BUSINESS_HEAVY')!;

    expect(reducedRunner.frontIncomeCents).toBeLessThan(baselineRunner.frontIncomeCents);
    expect(reducedRunner.racketValueCents).toBeLessThan(baselineRunner.racketValueCents);
    expect(reducedRunner.operatingCostCents).toBe(baselineRunner.operatingCostCents);
    expect(reducedHeavy.businessValueCents).toBe(baselineHeavy.businessValueCents);
  });

  it('caps the F surcharge at the Heat the live sweep can actually add', () => {
    const rows = runBusinessReleaseSimulation(classicOgV11F);
    const heavy = rows.find((row) => row.key === 'BUSINESS_HEAVY')!;
    const heat = classicOgV11F.heat!;
    const requestedRacketHeat = heavy.requestedCrackdownHeat - heavy.frontOnlyCrackdownHeat;
    const roomAfterFront = Math.max(
      0,
      heat.max - Math.min(heat.max, heavy.preSweepHeat + heavy.frontOnlyCrackdownHeat),
    );

    expect(heavy.racketCrackdownHeat).toBe(Math.min(requestedRacketHeat, roomAfterFront));
    expect(heavy.preSweepHeat + heavy.frontOnlyCrackdownHeat + heavy.racketCrackdownHeat)
      .toBeGreaterThanOrEqual(heavy.preSweepHeat);
    expect(heavy.racketCrackdownHeat).toBeLessThanOrEqual(requestedRacketHeat);
  });

  it('makes a harsher F surcharge reduce end value when the Heat cap has room', () => {
    const roomy = {
      ...classicOgV11F,
      heat: {
        ...classicOgV11F.heat!,
        max: 10_000,
      },
    } as unknown as Ruleset;
    const harsher = {
      ...roomy,
      business: {
        ...roomy.business!,
        crackdown: { activeRacketHeatPerBusiness: 16 },
      },
    } as unknown as Ruleset;

    const baseline = runBusinessReleaseSimulation(roomy);
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
