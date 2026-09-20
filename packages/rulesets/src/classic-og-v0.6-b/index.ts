import { classicOgV06A } from '../classic-og-v0.6-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-B turns A's turf map into playable home turf. Balance stays exactly
 * where A's simulation put it; this stage only enables Holding behavior.
 */
export const classicOgV06B = {
  ...classicOgV06A,
  meta: { id: 'classic-og-v0.6-b', version: '0.6.0-B', name: 'Classic OG - Turf Holding' },
  turf: { ...classicOgV06A.turf, holding: true },
} as const satisfies Ruleset;
