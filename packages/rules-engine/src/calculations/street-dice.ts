import type { Rng } from '../rng.js';

export type StreetDiceComeOut = 'WIN' | 'LOSE' | 'POINT';
export type StreetDicePointResult = 'WIN' | 'LOSE' | 'CONTINUE';

function normalizedRng(rng: Rng): number {
  const raw = rng();
  if (!Number.isFinite(raw)) return 0;
  return Math.min(0.9999999999999999, Math.max(0, raw));
}

export function rollStreetDice(rng: Rng): [number, number] {
  return [
    Math.floor(normalizedRng(rng) * 6) + 1,
    Math.floor(normalizedRng(rng) * 6) + 1,
  ];
}

export function streetDiceComeOut(total: number): StreetDiceComeOut {
  if (total === 7 || total === 11) return 'WIN';
  if (total === 2 || total === 3 || total === 12) return 'LOSE';
  if ([4,5,6,8,9,10].includes(total)) return 'POINT';
  throw new Error('Street Dice total must be 2-12.');
}

export function streetDicePointResult(total: number, point: number): StreetDicePointResult {
  if (![4,5,6,8,9,10].includes(point)) throw new Error('Street Dice point is invalid.');
  if (total === point) return 'WIN';
  if (total === 7) return 'LOSE';
  if (total < 2 || total > 12) throw new Error('Street Dice total must be 2-12.');
  return 'CONTINUE';
}

/** Pass-line return including the original wager. */
export function streetDiceLineReturnCents(wagerCents: bigint, won: boolean): bigint {
  if (wagerCents < 0n) throw new Error('Street Dice wager cannot be negative.');
  return won ? wagerCents * 2n : 0n;
}

/** True-odds return including the original odds wager. */
export function streetDiceOddsReturnCents(oddsCents: bigint, point: number, won: boolean): bigint {
  if (oddsCents < 0n) throw new Error('Street Dice odds cannot be negative.');
  if (!won || oddsCents === 0n) return 0n;
  if (point === 4 || point === 10) return oddsCents * 3n;
  if (point === 5 || point === 9) return (oddsCents * 5n) / 2n;
  if (point === 6 || point === 8) return (oddsCents * 11n) / 5n;
  throw new Error('Street Dice point is invalid.');
}
