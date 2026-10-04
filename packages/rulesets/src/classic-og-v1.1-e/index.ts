import { classicOgV11D } from '../classic-og-v1.1-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.1.0-E puts businesses on 0.6.0-D outposts. Away fronts use the existing
 * distance penalty, burn the outpost box's supplies, and sweep their registers
 * into that box so a run has to collect the money. Once a run picks it up it is
 * ordinary run cash, including the existing convoy exposure and caps.
 */
export const classicOgV11E = {
  ...classicOgV11D,
  meta: { id: 'classic-og-v1.1-e', version: '1.1.0-E', name: 'Classic OG - Outpost Businesses' },
  business: {
    ...classicOgV11D.business,
    outposts: true,
  },
} as const satisfies Ruleset;
