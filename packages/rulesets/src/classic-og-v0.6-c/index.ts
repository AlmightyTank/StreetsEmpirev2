import { classicOgV06B } from '../classic-og-v0.6-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-C turns player-vs-player turf wars on without changing B's holding
 * economy. Warning, shield, cooldown and reinforcement numbers were already
 * balanced in A; C is the stage that begins reading them.
 */
export const classicOgV06C = {
  ...classicOgV06B,
  meta: { id: 'classic-og-v0.6-c', version: '0.6.0-C', name: 'Classic OG - Turf Wars' },
  turf: {
    ...classicOgV06B.turf,
    wars: true,
  },
} as const satisfies Ruleset;
