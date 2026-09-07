import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import { calculateNetWorthCents } from '../calculations/net-worth.js';

const empty = {
  cashCents: 0,
  whores: 0,
  thugs: 0,
  lowRiders: 0,
  medicine: 0,
  crack: 0,
  condoms: 0,
};

describe('calculateNetWorthCents', () => {
  // Section 53 fixture. The expected value is exact, not approximate.
  it('matches the frozen fixture', () => {
    const worth = calculateNetWorthCents({
      cashCents: 500_000, // $5,000
      whores: 10, //        $20,000
      thugs: 10, //         $7,500
      lowRiders: 1, //      $3,000
      medicine: 20, //      $100
      crack: 100, //        $300
      condoms: 1_000, //    $100
    });

    expect(worth).toBe(3_600_000n); // $36,000.00
  });

  it('values a brand new player at $8,075', () => {
    const start = classicOgV01.round.startingPlayer;

    const worth = calculateNetWorthCents({
      cashCents: start.cashCents,
      whores: start.whores,
      thugs: start.thugs,
      lowRiders: start.lowRiders,
      medicine: start.medicine,
      crack: start.crack,
      condoms: start.condoms,
    });

    expect(worth).toBe(807_500n);
  });

  it('prices condoms at ten cents, so $1 of condoms is $0.10 of net worth', () => {
    const worth = calculateNetWorthCents({ ...empty, condoms: 5_000 });
    expect(worth).toBe(50_000n); // $500 of net worth for $5,000 spent
  });

  it('ignores beer and weapons', () => {
    // Neither appears in NetWorthInput at all, so a player holding nothing but
    // beer money and hardware is worth exactly their cash.
    const worth = calculateNetWorthCents({ ...empty, cashCents: 123_456 });
    expect(worth).toBe(123_456n);
  });

  it('stays exact at values that would lose cents as a float', () => {
    const worth = calculateNetWorthCents({
      ...empty,
      cashCents: 9_007_199_254_740_993n,
    });
    expect(worth).toBe(9_007_199_254_740_993n);
  });
});
