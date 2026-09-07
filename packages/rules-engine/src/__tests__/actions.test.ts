import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import {
  calculateProduce,
  calculateScout,
  expectedRecruitsPerTurn,
  recruitmentMultiplier,
} from '../calculations/actions.js';
import type { UpkeepInput } from '../calculations/upkeep.js';
import { flatRng, type Rng } from '../rng.js';

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

/** Feeds a fixed sequence, then repeats the last value. */
function sequence(...values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0.5;
}

describe('calculateScout', () => {
  // Section 27: ten turns in the Nightclub District brings back 11 whores
  // and 4 thugs on an average roll. Those are the headline rates, which only
  // a crew small enough to escape diminishing returns actually gets.
  it('matches the section 27 recruitment for a nobody on an average roll', () => {
    const result = calculateScout({
      player: crew({ whores: 0, thugs: 0 }),
      turns: 10,
      ruleset: classicOgV01,
      district: 'NIGHTCLUB',
      rng: flatRng,
    });

    expect(result.whoresRecruited).toBe(11);
    expect(result.thugsRecruited).toBe(4);
    expect(result.turnsSpent).toBe(10);
    expect(result.district).toBe('NIGHTCLUB');
  });

  it('pays the same upkeep as any other action', () => {
    const result = calculateScout({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      district: 'NIGHTCLUB',
      rng: flatRng,
    });

    expect(result.consumption).toEqual({ condoms: 73, crack: 36, beer: 8 });
  });

  it('trades recruitment against money by district', () => {
    const run = (district: 'CASINO' | 'WINO_SLUMS') =>
      calculateScout({
        player: crew({ whores: 10 }),
        turns: 10,
        ruleset: classicOgV01,
        district,
        rng: flatRng,
      });

    const casino = run('CASINO');
    const slums = run('WINO_SLUMS');

    expect(casino.whoresRecruited).toBeLessThan(slums.whoresRecruited);
    expect(casino.income.grossCents).toBeGreaterThan(slums.income.grossCents);
  });

  it('can come back with a haul or with nothing', () => {
    // First roll is the variance, second is the fractional rounding. The
    // second is pinned high here so only the spread is under test.
    const roll = (variance: number) =>
      calculateScout({
        player: crew({ whores: 0, thugs: 0 }),
        turns: 10,
        ruleset: classicOgV01,
        district: 'NIGHTCLUB',
        rng: sequence(variance, 0.99),
      }).whoresRecruited;

    // variance 0.35 on 11.0 gives 14.85 at best and 7.15 at worst.
    expect(roll(1)).toBe(14);
    expect(roll(0)).toBe(7);
  });

  it('rounds fractional recruits stochastically rather than to nothing', () => {
    // 0.6 whores/turn for one turn in the Casino is 0.6 of a whore.
    const lucky = calculateScout({
      player: crew({ whores: 0, thugs: 0 }),
      turns: 1,
      ruleset: classicOgV01,
      district: 'CASINO',
      rng: sequence(0.5, 0.1),
    });
    const unlucky = calculateScout({
      player: crew({ whores: 0, thugs: 0 }),
      turns: 1,
      ruleset: classicOgV01,
      district: 'CASINO',
      rng: sequence(0.5, 0.9),
    });

    expect(lucky.whoresRecruited).toBe(1);
    expect(unlucky.whoresRecruited).toBe(0);
  });

  it('applies the city scout modifier', () => {
    const boosted = calculateScout({
      player: crew({ whores: 0, thugs: 0 }),
      turns: 10,
      ruleset: classicOgV01,
      district: 'NIGHTCLUB',
      city: { scoutModifier: 2, incomeModifier: 1, crackModifier: 1 },
      rng: flatRng,
    });

    expect(boosted.whoresRecruited).toBe(22);
  });

  it('never recruits a negative number', () => {
    const result = calculateScout({
      player: crew({ whores: 0, thugs: 0 }),
      turns: 1,
      ruleset: classicOgV01,
      district: 'CASINO',
      rng: sequence(0, 0.99),
    });
    expect(result.whoresRecruited).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateProduce', () => {
  // Section 30: 42 thugs at full happiness over 10 turns.
  it('matches the section 30 batch on an average roll', () => {
    const result = calculateProduce({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
    });

    expect(result.crackProduced).toBe(210);
  });

  it('scales output with thug happiness', () => {
    const batch = (thugHappiness: number) =>
      calculateProduce({
        player: crew({ thugHappiness }),
        turns: 10,
        ruleset: classicOgV01,
        rng: flatRng,
      }).crackProduced;

    expect(batch(100)).toBe(210);
    // floor 0.25: an utterly miserable crew still cooks a quarter batch.
    expect(batch(0)).toBe(52);
    expect(batch(50)).toBeLessThan(batch(100));
    expect(batch(50)).toBeGreaterThan(batch(0));
  });

  it('produces nothing without thugs', () => {
    const result = calculateProduce({
      player: crew({ thugs: 0 }),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
    });
    expect(result.crackProduced).toBe(0);
  });

  /**
   * Cooking means the pimp is indoors, so the girls work an unsupervised
   * shift: a quarter of what a district pays. This is what stops Produce from
   * being a strictly worse Scout that happens to also make crack.
   */
  it('earns the unsupervised rate rather than a district rate', () => {
    const cooking = calculateProduce({
      player: crew({ whores: 10 }),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
    });

    // 10 whores * $15 * 10 turns = $1,500 a full shift, a quarter of it here.
    expect(cooking.income.grossCents).toBe(37_500n);
    expect(cooking.consumption.condoms).toBe(10);
  });

  it('earns less than working even the poorest district', () => {
    const player = crew({ whores: 50 });

    const cooking = calculateProduce({ player, turns: 10, ruleset: classicOgV01, rng: flatRng });
    const slums = calculateScout({
      player,
      turns: 10,
      ruleset: classicOgV01,
      district: 'WINO_SLUMS',
      rng: flatRng,
    });

    expect(cooking.income.grossCents).toBeLessThan(slums.income.grossCents);
  });

  it('applies the city crack modifier', () => {
    const result = calculateProduce({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      city: { scoutModifier: 1, incomeModifier: 1, crackModifier: 0.5 },
      rng: flatRng,
    });
    expect(result.crackProduced).toBe(105);
  });
});

describe('diminishing returns on recruitment', () => {
  const caps = classicOgV01.scouting.recruitment;

  it('is full rate for a nobody and half at the soft cap', () => {
    expect(recruitmentMultiplier(0, caps.whoreSoftCap)).toBe(1);
    expect(recruitmentMultiplier(caps.whoreSoftCap, caps.whoreSoftCap)).toBe(0.5);
    expect(recruitmentMultiplier(caps.whoreSoftCap * 3, caps.whoreSoftCap)).toBe(0.25);
  });

  it('never reaches zero, so growth slows without ever stopping', () => {
    const huge = recruitmentMultiplier(1_000_000, caps.whoreSoftCap);
    expect(huge).toBeGreaterThan(0);
    expect(huge).toBeLessThan(0.001);
  });

  it('measures whores and thugs against their own crews', () => {
    const expected = expectedRecruitsPerTurn(
      classicOgV01.scouting.districts.NIGHTCLUB,
      { whores: caps.whoreSoftCap, thugs: 0 },
      classicOgV01,
    );

    // Whores halved, thugs untouched.
    expect(expected.whores).toBeCloseTo(1.1 / 2, 5);
    expect(expected.thugs).toBeCloseTo(0.4, 5);
  });

  it('cuts a big operation to a fraction of a small one', () => {
    const run = (whores: number) =>
      calculateScout({
        player: crew({ whores, thugs: 0 }),
        turns: 100,
        ruleset: classicOgV01,
        district: 'WINO_SLUMS',
        rng: flatRng,
      }).whoresRecruited;

    const small = run(0);
    const big = run(caps.whoreSoftCap * 9); // multiplier 0.1

    expect(small).toBe(180);
    expect(big).toBe(18);
  });

  /**
   * The arc this is for: recruiting is worth more than money while you are
   * small, and money is worth more than recruiting once you are not.
   */
  it('flips the best district as the crew grows', () => {
    const value = (whores: number, district: 'WINO_SLUMS' | 'CASINO') => {
      const result = calculateScout({
        player: crew({ whores, thugs: 20, whoreHappiness: 100, payoutPercent: 50 }),
        turns: 10,
        ruleset: classicOgV01,
        district,
        rng: flatRng,
      });
      return (
        Number(result.income.pimpCents) +
        result.whoresRecruited * classicOgV01.economy.netWorth.perWhoreCents
      );
    };

    // Small: the slums are worth more than the casino.
    expect(value(10, 'WINO_SLUMS')).toBeGreaterThan(value(10, 'CASINO'));
    // Large: the casino is worth more than the slums.
    expect(value(2_000, 'CASINO')).toBeGreaterThan(value(2_000, 'WINO_SLUMS'));
  });
});
