import { classicOgV18J } from '../classic-og-v1.8-j/index.js';
import type { Ruleset } from '../types.js';

/** 1.8.5-G. Release tooling and event operations; gameplay rules stay pinned to F. */
export const classicOgV18K = {
  ...classicOgV18J,
  meta: {
    ...classicOgV18J.meta,
    id: 'classic-og-v1.8-k',
    version: '1.8.0-K',
    name: 'Classic OG - Event Migration and Release',
  },
} as const satisfies Ruleset;
