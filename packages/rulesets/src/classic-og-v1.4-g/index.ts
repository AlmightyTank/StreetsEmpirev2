import { classicOgV14F } from '../classic-og-v1.4-f/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.4.0-G — Balance, Admin & Release.
 *
 * Pins the faction tier thresholds and Connected nudge sizes after `qa:factions`, and ships the
 * admin/audit release gate around the 1.4 faction systems. This is a release wrapper: play values
 * stay exactly 1.4.0-F's.
 */
export const classicOgV14G = {
  ...classicOgV14F,
  meta: { id: 'classic-og-v1.4-g', version: '1.4.0-G', name: 'Classic OG - Faction Release' },
} as const satisfies Ruleset;
