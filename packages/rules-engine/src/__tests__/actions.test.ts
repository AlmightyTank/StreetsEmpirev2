import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import {
  calculateExposure,
  calculateProduce,
  calculateScout,
  calculateWork,
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
    ...overrides,
  };
}

/** Feeds a fixed sequence, then repeats the last value. */
function sequence(...values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0.5;
}

/** Never rolls a "find", so a work result is pure earnings. */
const noFinds: Rng = () => 0.5;

describe('calculateScout', () => {
  const nobody = crew({ whores: 0, thugs: 0 });

  // Section 27: ten turns in the Nightclub brings back 11 whores and 4 thugs.
  it('matches the section 27 recruitment for a nobody', () => {
    const result = calculateScout({
      player: nobody,
      turns: 10,
      ruleset: classicOgV01,
      district: 'NIGHTCLUB',
      rng: flatRng,
    });

    expect(result.whoresRecruited).toBe(11);
    expect(result.thugsRecruited).toBe(4);
    expect(result.turnsSpent).toBe(10);
  });

  /** Scouting is looking for people. It is not a shift. */
  it('earns nothing, burns nothing and wears nobody out', () => {
    const result = calculateScout({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      district: 'NIGHTCLUB',
      rng: flatRng,
    });

    expect(result).not.toHaveProperty('grossCents');
    expect(result).not.toHaveProperty('consumption');
    expect(result).not.toHaveProperty('fatigue');
  });

  it('can come back with a haul or with nothing', () => {
    const roll = (variance: number) =>
      calculateScout({
        player: nobody,
        turns: 10,
        ruleset: classicOgV01,
        district: 'NIGHTCLUB',
        rng: sequence(variance, 0.99),
      }).whoresRecruited;

    expect(roll(1)).toBe(14);
    expect(roll(0)).toBe(7);
  });

  it('rounds fractional recruits stochastically rather than to nothing', () => {
    const lucky = calculateScout({
      player: nobody,
      turns: 1,
      ruleset: classicOgV01,
      district: 'CASINO',
      rng: sequence(0.5, 0.1),
    });
    const unlucky = calculateScout({
      player: nobody,
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
      player: nobody,
      turns: 10,
      ruleset: classicOgV01,
      district: 'NIGHTCLUB',
      city: { scoutModifier: 2, incomeModifier: 1, crackModifier: 1 },
      rng: flatRng,
    });
    expect(boosted.whoresRecruited).toBe(22);
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
      classicOgV01.districts.NIGHTCLUB,
      { whores: caps.whoreSoftCap, thugs: 0 },
      classicOgV01,
    );

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

    expect(run(0)).toBe(180);
    expect(run(caps.whoreSoftCap * 9)).toBe(18);
  });
});

describe('calculateExposure', () => {
  const casino = classicOgV01.districts.CASINO;
  const slums = classicOgV01.districts.WINO_SLUMS;

  it('is clean when the crew covers the block', () => {
    // The Casino gives one thug four girls.
    const result = calculateExposure({ whores: 40, thugs: 10 }, casino, classicOgV01);

    expect(result.covered).toBe(40);
    expect(result.exposed).toBe(0);
    expect(result.takeMultiplier).toBe(1);
    expect(result.fatigueMultiplier).toBe(1);
  });

  it('costs the take and the crew when half of them stand alone', () => {
    const result = calculateExposure({ whores: 40, thugs: 5 }, casino, classicOgV01);

    expect(result.exposed).toBe(0.5);
    expect(result.takeMultiplier).toBeCloseTo(0.7, 5);
    expect(result.fatigueMultiplier).toBeCloseTo(1.5, 5);
  });

  /** The same crew is fine somewhere nobody is watching. */
  it('lets a thin crew work a block nobody polices', () => {
    const result = calculateExposure({ whores: 40, thugs: 5 }, slums, classicOgV01);
    expect(result.exposed).toBe(0);
  });

  it('bottoms out rather than going negative', () => {
    const result = calculateExposure({ whores: 40, thugs: 0 }, casino, classicOgV01);
    expect(result.exposed).toBe(1);
    expect(result.takeMultiplier).toBeCloseTo(0.4, 5);
    expect(result.fatigueMultiplier).toBe(2);
  });
});

describe('calculateWork', () => {
  /** 10 girls, enough muscle for the Casino, a clean average roll. */
  const covered = crew({ whores: 10, thugs: 3 });

  function night(payoutPercent: number, district: 'CASINO' | 'WINO_SLUMS' = 'CASINO') {
    return calculateWork({
      player: covered,
      turns: 10,
      ruleset: classicOgV01,
      district,
      payoutPercent,
      rng: noFinds,
    });
  }

  it('earns the district rate and splits it by the payout', () => {
    const result = night(50);

    // 10 whores * $15 * 10 turns * 2.5 (Casino) = $3,750.
    expect(result.grossCents).toBe(375_000n);
    expect(result.crewTakeCents).toBe(187_500n);
    expect(result.pimpTakeCents).toBe(187_500n);
  });

  it('burns supplies, because this is the shift', () => {
    expect(night(50).consumption).toEqual({ condoms: 10, crack: 5, beer: 1 });
  });

  /**
   * The point of the whole rework: a stingy cut is survivable somewhere rich
   * and ruinous somewhere poor, because relief is measured in money reaching
   * a pocket rather than in a percentage.
   */
  it('makes the same cut survivable somewhere rich and ruinous somewhere poor', () => {
    const casino = night(20, 'CASINO').fatigue.whore.change;
    const slums = night(20, 'WINO_SLUMS').fatigue.whore.change;

    // A fifth of a Casino night is close enough to fair that the crew barely
    // notices; a fifth of the slums is most of a night's wear, every night.
    expect(casino).toBeLessThan(1);
    expect(slums).toBeGreaterThan(6);
    expect(slums / Math.max(casino, 0.01)).toBeGreaterThan(10);
  });

  it('has a different break-even cut in every district', () => {
    const breakEven = (district: 'CASINO' | 'NIGHTCLUB' | 'WINO_SLUMS') => {
      for (let payout = 1; payout <= 99; payout++) {
        if (night(payout, district as 'CASINO').fatigue.whore.change <= 0) return payout;
      }
      return null;
    };

    const casino = breakEven('CASINO');
    const nightclub = breakEven('NIGHTCLUB');

    expect(casino).not.toBeNull();
    expect(nightclub).not.toBeNull();
    expect(casino!).toBeLessThan(nightclub!);
    // Nobody can be kept happy working the slums, at any split.
    expect(breakEven('WINO_SLUMS')).toBeNull();
  });

  it('rewards paying well anywhere', () => {
    const stingy = night(10, 'WINO_SLUMS').fatigue.whore.change;
    const generous = night(90, 'WINO_SLUMS').fatigue.whore.change;
    expect(generous).toBeLessThan(stingy);
  });

  it('earns less and hurts more on a block the crew cannot cover', () => {
    const thin = calculateWork({
      player: crew({ whores: 40, thugs: 1 }),
      turns: 10,
      ruleset: classicOgV01,
      district: 'CASINO',
      payoutPercent: 50,
      rng: noFinds,
    });

    expect(thin.exposure.exposed).toBeGreaterThan(0);
    expect(thin.fatigue.whore.wear).toBeGreaterThan(
      classicOgV01.work.fatigue.whorePerTurn * 10,
    );
  });

  it('earns nothing from a stable that is not there', () => {
    const result = calculateWork({
      player: crew({ whores: 0, thugs: 5 }),
      turns: 10,
      ruleset: classicOgV01,
      district: 'CASINO',
      payoutPercent: 50,
      rng: noFinds,
    });
    expect(result.grossCents).toBe(0n);
  });

  it('scales the take with whore happiness', () => {
    const worn = calculateWork({
      player: crew({ whores: 10, thugs: 3, whoreHappiness: 50 }),
      turns: 10,
      ruleset: classicOgV01,
      district: 'CASINO',
      payoutPercent: 50,
      rng: noFinds,
    });
    expect(worn.grossCents).toBe(187_500n);
  });

  it('turns up product on the block every so often', () => {
    const lucky = calculateWork({
      player: covered,
      turns: 10,
      ruleset: classicOgV01,
      district: 'CASINO',
      payoutPercent: 50,
      rng: () => 0.01, // always under the find chance
    });
    expect(lucky.crackFound).toBeGreaterThan(0);
  });
});

describe('calculateProduce', () => {
  const rich = { cashCents: 100_000_000n };

  it('cooks half a rock per thug per turn at full happiness', () => {
    const result = calculateProduce({
      player: crew({ thugs: 42 }),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
      ...rich,
    });

    expect(result.crackProduced).toBe(210);
    expect(result.limitedByCash).toBe(false);
  });

  it('charges for the ingredients', () => {
    const result = calculateProduce({
      player: crew({ thugs: 42 }),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
      ...rich,
    });

    // 210 rocks at $1 of ingredients each.
    expect(result.ingredientCents).toBe(21_000n);
  });

  /** Cooking undercuts Pip's by an order of magnitude. That is the point. */
  it('costs a tenth of what Pip’s charges for the same rock', () => {
    expect(classicOgV01.production.crack.ingredientCentsPerRock * 10).toBe(
      classicOgV01.stores.PIP.items.CRACK?.buyCents,
    );
  });

  it('cooks a smaller batch when the cash runs out', () => {
    const result = calculateProduce({
      player: crew({ thugs: 42 }),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
      cashCents: 3_000n, // enough for 30 rocks
    });

    expect(result.crackProduced).toBe(30);
    expect(result.ingredientCents).toBe(3_000n);
    expect(result.limitedByCash).toBe(true);
  });

  it('earns nothing and wears the thugs down', () => {
    const result = calculateProduce({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
      ...rich,
    });

    expect(result).not.toHaveProperty('grossCents');
    expect(result.thugFatigue).toBe(6);
  });

  it('drinks beer but touches no other supplies', () => {
    const result = calculateProduce({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
      ...rich,
    });
    expect(result.consumption).toEqual({ condoms: 0, crack: 0, beer: 8 });
  });

  it('scales output with thug happiness', () => {
    const batch = (thugHappiness: number) =>
      calculateProduce({
        player: crew({ thugs: 42, thugHappiness }),
        turns: 10,
        ruleset: classicOgV01,
        rng: flatRng,
        ...rich,
      }).crackProduced;

    expect(batch(100)).toBe(210);
    expect(batch(0)).toBe(52);
    expect(batch(50)).toBeLessThan(batch(100));
  });

  it('produces nothing without thugs', () => {
    const result = calculateProduce({
      player: crew({ thugs: 0 }),
      turns: 10,
      ruleset: classicOgV01,
      rng: flatRng,
      ...rich,
    });
    expect(result.crackProduced).toBe(0);
  });
});
