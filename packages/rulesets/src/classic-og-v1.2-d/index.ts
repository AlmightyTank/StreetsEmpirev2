import type { Ruleset } from '../types.js';
import { classicOgV12C } from '../classic-og-v1.2-c/index.js';

/**
 * 1.2.0-D — Roulette, scratch cards and horse racing.
 *
 * Roulette offers American and European wheels with normal casino payouts.
 * Instant games remain server-authoritative and settle against the floor bankroll.
 */
export const classicOgV12D = {
  ...classicOgV12C,
  meta: { id: 'classic-og-v1.2-d', version: '1.2.0-D', name: 'Classic OG - Casino Instant Games' },
  casino: {
    ...classicOgV12C.casino,
    roulette: {
      tables: [
        {
          key: 'STREET_ROULETTE',
          name: 'Street Roulette',
          blurb: 'American double-zero roulette with low limits and the full inside/outside board.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND', 'NIGHTLIFE'],
          wheel: 'AMERICAN',
          minBetCents: 500,
          maxBetCents: 100_000,
          betStepCents: 500,
          maxTotalBetCents: 500_000,
        },
        {
          key: 'EURO_ROULETTE',
          name: 'European Roulette',
          blurb: 'Single-zero wheel with cleaner odds and a tighter private-room spread.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB'],
          wheel: 'EUROPEAN',
          minBetCents: 2_500,
          maxBetCents: 250_000,
          betStepCents: 2_500,
          maxTotalBetCents: 1_000_000,
        },
        {
          key: 'EMPIRE_ROULETTE',
          name: 'Empire High Limit',
          blurb: 'Single-zero high-limit roulette for the main casino floor.',
          venueKinds: ['FULL_CASINO'],
          wheel: 'EUROPEAN',
          minBetCents: 25_000,
          maxBetCents: 1_000_000,
          betStepCents: 25_000,
          maxTotalBetCents: 5_000_000,
        },
      ],
    },
    scratchCards: {
      denominationsCents: [100, 500, 1_000, 2_500, 5_000, 10_000, 50_000, 100_000],
      /** 93% RTP: 65% lose, then 1x/2x/5x/10x/25x/100x prizes. */
      payoutTiers: [
        { multiplier: 0, weight: 650 },
        { multiplier: 1, weight: 200 },
        { multiplier: 2, weight: 90 },
        { multiplier: 5, weight: 40 },
        { multiplier: 10, weight: 15 },
        { multiplier: 25, weight: 4 },
        { multiplier: 100, weight: 1 },
      ],
    },
    horseRacing: {
      minBetCents: 500,
      maxBetCents: 1_000_000,
      betStepCents: 500,
      horses: [
        { key: 'BRASS_KNUCKLES', name: 'Brass Knuckles', color: '#d7a43b', returnBps: 30_000 },
        { key: 'NIGHT_SHIFT', name: 'Night Shift', color: '#7a8cff', returnBps: 40_000 },
        { key: 'RED_LEDGER', name: 'Red Ledger', color: '#dc4f58', returnBps: 50_000 },
        { key: 'SOUTHPAW', name: 'Southpaw', color: '#44b884', returnBps: 80_000 },
        { key: 'COLD_CASH', name: 'Cold Cash', color: '#d8e2e8', returnBps: 110_000 },
        { key: 'LONG_SHOT', name: 'Long Shot', color: '#b46ee0', returnBps: 155_000 },
      ],
    },
  },
} as const satisfies Ruleset;
