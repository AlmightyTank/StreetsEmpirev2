import { describe, expect, it } from 'vitest';
import { classicOgV12D } from '@streets/rulesets';
import { horseRaceOdds, horseRaceOrder, horseReturnCents, scratchPrizeMultiplier, seededRng, weightedIndex } from '../index.js';

describe('casino instant games', () => {
  it('selects weighted outcomes at deterministic boundaries', () => {
    expect(weightedIndex([2, 3, 5], () => 0)).toBe(0);
    expect(weightedIndex([2, 3, 5], () => 0.2)).toBe(1);
    expect(weightedIndex([2, 3, 5], () => 0.999999)).toBe(2);
    expect(() => weightedIndex([0, -1], () => 0)).toThrow(/positive weight/);
  });

  it('uses only configured scratch-card payout tiers', () => {
    const rules = classicOgV12D.casino.scratchCards!;
    const allowed = new Set<number>(rules.payoutTiers.map((tier) => tier.multiplier));
    const rng = seededRng(12_001);
    for (let draw = 0; draw < 2_000; draw += 1) expect(allowed.has(scratchPrizeMultiplier(rules, rng))).toBe(true);
  });

  it('returns every horse exactly once and pays fixed total-return odds', () => {
    const rules = classicOgV12D.casino.horseRacing!;
    const order = horseRaceOrder(rules, seededRng(12_002));
    expect(new Set(order)).toEqual(new Set(rules.horses.map((horse) => horse.key)));
    expect(order).toHaveLength(rules.horses.length);
    expect(horseReturnCents(2_000n, 15_500, true)).toBe(3_100n);
    expect(horseReturnCents(2_000n, 15_500, false)).toBe(0n);
  });

  it('adjusts live odds without allowing volume or history to create extreme returns', () => {
    const rules = classicOgV12D.casino.horseRacing!;
    const odds = horseRaceOdds(rules, {
      volumeByHorse: { BRASS_KNUCKLES: 1_000_000, LONG_SHOT: 1 },
      recentWinners: ['BRASS_KNUCKLES', 'BRASS_KNUCKLES', 'BRASS_KNUCKLES'],
      statusModifierBps: 500,
    });
    expect(Object.keys(odds)).toHaveLength(rules.horses.length);
    expect(odds.BRASS_KNUCKLES).toBeGreaterThan(rules.horses[0]!.returnBps);
    expect(odds.BRASS_KNUCKLES).toBeLessThanOrEqual(250_000);
    expect(odds.LONG_SHOT).toBeGreaterThanOrEqual(10_000);
  });
});
