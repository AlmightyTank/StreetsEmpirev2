import { classicOgV08D } from '../classic-og-v0.8-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.8.0-E: Shipments foundation.
 *
 * E turns restocked store shelves into deterministic lazy-settled shipments:
 * some arrive late, some short, and a few oversized. The existing shelf clocks
 * remain the source of truth, so no background worker is required.
 */
export const classicOgV08E = {
  ...classicOgV08D,
  meta: {
    id: 'classic-og-v0.8-e',
    version: '0.8.0-E',
    name: 'Classic OG - Shipments',
  },
  storeEconomy: {
    ...classicOgV08D.storeEconomy,
    shipments: {
      enabled: true,
      seed: 'classic-og-v0.8-e-store-shipments',
      delayChancePercent: 12,
      delayMinutes: 60,
      partialChancePercent: 14,
      partialMultiplier: 0.5,
      largeChancePercent: 8,
      largeMultiplier: 1.5,
    },
  },
} as const satisfies Ruleset;
