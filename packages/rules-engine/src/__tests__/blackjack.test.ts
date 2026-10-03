import { describe, expect, it } from 'vitest';
import { classicOgV12B, classicOgV12C } from '@streets/rulesets';
import {
  blackjackCanSplit,
  blackjackDealerShouldHit,
  blackjackHandOutcome,
  blackjackHandValue,
  blackjackReturnCents,
  buildBlackjackShoe,
  loadRuleset,
  seededRng,
} from '../index.js';

describe('1.2.0-C blackjack math', () => {
  it('registers the C ruleset without changing B', () => {
    expect(loadRuleset('classic-og-v1.2-c', '1.2.0-C')).toBe(classicOgV12C);
    expect(classicOgV12B.casino.blackjack).toBeUndefined();
    expect(classicOgV12C.casino.blackjack.tables.map((table) => table.key)).toEqual([
      'STREET_BLACKJACK',
      'NEON_BLACKJACK',
      'EMPIRE_HIGH_LIMIT',
    ]);
  });

  it('builds deterministic server-owned shoes with the configured deck count', () => {
    const first = buildBlackjackShoe(6, seededRng(1203));
    const second = buildBlackjackShoe(6, seededRng(1203));
    expect(first).toEqual(second);
    expect(first).toHaveLength(312);
    expect(new Set(first).size).toBe(52);
  });

  it('scores hard, soft, blackjack and bust hands', () => {
    expect(blackjackHandValue(['AS', '6H'])).toEqual({ total: 17, soft: true, blackjack: false, bust: false });
    expect(blackjackHandValue(['AS', '6H', '10D'])).toEqual({ total: 17, soft: false, blackjack: false, bust: false });
    expect(blackjackHandValue(['AS', 'KH'])).toEqual({ total: 21, soft: true, blackjack: true, bust: false });
    expect(blackjackHandValue(['10S', '8H', '5D']).bust).toBe(true);
  });

  it('uses exact-rank splitting and configurable soft-17 behavior', () => {
    expect(blackjackCanSplit(['8S', '8H'])).toBe(true);
    expect(blackjackCanSplit(['10S', 'KH'])).toBe(false);
    expect(blackjackDealerShouldHit(['AS', '6H'], false)).toBe(false);
    expect(blackjackDealerShouldHit(['AS', '6H'], true)).toBe(true);
    expect(blackjackDealerShouldHit(['10S', '6H'], true)).toBe(true);
  });

  it('settles naturals, normal wins, pushes and losses correctly', () => {
    const table = classicOgV12C.casino.blackjack.tables[0]!;
    expect(blackjackHandOutcome(['AS', 'KH'], ['10S', '9H'], true)).toBe('BLACKJACK');
    expect(blackjackHandOutcome(['10S', '9H'], ['10D', '8C'], true)).toBe('WIN');
    expect(blackjackHandOutcome(['10S', '8H'], ['10D', '8C'], true)).toBe('PUSH');
    expect(blackjackHandOutcome(['10S', '7H'], ['10D', '8C'], true)).toBe('LOSE');
    expect(blackjackReturnCents(1_000n, 'BLACKJACK', table)).toBe(2_500n);
    expect(blackjackReturnCents(1_000n, 'WIN', table)).toBe(2_000n);
    expect(blackjackReturnCents(1_000n, 'PUSH', table)).toBe(1_000n);
    expect(blackjackReturnCents(1_000n, 'LOSE', table)).toBe(0n);
  });
});
