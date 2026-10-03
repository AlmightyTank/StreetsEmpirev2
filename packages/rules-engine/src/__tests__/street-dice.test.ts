import { describe, expect, it } from 'vitest';
import {
  rollStreetDice,
  streetDiceComeOut,
  streetDiceLineReturnCents,
  streetDiceOddsReturnCents,
  streetDicePointResult,
} from '../calculations/street-dice.js';

describe('street dice', () => {
  it('uses normal pass-line come-out rules', () => {
    expect(streetDiceComeOut(7)).toBe('WIN');
    expect(streetDiceComeOut(11)).toBe('WIN');
    expect(streetDiceComeOut(2)).toBe('LOSE');
    expect(streetDiceComeOut(12)).toBe('LOSE');
    expect(streetDiceComeOut(6)).toBe('POINT');
  });

  it('resolves a point before seven-out', () => {
    expect(streetDicePointResult(6, 6)).toBe('WIN');
    expect(streetDicePointResult(7, 6)).toBe('LOSE');
    expect(streetDicePointResult(5, 6)).toBe('CONTINUE');
  });

  it('pays true odds correctly', () => {
    expect(streetDiceOddsReturnCents(1_000n, 4, true)).toBe(3_000n);
    expect(streetDiceOddsReturnCents(1_000n, 5, true)).toBe(2_500n);
    expect(streetDiceOddsReturnCents(1_000n, 6, true)).toBe(2_200n);
  });

  it('rolls two six-sided dice', () => {
    expect(rollStreetDice(() => 0)).toEqual([1,1]);
    expect(rollStreetDice(() => 0.999999)).toEqual([6,6]);
  });

  it('returns 2:1 including stake on a pass-line win', () => {
    expect(streetDiceLineReturnCents(2_500n, true)).toBe(5_000n);
    expect(streetDiceLineReturnCents(2_500n, false)).toBe(0n);
  });
});
