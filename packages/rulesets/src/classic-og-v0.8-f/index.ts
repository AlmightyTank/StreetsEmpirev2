import { classicOgV08E } from '../classic-og-v0.8-e/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.8.0-F: Special Orders & Black Market foundation.
 *
 * This first F slice enables paid special sourcing for sold-out restocked
 * shelves. The sourced delivery is represented by the existing shelf clock,
 * so it persists without a background worker and cannot fulfill twice.
 */
export const classicOgV08F = {
  ...classicOgV08E,
  meta: {
    id: 'classic-og-v0.8-f',
    version: '0.8.0-F',
    name: 'Classic OG - Special Orders',
  },
  storeEconomy: {
    ...classicOgV08E.storeEconomy,
    specialOrders: {
      enabled: true,
      markupPercent: 35,
      minWaitMinutes: 30,
      waitMultiplier: 0.5,
      standingMarkupDiscountPercentPerTier: 4,
      standingWaitDiscountPercentPerTier: 5,
    },
  },
} as const satisfies Ruleset;
