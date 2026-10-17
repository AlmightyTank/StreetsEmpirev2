import { classicOgV21C } from '../classic-og-v2.1-c/index.js';
import type { Ruleset } from '../types.js';
import { UNDERWORLD_OPERATIONS_V1 } from '../underworld-operations.js';

/**
 * Opt-in cooperative operations for newly pinned rounds. Older ruleset versions
 * do not carry this catalog, and the round flag still defaults off.
 */
export const classicOgV22A = {
  ...classicOgV21C,
  meta: {
    ...classicOgV21C.meta,
    id: 'classic-og-v2.2-a',
    version: '2.2.0-A',
    name: 'Classic OG - Underworld Operations',
  },
  underworldOperations: UNDERWORLD_OPERATIONS_V1,
} satisfies Ruleset;
