import { classicOgV12A } from '../classic-og-v1.2-a/index.js';
import type { Ruleset } from '../types.js';

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

/** 1.2.0-B — Slots. All outcomes are decided server-side from these pinned tables. */
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
          blurb: 'Cheap action, frequent small hits, and the same three reels in every room.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND', 'NIGHTLIFE'],
          minWagerCents: 100,
          maxWagerCents: 10_000,
          wagerStepCents: 100,
          symbols: CORNER_SYMBOLS,
          pairPayoutBps: { CHERRY: 5_820, BAR: 8_730, BELL: 11_640, SEVEN: 17_460, CROWN: 33_950 },
          triplePayoutBps: { CHERRY: 33_950, BAR: 67_900, BELL: 111_550, SEVEN: 223_100, CROWN: 659_600 },
        },
        {
          key: 'NEON_SEVENS',
          name: 'Neon Sevens',
          blurb: 'A louder cabinet with fewer soft landings and much bigger triples.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'NIGHTLIFE'],
          minWagerCents: 500,
          maxWagerCents: 50_000,
          wagerStepCents: 500,
          symbols: NEON_SYMBOLS,
          pairPayoutBps: { CHERRY: 5_400, BAR: 8_775, BELL: 12_150, SEVEN: 18_900, DIAMOND: 29_700, CROWN: 54_000 },
          triplePayoutBps: { CHERRY: 40_500, BAR: 81_000, BELL: 135_000, SEVEN: 270_000, DIAMOND: 540_000, CROWN: 1_215_000 },
        },
        {
          key: 'EMPIRE_GOLD',
          name: 'Empire Gold',
          blurb: 'The Empire Grand high-limit progressive. Max bet makes the three Empire stars jackpot-eligible.',
          venueKinds: ['FULL_CASINO'],
          minWagerCents: 2_500,
          maxWagerCents: 250_000,
          wagerStepCents: 2_500,
          symbols: EMPIRE_SYMBOLS,
          pairPayoutBps: { CHERRY: 5_250, BAR: 8_250, BELL: 12_000, SEVEN: 19_500, DIAMOND: 33_000, CROWN: 67_500 },
          triplePayoutBps: { CHERRY: 42_000, BAR: 82_500, BELL: 142_500, SEVEN: 285_000, DIAMOND: 600_000, CROWN: 1_500_000 },
          progressive: {
            symbolKey: 'JACKPOT',
            seedCents: 2_500_000,
            contributionBps: 100,
            eligibleWagerCents: 250_000,
          },
        },
      ],
    },
  },
} as const satisfies Ruleset;
