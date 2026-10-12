import { classicOgV18F } from '../classic-og-v1.8-f/index.js';
import type { Ruleset } from '../types.js';

/** 1.8.5-B. Community events move to first-class event occurrences. */
export const classicOgV18G = {
  ...classicOgV18F,
  meta: {
    id: 'classic-og-v1.8-g',
    version: '1.8.0-G',
    name: 'Classic OG - Community Event System',
    eventSystem: { communityEvents: 'FIRST_CLASS' },
  },
} as const satisfies Ruleset;
