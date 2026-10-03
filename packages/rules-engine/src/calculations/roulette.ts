import type { CasinoRouletteTableRules, CasinoRouletteWheel } from '@streets/rulesets';
import type { Rng } from '../rng.js';

export type RouletteBetKind =
  | 'STRAIGHT'
  | 'SPLIT'
  | 'STREET'
  | 'CORNER'
  | 'SIX_LINE'
  | 'DOZEN'
  | 'COLUMN'
  | 'RED'
  | 'BLACK'
  | 'ODD'
  | 'EVEN'
  | 'LOW'
  | 'HIGH';

export type RoulettePocketColor = 'RED' | 'BLACK' | 'GREEN';

export interface RouletteBetMathInput {
  kind: RouletteBetKind;
  selection: string;
  amountCents: bigint;
}

export interface RouletteBetMathResult extends RouletteBetMathInput {
  pockets: string[];
  won: boolean;
  returnCents: bigint;
}

export interface RouletteSpinMath {
  pocket: string;
  color: RoulettePocketColor;
  bets: RouletteBetMathResult[];
  wagerCents: bigint;
  returnCents: bigint;
  netCents: bigint;
}

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export const EUROPEAN_ROULETTE_WHEEL = [
  '0','32','15','19','4','21','2','25','17','34','6','27','13','36','11','30','8','23','10',
  '5','24','16','33','1','20','14','31','9','22','18','29','7','28','12','35','3','26',
] as const;

export const AMERICAN_ROULETTE_WHEEL = [
  '0','28','9','26','30','11','7','20','32','17','5','22','34','15','3','24','36','13','1',
  '00','27','10','25','29','12','8','19','31','18','6','21','33','16','4','23','35','14','2',
] as const;

export function roulettePockets(wheel: CasinoRouletteWheel): readonly string[] {
  return wheel === 'AMERICAN' ? AMERICAN_ROULETTE_WHEEL : EUROPEAN_ROULETTE_WHEEL;
}

export function roulettePocketColor(pocket: string): RoulettePocketColor {
  if (pocket === '0' || pocket === '00') return 'GREEN';
  const value = Number(pocket);
  return RED.has(value) ? 'RED' : 'BLACK';
}

function normalizedRng(rng: Rng): number {
  const raw = rng();
  if (!Number.isFinite(raw)) return 0;
  return Math.min(0.9999999999999999, Math.max(0, raw));
}

function ordinary(selection: string): number | null {
  if (!/^(?:[1-9]|[12]\d|3[0-6])$/.test(selection)) return null;
  return Number(selection);
}

function rowFor(value: number): number {
  return Math.floor((value - 1) / 3);
}

function colFor(value: number): number {
  return (value - 1) % 3;
}

function sortedNumbers(selection: string): number[] | null {
  const parts = selection.split('-');
  if (!parts.length || parts.some((part) => ordinary(part) === null)) return null;
  return parts.map(Number).sort((a, b) => a - b);
}

export function rouletteSelectionPockets(
  kind: RouletteBetKind,
  selection: string,
  wheel: CasinoRouletteWheel,
): string[] {
  const all = roulettePockets(wheel);
  if (kind === 'STRAIGHT') {
    if (!all.includes(selection as never)) throw new Error('Invalid straight-up roulette pocket.');
    return [selection];
  }
  if (kind === 'RED' || kind === 'BLACK') {
    return Array.from({ length: 36 }, (_, index) => String(index + 1))
      .filter((pocket) => roulettePocketColor(pocket) === kind);
  }
  if (kind === 'ODD' || kind === 'EVEN') {
    const parity = kind === 'ODD' ? 1 : 0;
    return Array.from({ length: 36 }, (_, index) => index + 1)
      .filter((value) => value % 2 === parity)
      .map(String);
  }
  if (kind === 'LOW') return Array.from({ length: 18 }, (_, index) => String(index + 1));
  if (kind === 'HIGH') return Array.from({ length: 18 }, (_, index) => String(index + 19));

  if (kind === 'DOZEN') {
    if (selection === '1-12') return Array.from({ length: 12 }, (_, index) => String(index + 1));
    if (selection === '13-24') return Array.from({ length: 12 }, (_, index) => String(index + 13));
    if (selection === '25-36') return Array.from({ length: 12 }, (_, index) => String(index + 25));
    throw new Error('Invalid roulette dozen.');
  }
  if (kind === 'COLUMN') {
    if (!['1','2','3'].includes(selection)) throw new Error('Invalid roulette column.');
    const column = Number(selection) - 1;
    return Array.from({ length: 12 }, (_, row) => String(row * 3 + column + 1));
  }

  const nums = sortedNumbers(selection);
  if (!nums) throw new Error('Invalid roulette inside selection.');

  if (kind === 'SPLIT') {
    if (nums.length !== 2) throw new Error('A split needs two pockets.');
    const [a,b] = nums as [number, number];
    const adjacent = (rowFor(a) === rowFor(b) && Math.abs(colFor(a) - colFor(b)) === 1)
      || (colFor(a) === colFor(b) && Math.abs(rowFor(a) - rowFor(b)) === 1);
    if (!adjacent) throw new Error('Those pockets do not share a split.');
    return nums.map(String);
  }

  if (kind === 'STREET') {
    if (nums.length !== 3) throw new Error('A street needs three pockets.');
    const start = nums[0]!;
    if (start % 3 !== 1 || nums[1] !== start + 1 || nums[2] !== start + 2) {
      throw new Error('Invalid roulette street.');
    }
    return nums.map(String);
  }

  if (kind === 'CORNER') {
    if (nums.length !== 4) throw new Error('A corner needs four pockets.');
    const start = nums[0]!;
    if (
      start > 32
      || start % 3 === 0
      || nums[1] !== start + 1
      || nums[2] !== start + 3
      || nums[3] !== start + 4
    ) {
      throw new Error('Invalid roulette corner.');
    }
    return nums.map(String);
  }

  if (kind === 'SIX_LINE') {
    if (nums.length !== 6) throw new Error('A six-line bet needs six pockets.');
    const start = nums[0]!;
    if (start > 31 || start % 3 !== 1 || nums.some((value, index) => value !== start + index)) {
      throw new Error('Invalid roulette six-line bet.');
    }
    return nums.map(String);
  }

  throw new Error('Unsupported roulette bet.');
}

export function rouletteReturnMultiplier(kind: RouletteBetKind): bigint {
  switch (kind) {
    case 'STRAIGHT': return 36n;
    case 'SPLIT': return 18n;
    case 'STREET': return 12n;
    case 'CORNER': return 9n;
    case 'SIX_LINE': return 6n;
    case 'DOZEN':
    case 'COLUMN': return 3n;
    default: return 2n;
  }
}

export function resolveRouletteSpin(
  table: CasinoRouletteTableRules,
  bets: readonly RouletteBetMathInput[],
  rng: Rng,
): RouletteSpinMath {
  if (!bets.length) throw new Error('Roulette needs at least one bet.');
  const pockets = roulettePockets(table.wheel);
  const pocket = pockets[Math.floor(normalizedRng(rng) * pockets.length)]!;
  let wagerCents = 0n;
  let returnCents = 0n;

  const resolved = bets.map((bet) => {
    if (bet.amountCents <= 0n) throw new Error('Roulette bets must be positive.');
    const covered = rouletteSelectionPockets(bet.kind, bet.selection, table.wheel);
    const won = covered.includes(pocket);
    const returned = won ? bet.amountCents * rouletteReturnMultiplier(bet.kind) : 0n;
    wagerCents += bet.amountCents;
    returnCents += returned;
    return {
      ...bet,
      pockets: covered,
      won,
      returnCents: returned,
    };
  });

  return {
    pocket,
    color: roulettePocketColor(pocket),
    bets: resolved,
    wagerCents,
    returnCents,
    netCents: returnCents - wagerCents,
  };
}
