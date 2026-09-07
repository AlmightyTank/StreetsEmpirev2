import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import { calculateWork } from '../calculations/actions.js';
import { clampFatigue } from '../calculations/fatigue.js';
import { calculateThugHappiness, calculateWhoreHappiness } from '../calculations/happiness.js';

const stocked = {
  whores: 40, thugs: 10, condoms: 500, beer: 100, crack: 500,
  pistols: 10, shotguns: 0, tek9s: 0, ak47s: 0,
  whoreFatigue: 0, thugFatigue: 0,
};

function shift(overrides: Partial<typeof stocked> = {}, turns = 10) {
  const before = { ...stocked, ...overrides };
  const outcome = calculateWork({
    player: {
      ...before,
      whoreHappiness: calculateWhoreHappiness(before),
      thugHappiness: calculateThugHappiness(before),
    },
    turns, ruleset: classicOgV01, district: 'CASINO', payoutPercent: 90,
    rng: () => 0.5,
  });
  const after = {
    ...before,
    condoms: before.condoms - outcome.consumption.condoms,
    beer: before.beer - outcome.consumption.beer,
    crack: before.crack - outcome.consumption.crack + outcome.crackFound,
    whoreFatigue: clampFatigue(before.whoreFatigue + outcome.fatigue.whore.change, classicOgV01),
    thugFatigue: clampFatigue(before.thugFatigue + outcome.fatigue.thug.change, classicOgV01),
  };
  return { before, after, outcome };
}

describe('street work supplies and happiness', () => {
  it('deducts stocked condoms and beer without shortage wear', () => {
    const { outcome, after } = shift();
    expect(outcome.consumption).toEqual({ condoms: 40, beer: 2, crack: 20 });
    expect(after.condoms).toBe(460);
    expect(after.beer).toBe(98);
    expect(outcome.shortages).toEqual({ condoms: 0, beer: 0 });
    expect(after.whoreFatigue).toBe(0);
    expect(after.thugFatigue).toBe(0);
  });

  it.each(['condoms', 'beer'] as const)('reduces the affected happiness with no %s, even at a generous cut', (supply) => {
    const { before, after, outcome } = shift({ [supply]: 0 });
    expect(after[supply]).toBe(0);
    expect(outcome.consumption[supply]).toBe(0);
    expect(outcome.shortages[supply]).toBeGreaterThan(0);
    if (supply === 'condoms') {
      expect(calculateWhoreHappiness(after)).toBe(calculateWhoreHappiness(before) - 10);
      expect(after.thugFatigue).toBe(0);
    } else {
      expect(calculateThugHappiness(after)).toBe(calculateThugHappiness(before) - 10);
      expect(after.whoreFatigue).toBe(0);
    }
  });

  it('scales wear to partial shortages and never spends nonexistent supplies', () => {
    const { outcome, after } = shift({ condoms: 20, beer: 1 });
    expect(outcome.shortages).toEqual({ condoms: 20, beer: 1 });
    expect(after.condoms).toBe(0);
    expect(after.beer).toBe(0);
    expect(after.whoreFatigue).toBe(5);
    expect(after.thugFatigue).toBe(5);
  });

  it('adds no shortage wear when inventory exactly covers the shift', () => {
    const { outcome, after } = shift({ condoms: 40, beer: 2 });
    expect(outcome.shortages).toEqual({ condoms: 0, beer: 0 });
    expect(after.whoreFatigue).toBe(0);
    expect(after.thugFatigue).toBe(0);
  });

  it('keeps hurting happiness on repeated unsupplied shifts', () => {
    const first = shift({ condoms: 0, beer: 0 });
    const second = shift(first.after);
    expect(calculateWhoreHappiness(second.after)).toBeLessThan(calculateWhoreHappiness(first.after));
    expect(calculateThugHappiness(second.after)).toBeLessThan(calculateThugHappiness(first.after));
  });

  it('persists a happiness hit for a small crew working one unsupplied turn', () => {
    const { before, after } = shift({ whores: 1, thugs: 1, condoms: 0, beer: 0 }, 1);
    expect(calculateWhoreHappiness(after)).toBeLessThan(calculateWhoreHappiness(before));
    expect(calculateThugHappiness(after)).toBeLessThan(calculateThugHappiness(before));
  });

  it('does not penalize beer shortages without thugs or charge supplies for zero turns', () => {
    expect(shift({ thugs: 0, beer: 0 }).outcome.shortages.beer).toBe(0);
    const { outcome } = shift({ condoms: 0, beer: 0 }, 0);
    expect(outcome.shortages).toEqual({ condoms: 0, beer: 0 });
    expect(outcome.fatigue.whore.change).toBe(0);
    expect(outcome.fatigue.thug.change).toBe(0);
  });
});
