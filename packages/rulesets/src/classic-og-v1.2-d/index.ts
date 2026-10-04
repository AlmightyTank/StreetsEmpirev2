import type { Ruleset } from '../types.js';
import { classicOgV12C } from '../classic-og-v1.2-c/index.js';

/**
 * 1.2.0-D — Roulette + Street Dice.
 *
 * Roulette offers American and European wheels with normal casino payouts.
 * Street Dice follows pass-line come-out / point rules with true odds.
 */
export const classicOgV12D = {
  ...classicOgV12C,
  meta: { id: 'classic-og-v1.2-d', version: '1.2.0-D', name: 'Classic OG - Roulette & Street Dice' },
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
    streetDice: {
      tables: [
        {
          key: 'STREET_DICE',
          name: 'Street Dice',
          blurb: 'Pass-line street craps: 7/11 win the come-out, 2/3/12 lose, everything else can set the point.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND', 'NIGHTLIFE'],
          minBetCents: 1_000,
          maxBetCents: 100_000,
          betStepCents: 1_000,
          maxOddsMultiple: 3,
        },
        {
          key: 'BACK_ROOM_DICE',
          name: 'Back Room Dice',
          blurb: 'Higher-stakes point game with up to 5× true odds.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND'],
          minBetCents: 10_000,
          maxBetCents: 500_000,
          betStepCents: 5_000,
          maxOddsMultiple: 5,
        },
      ],
    },
  },
} as const satisfies Ruleset;
