import { classicOgV07E } from '../classic-og-v0.7-e/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.7.0-F keeps the economic command center intact and adds Armory/Infirmary support.
 */
export const classicOgV07F = {
  ...classicOgV07E,
  meta: { id: 'classic-og-v0.7-f', version: '0.7.0-F', name: 'Classic OG - Armory & Infirmary' },
} as const satisfies Ruleset;
