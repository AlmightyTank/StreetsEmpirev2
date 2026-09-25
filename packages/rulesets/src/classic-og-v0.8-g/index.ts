import { classicOgV08F } from '../classic-og-v0.8-f/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.8.0-G: System Integration foundation.
 *
 * G exposes Store integration context for Hideout, Turf, Travel, and Convoys.
 * The only mechanical bonus in this slice is modest and capped: held local
 * turf can reduce special-order sourcing fees.
 */
export const classicOgV08G = {
  ...classicOgV08F,
  meta: {
    id: 'classic-og-v0.8-g',
    version: '0.8.0-G',
    name: 'Classic OG - Store System Integration',
  },
  storeEconomy: {
    ...classicOgV08F.storeEconomy,
    integrations: {
      enabled: true,
      turfSpecialOrderDiscountPercentPerBlock: 2,
      maxTurfSpecialOrderDiscountPercent: 10,
      travelOpportunityMinProfitPercent: 10,
    },
  },
} as const satisfies Ruleset;
