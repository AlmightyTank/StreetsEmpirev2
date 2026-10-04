import { describe, expect, it } from 'vitest';
import { comparePokerHands, evaluatePokerHand, type PokerCard } from '../calculations/poker.js';

const c = (rank: number, suit: PokerCard['suit'] = 'S'): PokerCard => ({ rank, suit });

describe('Texas Hold’em hand evaluation', () => {
  it('recognizes an ace-low wheel straight', () => {
    expect(evaluatePokerHand([c(14), c(2, 'D'), c(3, 'H'), c(4, 'C'), c(5)]).score).toEqual([4, 5]);
  });

  it('uses the best five cards and correctly ranks a full house over a flush', () => {
    const fullHouse = evaluatePokerHand([c(13), c(13, 'D'), c(13, 'H'), c(8), c(8, 'D'), c(2, 'S'), c(3, 'S')]);
    const flush = evaluatePokerHand([c(14), c(11), c(9), c(6), c(3), c(2, 'D'), c(4, 'D')]);
    expect(fullHouse.category).toBe('FULL_HOUSE');
    expect(comparePokerHands(fullHouse, flush)).toBeGreaterThan(0);
  });

  it('breaks pair ties with kickers and detects a royal straight flush', () => {
    const pairA = evaluatePokerHand([c(10), c(10, 'D'), c(14), c(8), c(6), c(4), c(2)]);
    const pairB = evaluatePokerHand([c(10), c(10, 'D'), c(13), c(8), c(6), c(4), c(2)]);
    const royal = evaluatePokerHand([c(10), c(11), c(12), c(13), c(14), c(2, 'D'), c(3, 'D')]);
    expect(comparePokerHands(pairA, pairB)).toBeGreaterThan(0);
    expect(royal).toMatchObject({ category: 'STRAIGHT_FLUSH', score: [8, 14] });
  });

  it('rejects impossible hand sizes', () => {
    expect(() => evaluatePokerHand([c(2), c(3), c(4), c(5)])).toThrow(RangeError);
  });
});
