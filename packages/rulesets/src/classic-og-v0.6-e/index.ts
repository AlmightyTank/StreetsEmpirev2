import { classicOgV06D } from '../classic-og-v0.6-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-E completes Territory: three of five blocks establishes alliance city
 * control, controlling members pay no street tax there, personally held corners
 * see live passing runs, and cumulative block-time drives the Territory board and
 * Hall of Fame.
 */
export const classicOgV06E = {
  ...classicOgV06D,
  meta: { id: 'classic-og-v0.6-e', version: '0.6.0-E', name: 'Classic OG - Territory' },
  turf: {
    ...classicOgV06D.turf,
    territory: {
      cityControlShare: 0.6,
      controlledCityNoTax: true,
      cornerRunSightings: true,
    },
  },
} as const satisfies Ruleset;
