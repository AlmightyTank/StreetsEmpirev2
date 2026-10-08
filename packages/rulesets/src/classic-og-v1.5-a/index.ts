import { classicOgV14G } from '../classic-og-v1.4-g/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.5.0-A — Fleet Foundation.
 * Adds stable vehicle class identities while preserving all 1.4.0-G play values.
 * Existing Low-Riders remain the source of vehicle counts until class-based
 * acquisition and dispatch arrive in later slices.
 */
export const classicOgV15A = {
  ...classicOgV14G,
  meta: { id: 'classic-og-v1.5-a', version: '1.5.0-A', name: 'Classic OG - Fleet Foundation' },
  vehicleCatalog: {
    classes: [
      {
        id: 'LOW_RIDER',
        name: 'Low-Rider',
        description: 'The familiar all-purpose ride. Existing vehicles keep their current travel and street-work behavior.',
        legacyResource: 'lowRiders',
      },
    ],
  },
} as const satisfies Ruleset;
