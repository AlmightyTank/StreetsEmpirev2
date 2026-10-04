import { classicOgV12A } from '../classic-og-v1.2-a/index.js';
import type { CasinoSlotPaylineRules, Ruleset } from '../types.js';

const CORNER_SYMBOLS = [
  { key: 'CHERRY', label: 'Cherry', glyph: '🍒', weight: 40 },
  { key: 'BAR', label: 'Bar', glyph: 'BAR', weight: 28 },
  { key: 'BELL', label: 'Bell', glyph: '🔔', weight: 18 },
  { key: 'SEVEN', label: 'Seven', glyph: '7', weight: 10 },
  { key: 'CROWN', label: 'Crown', glyph: '♛', weight: 4 },
] as const;

const NEON_SYMBOLS = [
  { key: 'CHERRY', label: 'Cherry', glyph: '🍒', weight: 32 },
  { key: 'BAR', label: 'Bar', glyph: 'BAR', weight: 24 },
  { key: 'BELL', label: 'Bell', glyph: '🔔', weight: 18 },
  { key: 'SEVEN', label: 'Seven', glyph: '7', weight: 13 },
  { key: 'DIAMOND', label: 'Diamond', glyph: '◆', weight: 8 },
  { key: 'CROWN', label: 'Crown', glyph: '♛', weight: 5 },
] as const;

const EMPIRE_SYMBOLS = [
  { key: 'CHERRY', label: 'Cherry', glyph: '🍒', weight: 34 },
  { key: 'BAR', label: 'Bar', glyph: 'BAR', weight: 25 },
  { key: 'BELL', label: 'Bell', glyph: '🔔', weight: 17 },
  { key: 'SEVEN', label: 'Seven', glyph: '7', weight: 11 },
  { key: 'DIAMOND', label: 'Diamond', glyph: '◆', weight: 7 },
  { key: 'CROWN', label: 'Crown', glyph: '♛', weight: 5 },
  { key: 'JACKPOT', label: 'Empire', glyph: '★', weight: 1 },
] as const;

function buildReelStrips(
  symbols: readonly { key: string; weight: number }[],
  reels: number,
): readonly (readonly string[])[] {
  const pool = symbols.flatMap((symbol) => Array.from({ length: symbol.weight }, () => symbol.key));
  const steps = [37, 43, 47, 53, 59] as const;
  return Array.from({ length: reels }, (_, reel) => {
    const step = steps[reel]!;
    const offset = (reel * 17 + 11) % pool.length;
    return Array.from({ length: pool.length }, (_, index) => pool[(offset + index * step) % pool.length]!);
  });
}

const FREE_SPINS = {
  triggerBps: 100,
  awards: [
    { spins: 1, weight: 9_300 },
    { spins: 2, weight: 500 },
    { spins: 3, weight: 150 },
    { spins: 5, weight: 45 },
    { spins: 10, weight: 5 },
  ],
} as const;

function lines(patterns: readonly (readonly number[])[]): readonly CasinoSlotPaylineRules[] {
  return patterns.map((rows, index) => ({ key: `LINE_${index + 1}`, name: `Line ${index + 1}`, rows }));
}

const CORNER_LINES = lines([
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
] as const);

const NEON_LINES = lines([
  [1, 1, 1, 1],
  [0, 0, 0, 0],
  [2, 2, 2, 2],
  [0, 1, 2, 1],
  [2, 1, 0, 1],
  [0, 0, 1, 2],
  [2, 2, 1, 0],
  [1, 0, 0, 1],
  [1, 2, 2, 1],
  [0, 1, 0, 1],
] as const);

const EMPIRE_LINES = lines([
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [1, 0, 2, 0, 1],
  [1, 2, 0, 2, 1],
  [0, 2, 1, 2, 0],
] as const);

/** 1.2.0-B — casino-style three-row Slots. Every stop and winning line is server-authoritative. */
export const classicOgV12B = {
  ...classicOgV12A,
  meta: { id: 'classic-og-v1.2-b', version: '1.2.0-B', name: 'Classic OG - Slots' },
  casino: {
    ...classicOgV12A.casino,
    slots: {
      machines: [
        {
          key: 'CORNER_CLASSIC',
          name: 'Corner Classic',
          blurb: 'A compact 3×3 cabinet with five selectable lines and old-school symbols.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND', 'NIGHTLIFE'],
          reels: 3,
          rows: 3,
          minBetPerLineCents: 100,
          maxBetPerLineCents: 2_000,
          betStepCents: 100,
          symbols: CORNER_SYMBOLS,
          reelStrips: buildReelStrips(CORNER_SYMBOLS, 3),
          paylines: CORNER_LINES,
          linePayoutBps: {
            CHERRY: { 3: 60_000 },
            BAR: { 3: 130_000 },
            BELL: { 3: 280_000 },
            SEVEN: { 3: 750_000 },
            CROWN: { 3: 3_000_000 },
          },
          freeSpins: { ...FREE_SPINS, presentationLabel: 'HOUSE SPINS' },
        },
        {
          key: 'NEON_SEVENS',
          name: 'Neon Sevens',
          blurb: 'A 4×3 video slot with ten selectable lines and bigger four-of-a-kind hits.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'NIGHTLIFE'],
          reels: 4,
          rows: 3,
          minBetPerLineCents: 500,
          maxBetPerLineCents: 5_000,
          betStepCents: 500,
          symbols: NEON_SYMBOLS,
          reelStrips: buildReelStrips(NEON_SYMBOLS, 4),
          paylines: NEON_LINES,
          linePayoutBps: {
            CHERRY: { 3: 40_000, 4: 170_000 },
            BAR: { 3: 90_000, 4: 350_000 },
            BELL: { 3: 170_000, 4: 870_000 },
            SEVEN: { 3: 390_000, 4: 2_610_000 },
            DIAMOND: { 3: 870_000, 4: 7_830_000 },
            CROWN: { 3: 2_180_000, 4: 26_100_000 },
          },
          freeSpins: { ...FREE_SPINS, presentationLabel: 'LUCKY SPINS' },
        },
        {
          key: 'EMPIRE_GOLD',
          name: 'Empire Gold',
          blurb: 'The Empire Grand 5×3 high-limit cabinet with twenty lines and a max-lines progressive.',
          venueKinds: ['FULL_CASINO'],
          reels: 5,
          rows: 3,
          minBetPerLineCents: 2_500,
          maxBetPerLineCents: 12_500,
          betStepCents: 2_500,
          symbols: EMPIRE_SYMBOLS,
          reelStrips: buildReelStrips(EMPIRE_SYMBOLS, 5),
          paylines: EMPIRE_LINES,
          linePayoutBps: {
            CHERRY: { 3: 40_000, 4: 110_000, 5: 380_000 },
            BAR: { 3: 80_000, 4: 280_000, 5: 940_000 },
            BELL: { 3: 140_000, 4: 660_000, 5: 2_350_000 },
            SEVEN: { 3: 330_000, 4: 1_690_000, 5: 6_580_000 },
            DIAMOND: { 3: 750_000, 4: 4_700_000, 5: 23_500_000 },
            CROWN: { 3: 1_880_000, 4: 14_100_000, 5: 94_000_000 },
            JACKPOT: { 3: 0, 4: 0, 5: 0 },
          },
          progressive: {
            symbolKey: 'JACKPOT',
            seedCents: 2_500_000,
            contributionBps: 100,
            eligibleBetPerLineCents: 12_500,
            requiresAllPaylines: true,
          },
          freeSpins: { ...FREE_SPINS, presentationLabel: 'COMPLIMENTARY SPINS' },
        },
      ],
    },
  },
} as const satisfies Ruleset;
