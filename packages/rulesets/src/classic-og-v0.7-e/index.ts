import { classicOgV07D } from '../classic-og-v0.7-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.7.0-E keeps Workshop/Garage intact and layers Back Office ledger visibility on top.
 */
export const classicOgV07E = {
  ...classicOgV07D,
  meta: { id: 'classic-og-v0.7-e', version: '0.7.0-E', name: 'Classic OG - Back Office & Ledger' },
} as const satisfies Ruleset;
