import { classicOgV02H } from '../classic-og-v0.2-h/index.js';
import type { Ruleset } from '../types.js';

/** 0.3.0-A keeps 0.2.0-H balance and adds server-side season endings. */
export const classicOgV03A = {
  ...classicOgV02H,
  meta: { id: 'classic-og-v0.3-a', version: '0.3.0-A', name: 'Classic OG - Season End' },
} as const satisfies Ruleset;
