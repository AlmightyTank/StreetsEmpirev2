import { classicOgV06F } from '../classic-og-v0.6-f/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.7.0-A starts Hideout Foundation 2.0 without changing 0.6 release balance.
 * The versioned requirement/specialization extension lives in hideout-v2.ts,
 * so every older pinned ruleset keeps its original behavior.
 */
export const classicOgV07A = {
  ...classicOgV06F,
  meta: { id: 'classic-og-v0.7-a', version: '0.7.0-A', name: 'Classic OG - Hideout Foundation 2.0' },
} as const satisfies Ruleset;
