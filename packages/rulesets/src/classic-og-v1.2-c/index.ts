import type { Ruleset } from '../types.js';
import { classicOgV12B } from '../classic-og-v1.2-b/index.js';

/**
 * 1.2.0-C — Blackjack.
 *
 * All tables use a house-dealt shoe and conventional 3:2 natural blackjack.
 * Table identity changes only limits / shoe size / house soft-17 rule.
 */
export const classicOgV12C = {
  ...classicOgV12B,
  meta: { id: 'classic-og-v1.2-c', version: '1.2.0-C', name: 'Classic OG - Blackjack' },
  casino: {
    ...classicOgV12B.casino,
    blackjack: {
      tables: [
        {
          key: 'STREET_BLACKJACK',
          name: 'Street Blackjack',
          blurb: 'Low-limit blackjack found in every casino room. Six decks, dealer stands on soft 17.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND', 'NIGHTLIFE'],
          minBetCents: 1_000,
          maxBetCents: 100_000,
          betStepCents: 1_000,
          decks: 6,
          reshuffleAtRemainingCards: 78,
          dealerHitsSoft17: false,
          blackjackPayout: { numerator: 3, denominator: 2 },
          allowDoubleAfterSplit: true,
          maxSplitHands: 4,
          splitAcesOneCard: true,
        },
        {
          key: 'NEON_BLACKJACK',
          name: 'Neon Blackjack',
          blurb: 'A private table with higher limits and a four-deck shoe.',
          venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'NIGHTLIFE'],
          minBetCents: 10_000,
          maxBetCents: 500_000,
          betStepCents: 5_000,
          decks: 4,
          reshuffleAtRemainingCards: 52,
          dealerHitsSoft17: false,
          blackjackPayout: { numerator: 3, denominator: 2 },
          allowDoubleAfterSplit: true,
          maxSplitHands: 4,
          splitAcesOneCard: true,
        },
        {
          key: 'EMPIRE_HIGH_LIMIT',
          name: 'Empire High Limit',
          blurb: 'The Vegas high-limit pit. Two decks; dealer hits soft 17.',
          venueKinds: ['FULL_CASINO'],
          minBetCents: 100_000,
          maxBetCents: 2_500_000,
          betStepCents: 25_000,
          decks: 2,
          reshuffleAtRemainingCards: 34,
          dealerHitsSoft17: true,
          blackjackPayout: { numerator: 3, denominator: 2 },
          allowDoubleAfterSplit: true,
          maxSplitHands: 4,
          splitAcesOneCard: true,
        },
      ],
    },
  },
} as const satisfies Ruleset;
