import { classicOgV18G } from '../classic-og-v1.8-g/index.js';
import type { Ruleset } from '../types.js';

/** 1.8.5-C. Seasonal event windows, progress, and claims use first-class event records. */
export const classicOgV18H = {
  ...classicOgV18G,
  meta: {
    id: 'classic-og-v1.8-h',
    version: '1.8.0-H',
    name: 'Classic OG - Seasonal Event System',
    eventSystem: { communityEvents: 'FIRST_CLASS', seasonalEvents: 'FIRST_CLASS' },
  },
} as const satisfies Ruleset;
