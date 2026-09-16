import { classicOgV03A } from '../classic-og-v0.3-a/index.js';
import type { Ruleset } from '../types.js';

/** 0.3.0-B keeps 0.3.0-A balance. The stage adds admin tools, not rules. */
export const classicOgV03B = {
  ...classicOgV03A,
  meta: { id: 'classic-og-v0.3-b', version: '0.3.0-B', name: 'Classic OG - Admin' },
} as const satisfies Ruleset;
