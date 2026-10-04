import type { Ruleset } from '../types.js';
import { classicOgV12D } from '../classic-og-v1.2-d/index.js';

/** 1.2.0-E — solo Texas Hold’em against house bots. */
export const classicOgV12E = {
  ...classicOgV12D,
  meta: { id: 'classic-og-v1.2-e', version: '1.2.0-E', name: 'Classic OG - Solo Poker' },
  casino: {
    ...classicOgV12D.casino,
    poker: {
      minBuyInCents: 1_000,
      maxBuyInCents: 100_000,
      bigBlindCents: 100,
      raiseCents: 200,
      rakeBps: 500,
      rakeCapCents: 500,
      venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND', 'NIGHTLIFE'],
    },
  },
} as const satisfies Ruleset;
