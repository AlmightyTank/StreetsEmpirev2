import { classicOgV07A } from '../classic-og-v0.7-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.7.0-B keeps the 0.7-A room prices and progression gates, then turns the
 * Safe Room into a capped asset-protection layer for the product economy.
 */
export const classicOgV07B = {
  ...classicOgV07A,
  meta: { id: 'classic-og-v0.7-b', version: '0.7.0-B', name: 'Classic OG - Protected Storage' },
} as const satisfies Ruleset;
