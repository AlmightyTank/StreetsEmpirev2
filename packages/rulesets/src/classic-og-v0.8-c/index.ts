import { classicOgV07AA } from '../classic-og-v0.7-aa/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.8.0-C: Dynamic Store Economy foundation.
 *
 * A/B added API and UI affordances without changing season balance. C opts the
 * next ruleset into local pressure for Pip's product counter so repeated buying
 * and selling moves the next quote while older pinned rounds stay exact.
 */
export const classicOgV08C = {
  ...classicOgV07AA,
  meta: {
    id: 'classic-og-v0.8-c',
    version: '0.8.0-C',
    name: 'Classic OG - Dynamic Store Economy',
  },
  storeEconomy: {
    pipProductPressure: {
      enabled: true,
      maxPricePressure: 0.25,
    },
  },
} as const satisfies Ruleset;
