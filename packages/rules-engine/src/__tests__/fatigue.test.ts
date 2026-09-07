import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import {
  calculateGrindFatigue,
  calculateRest,
  calculateWorkFatigue,
  clampFatigue,
} from '../calculations/fatigue.js';

const RULES = classicOgV01.work.fatigue;

/** A ten turn night for a ten-head crew, with the take as the variable. */
function night(crewTakeCents: bigint, wearPerTurn: number = RULES.whorePerTurn) {
  return calculateWorkFatigue(
    { turns: 10, crewSize: 10, crewTakeCents, wearPerTurn },
    classicOgV01,
  );
}

describe('calculateWorkFatigue', () => {
  /**
   * The whole mechanic in one assertion: pay the crew exactly what a turn's
   * work is worth to a person and they end the night no worse off.
   */
  it('breaks even when the take matches what the work is worth', () => {
    // 10 heads * 10 turns * $6 fair take = $600 of crew take.
    const result = night(60_000n);

    expect(result.reliefRatio).toBe(1);
    expect(result.wear).toBe(8);
    expect(result.relief).toBe(8);
    expect(result.change).toBe(0);
  });

  it('wears them down when the cut does not justify the night', () => {
    const result = night(30_000n);

    expect(result.reliefRatio).toBe(0.5);
    expect(result.change).toBe(4);
  });

  it('gives them back more than the night cost when the money is good', () => {
    const result = night(120_000n);

    expect(result.reliefRatio).toBe(2);
    expect(result.change).toBe(-8);
  });

  it('caps relief, so no district makes the crew immortal', () => {
    const absurd = night(10_000_000n);
    expect(absurd.reliefRatio).toBe(RULES.maxReliefMultiple);
  });

  it('wears thugs less than whores for the same night', () => {
    const whores = night(30_000n, RULES.whorePerTurn);
    const thugs = night(30_000n, RULES.thugPerTurn);

    expect(thugs.change).toBeLessThan(whores.change);
    expect(thugs.change).toBeGreaterThan(0);
  });

  /**
   * One pot, split across everybody who worked. Hiring muscle you cannot pay
   * for thins the share and wears the whole crew down faster.
   */
  it('thins everyone’s share as the crew grows', () => {
    const lean = calculateWorkFatigue(
      { turns: 10, crewSize: 10, crewTakeCents: 60_000n, wearPerTurn: 0.8 },
      classicOgV01,
    );
    const bloated = calculateWorkFatigue(
      { turns: 10, crewSize: 40, crewTakeCents: 60_000n, wearPerTurn: 0.8 },
      classicOgV01,
    );

    expect(lean.change).toBe(0);
    expect(bloated.change).toBeGreaterThan(0);
  });

  it('pays nothing back to a crew that earned nothing', () => {
    const result = night(0n);
    expect(result.relief).toBe(0);
    expect(result.change).toBe(result.wear);
  });

  it('is a no-op for zero turns', () => {
    const result = calculateWorkFatigue(
      { turns: 0, crewSize: 10, crewTakeCents: 60_000n, wearPerTurn: 0.8 },
      classicOgV01,
    );
    expect(result.change).toBe(0);
  });
});

describe('calculateGrindFatigue', () => {
  it('sticks entirely, because cooking pays nobody', () => {
    expect(calculateGrindFatigue(10, classicOgV01.production.fatigue.thugPerTurn)).toBe(6);
  });

  it('never goes negative', () => {
    expect(calculateGrindFatigue(-5, 0.6)).toBe(0);
  });
});

describe('calculateRest', () => {
  it('sheds wear while the crew is left alone', () => {
    // Six hours away is 36 ten-minute intervals.
    expect(calculateRest(36, classicOgV01)).toBe(18);
  });

  it('sheds nothing without elapsed intervals', () => {
    expect(calculateRest(0, classicOgV01)).toBe(0);
  });
});

describe('clampFatigue', () => {
  it('keeps wear inside the scale and whole', () => {
    expect(clampFatigue(-4, classicOgV01)).toBe(0);
    expect(clampFatigue(42.4, classicOgV01)).toBe(42);
    expect(clampFatigue(500, classicOgV01)).toBe(classicOgV01.happiness.fatigue.max);
  });
});
