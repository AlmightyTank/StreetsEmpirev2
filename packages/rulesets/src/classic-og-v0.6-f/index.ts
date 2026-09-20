import { classicOgV06E } from '../classic-og-v0.6-e/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-F is the Turf release ruleset. It starts from the completed Territory
 * balance unchanged; F's remaining work is release simulation, the seeded
 * crackdown, UI/phone polish and regression coverage.
 */
export const classicOgV06F = {
  ...classicOgV06E,
  meta: { id: 'classic-og-v0.6-f', version: '0.6.0-F', name: 'Classic OG - Turf Release' },
} as const satisfies Ruleset;
