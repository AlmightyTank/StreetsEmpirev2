import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import {
  calculateConsumption,
  calculateDepartures,
  calculateIncome,
  type UpkeepInput,
} from '../calculations/upkeep.js';
import { flatRng } from '../rng.js';

function crew(overrides: Partial<UpkeepInput> = {}): UpkeepInput {
  return {
    whores: 73,
    thugs: 42,
    condoms: 4_812,
    crack: 1_221,
    beer: 108,
    whoreHappiness: 100,
    thugHappiness: 100,
    payoutPercent: 50,
    ...overrides,
  };
}

describe('calculateConsumption', () => {
  /**
   * Condoms and beer are section 27's own figures for 73 whores and 42 thugs
   * over 10 turns. Crack deliberately is not: section 27 implies 0.01 per
   * whore per turn, which leaves a stable burning almost nothing and Produce
   * Crack with no bill to replace. See production.ts.
   */
  it('matches the section 27 condom and beer figures', () => {
    expect(calculateConsumption(crew(), 10, classicOgV01)).toEqual({
      condoms: 73,
      crack: 36,
      beer: 8,
    });
  });

  it('scales with turns', () => {
    expect(calculateConsumption(crew(), 20, classicOgV01)).toEqual({
      condoms: 146,
      crack: 73,
      beer: 16,
    });
  });

  it('never takes more than is on the shelf', () => {
    const broke = crew({ condoms: 10, crack: 2, beer: 0 });
    expect(calculateConsumption(broke, 10, classicOgV01)).toEqual({
      condoms: 10,
      crack: 2,
      beer: 0,
    });
  });

  it('costs nothing with nobody to supply', () => {
    expect(calculateConsumption(crew({ whores: 0, thugs: 0 }), 50, classicOgV01)).toEqual({
      condoms: 0,
      crack: 0,
      beer: 0,
    });
  });
});

describe('calculateIncome', () => {
  it('splits gross by the payout', () => {
    // 10 whores * $15 * 10 turns = $1,500 gross at full happiness.
    const income = calculateIncome(
      crew({ whores: 10, payoutPercent: 50 }),
      10,
      classicOgV01,
    );

    expect(income.grossCents).toBe(150_000n);
    expect(income.pimpCents).toBe(75_000n);
  });

  it('hands the pimp more of the pot as the cut falls', () => {
    const stingy = calculateIncome(
      crew({ whores: 10, payoutPercent: 20 }),
      10,
      classicOgV01,
    );
    expect(stingy.pimpCents).toBe(120_000n);
  });

  /**
   * The payout tension. A 1% cut wrecks happiness, and income scales straight
   * off happiness, so squeezing gives a bigger share of a smaller pot.
   */
  it('shrinks the pot as happiness falls', () => {
    const gross = (whoreHappiness: number) =>
      calculateIncome(crew({ whores: 10, whoreHappiness }), 10, classicOgV01).grossCents;

    expect(gross(100)).toBe(150_000n);
    expect(gross(50)).toBe(75_000n);
    expect(gross(0)).toBe(0n);
  });

  it('applies the district multiplier', () => {
    const casino = calculateIncome(
      crew({ whores: 10 }),
      10,
      classicOgV01,
      classicOgV01.scouting.districts.CASINO.incomeMultiplier,
    );
    expect(casino.grossCents).toBe(375_000n); // 2.5x
  });

  it('earns nothing with no whores', () => {
    const income = calculateIncome(crew({ whores: 0 }), 10, classicOgV01);
    expect(income).toEqual({ grossCents: 0n, pimpCents: 0n });
  });
});

describe('calculateDepartures', () => {
  it('keeps everybody at or above the threshold', () => {
    const content = crew({ whoreHappiness: 40, thugHappiness: 40 });
    expect(calculateDepartures(content, classicOgV01, flatRng)).toEqual({
      whores: 0,
      thugs: 0,
    });
  });

  it('loses the full fraction at zero happiness', () => {
    // 100 whores, 10% per action at full severity.
    const miserable = crew({ whores: 100, thugs: 100, whoreHappiness: 0, thugHappiness: 0 });
    expect(calculateDepartures(miserable, classicOgV01, flatRng)).toEqual({
      whores: 10,
      thugs: 10,
    });
  });

  it('scales with how far below the threshold happiness sits', () => {
    // Happiness 20 is halfway down from the threshold of 40, so half of 10%.
    const unhappy = crew({ whores: 100, thugs: 100, whoreHappiness: 20, thugHappiness: 20 });
    expect(calculateDepartures(unhappy, classicOgV01, flatRng)).toEqual({
      whores: 5,
      thugs: 5,
    });
  });

  it('treats whores and thugs independently', () => {
    const lopsided = crew({
      whores: 100,
      thugs: 100,
      whoreHappiness: 0,
      thugHappiness: 100,
    });
    expect(calculateDepartures(lopsided, classicOgV01, flatRng)).toEqual({
      whores: 10,
      thugs: 0,
    });
  });

  it('cannot lose more than are there', () => {
    const tiny = crew({ whores: 1, thugs: 0, whoreHappiness: 0, thugHappiness: 0 });
    const result = calculateDepartures(tiny, classicOgV01, flatRng);
    expect(result.whores).toBeLessThanOrEqual(1);
    expect(result.thugs).toBe(0);
  });
});
