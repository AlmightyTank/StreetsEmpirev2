import { classicOgV04A } from '../classic-og-v0.4-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.4.0-B keeps 0.4.0-A balance and adds work supply: a primary, fallback and
 * emergency product per job, or strict supply, with trips split by product.
 *
 * Every product burns at crack's rate and pays like crack, and a dry slice
 * pays the same as a supplied one, so a crack-only player sees no change.
 * Products' own effects, and the cost of running dry, arrive in 0.4.0-C.
 */
export const classicOgV04B = {
  ...classicOgV04A,
  meta: { id: 'classic-og-v0.4-b', version: '0.4.0-B', name: 'Classic OG - Work Supply' },
  workSupply: {
    productPerWhorePerTurn: classicOgV04A.scouting.consumption.crackPerWhorePerTurn,
    dryTakeMultiplier: 1,
  },
} as const satisfies Ruleset;
