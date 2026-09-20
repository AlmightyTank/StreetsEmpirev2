import { classicOgV06D } from '../classic-og-v0.6-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-E starts alliance territory: three of a city's five blocks establishes
 * control. Control is public on the map and alliance members stop paying street
 * tax in that city. Later E slices add passive run sightings and the territory board.
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
