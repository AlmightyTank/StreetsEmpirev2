import { describe, expect, it } from 'vitest';
import { BAD_BATCH_CHANCE, drawStock, PREMIUM_USES, rollBadBatch } from '../calculations/premium-supply.js';

describe('premium supply', () => {
  it('covers three uses per premium unit', () => {
    expect(PREMIUM_USES).toBe(3);
  });

  it('burns plain stock one for one when no premium is held', () => {
    expect(drawStock(10, 10, 0)).toEqual({ regular: 10, premium: 0, covered: 10, premiumUses: 0 });
    expect(drawStock(10, 4, 0)).toEqual({ regular: 4, premium: 0, covered: 4, premiumUses: 0 });
    expect(drawStock(0, 5, 5)).toEqual({ regular: 0, premium: 0, covered: 0, premiumUses: 0 });
  });

  it('spends premium in sets of three, then plain stock', () => {
    expect(drawStock(10, 4, 2)).toEqual({ regular: 4, premium: 2, covered: 10, premiumUses: 6 });
  });

  it('tops up with one more premium unit for the odd uses', () => {
    expect(drawStock(10, 0, 5)).toEqual({ regular: 0, premium: 4, covered: 10, premiumUses: 10 });
  });

  it('reports the uses it could not cover when stock runs short', () => {
    expect(drawStock(10, 2, 1)).toEqual({ regular: 2, premium: 1, covered: 5, premiumUses: 3 });
  });

  it('rolls a bad batch only when premium stock is held', () => {
    const never = () => {
      throw new Error('the rng must not be touched without premium stock');
    };
    expect(rollBadBatch(0, never)).toBe(false);
    expect(rollBadBatch(3, () => BAD_BATCH_CHANCE - 0.001)).toBe(true);
    expect(rollBadBatch(3, () => BAD_BATCH_CHANCE)).toBe(false);
  });
});
