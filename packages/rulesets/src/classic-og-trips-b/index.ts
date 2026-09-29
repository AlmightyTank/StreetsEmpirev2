import { classicOgTripsA } from '../classic-og-trips-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * Trips B: the boss rides along.
 *
 * Trips A plus `travel.trips.rideAlong`. A run can take the boss with it. With the boss
 * aboard, every town the run stops in holds it until the player drives on or heads
 * home, up to a day, and the hotel bills the run's cash by the started hour: the boss's
 * room at the city's rate plus lodging for each escort. Home is run by the lieutenant
 * the whole time the boss is on the road. Crew-only runs and solo flights are unchanged.
 */
export const classicOgTripsB = {
  ...classicOgTripsA,
  meta: {
    id: 'classic-og-trips-b',
    version: 'trips-B',
    name: 'Classic OG - Trips B (the boss rides along)',
  },
  travel: {
    ...classicOgTripsA.travel,
    trips: {
      ...classicOgTripsA.travel.trips,
      rideAlong: {
        maxStayMinutes: 1_440,
        crewCentsPerThugHour: 2_000,
      },
    },
  },
} as const satisfies Ruleset;
