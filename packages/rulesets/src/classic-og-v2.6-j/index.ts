import { classicOgV26I } from '../classic-og-v2.6-i/index.js';
import type { Ruleset } from '../types.js';

/**
 * The Board A. Adds the player-listing block, switched off: the band can be priced and tested,
 * but nothing posts, fills or renders. Every other rule is 2.6.0-I's.
 */
export const classicOgV26J = {
  ...classicOgV26I,
  meta: { ...classicOgV26I.meta, id: 'classic-og-v2.6-j', version: '2.6.0-J', name: 'Classic OG - The Board (dark)' },
  playerBoard: { enabled: false, taxPercent: 8 },
} as const satisfies Ruleset;
