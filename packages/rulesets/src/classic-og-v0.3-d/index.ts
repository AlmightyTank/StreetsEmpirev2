import { classicOgV03C } from '../classic-og-v0.3-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.3.0-D keeps 0.3.0-C balance and lets alliances play together: fresh recon
 * is shared with every current member. The wire and contacts need no numbers.
 */
export const classicOgV03D = {
  ...classicOgV03C,
  meta: { id: 'classic-og-v0.3-d', version: '0.3.0-D', name: 'Classic OG - Playing Together' },
  alliances: {
    ...classicOgV03C.alliances,
    sharedIntel: true,
  },
} as const satisfies Ruleset;
