import { classicOgV14C } from '../classic-og-v1.4-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.4.0-C2 — Sponsored Contract Balance.
 *
 * Keeps the 1.4-C contract sponsorship rules and raises the board standing enough that
 * focused faction play can move through the middle tiers during a normal season. The
 * tier curve is also softened slightly at Trusted and Connected while Inner Circle
 * remains a focused-season goal instead of a one-time Job payout.
 */
export const classicOgV14C2 = {
  ...classicOgV14C,
  meta: { id: 'classic-og-v1.4-c2', version: '1.4.0-C2', name: 'Classic OG - Sponsored Contract Balance' },
  factionStanding: {
    ...classicOgV14C.factionStanding,
    tiers: { known: 25, trusted: 70, connected: 140, innerCircle: 300 },
  },
  contractSponsors: {
    ...classicOgV14C.contractSponsors,
    standing: { DAILY: 3, WEEKLY: 8, CITY_CONTRACT: 2, SEASON: 24, ALLIANCE: 8 },
    knownLean: 2,
  },
} as const satisfies Ruleset;
