import { classicOgV07B } from '../classic-og-v0.7-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.7.0-C keeps Protected Storage intact and layers Lookouts/Security on top.
 */
export const classicOgV07C = {
  ...classicOgV07B,
  meta: { id: 'classic-og-v0.7-c', version: '0.7.0-C', name: 'Classic OG - Lookouts & Security' },
} as const satisfies Ruleset;
