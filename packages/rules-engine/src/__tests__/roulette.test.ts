import { describe, expect, it } from 'vitest';
import {
  AMERICAN_ROULETTE_WHEEL,
  EUROPEAN_ROULETTE_WHEEL,
  resolveRouletteSpin,
  rouletteSelectionPockets,
} from '../calculations/roulette.js';

const american = {
  key: 'TEST',
  name: 'Test',
  blurb: '',
  venueKinds: ['FULL_CASINO'] as const,
  wheel: 'AMERICAN' as const,
  minBetCents: 100,
  maxBetCents: 10_000,
  betStepCents: 100,
  maxTotalBetCents: 50_000,
};

describe('roulette', () => {
  it('uses 38 pockets for American and 37 for European wheels', () => {
    expect(AMERICAN_ROULETTE_WHEEL).toHaveLength(38);
    expect(EUROPEAN_ROULETTE_WHEEL).toHaveLength(37);
  });

  it('covers standard outside bets without zeroes', () => {
    expect(rouletteSelectionPockets('RED', 'RED', 'AMERICAN')).toHaveLength(18);
    expect(rouletteSelectionPockets('DOZEN', '1-12', 'AMERICAN')).toEqual(
      Array.from({ length: 12 }, (_, index) => String(index + 1)),
    );
  });

  it('pays a straight-up win 35:1 plus the stake', () => {
    const result = resolveRouletteSpin(
      american,
      [{ kind: 'STRAIGHT', selection: '0', amountCents: 100n }],
      () => 0,
    );
    expect(result.pocket).toBe('0');
    expect(result.returnCents).toBe(3_600n);
    expect(result.netCents).toBe(3_500n);
  });

  it('validates normal split geometry', () => {
    expect(rouletteSelectionPockets('SPLIT', '1-2', 'AMERICAN')).toEqual(['1','2']);
    expect(() => rouletteSelectionPockets('SPLIT', '1-5', 'AMERICAN')).toThrow();
  });
});
