import { classicOgTripsD2 } from '../classic-og-trips-d2/index.js';
import type { Ruleset } from '../types.js';

/**
 * Trips E: the release.
 *
 * Trips D2 plus the last piece of the lieutenant's bargain: the girls notice the boss is
 * gone. Whore happiness sits a point lower for every hour away (on a flight trip or riding
 * along), at most 10 points, and recovers the moment the boss is home. Everything else is
 * D2 as it was, checked by `npm run qa:trips`: travelling is a choice, not a requirement.
 */
export const classicOgTripsE = {
  ...classicOgTripsD2,
  meta: {
    id: 'classic-og-trips-e',
    version: 'trips-E',
    name: 'Classic OG - Trips (release)',
  },
  travel: {
    ...classicOgTripsD2.travel,
    trips: {
      ...classicOgTripsD2.travel.trips,
      awayHappiness: { pointsPerHour: 1, maxPoints: 10 },
    },
  },
} as const satisfies Ruleset;
