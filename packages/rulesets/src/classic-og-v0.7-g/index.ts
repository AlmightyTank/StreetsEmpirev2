import { classicOgV07F } from '../classic-og-v0.7-f/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.7.0-G enables permanent seasonal Hideout specializations and final balance/polish.
 */
export const classicOgV07G = {
  ...classicOgV07F,
  meta: { id: 'classic-og-v0.7-g', version: '0.7.0-G', name: 'Classic OG - Hideout Specializations' },
} as const satisfies Ruleset;
