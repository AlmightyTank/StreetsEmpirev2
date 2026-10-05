import { classicOgTripsE } from '../classic-og-trips-e/index.js';
import { STREET_PASS_S1, STREET_PASS_S1_COSMETICS } from '../street-pass.js';
import type { Ruleset } from '../types.js';

/**
 * Street Pass A: the release.
 *
 * Trips E plus the free Street Pass, Season 1: 30 tiers of Cred-earned rewards
 * (cash, crew, guns, product and favors), with permanent Fresh Face, Made Man
 * and Kingpin titles, the Night Drive theme, the Chrome Halo frame and the
 * Season 1 badge and frame. Balance is checked by
 * `npm run qa:street-pass`; see docs/STREET-PASS.md.
 */
export const classicOgStreetPassA = {
  ...classicOgTripsE,
  meta: {
    id: 'classic-og-street-pass-a',
    version: 'street-pass-A',
    name: 'Classic OG - Street Pass (Season 1)',
  },
  cosmetics: {
    ...classicOgTripsE.cosmetics,
    ...STREET_PASS_S1_COSMETICS,
  },
  streetPass: STREET_PASS_S1,
} as const satisfies Ruleset;
