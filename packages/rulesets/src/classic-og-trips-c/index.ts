import { classicOgTripsB } from '../classic-og-trips-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * Trips C: the boss is hunted.
 *
 * Trips B plus `travel.trips.hunted`. Locals can find a boss visiting their city with an
 * area recon and hit them on the convoy clock; a solo boss is spotted half the time and
 * has nobody to fight back. A beaten boss loses part of the bankroll, flies home and is
 * laid up for four hours: no trips and no riding along, and the lieutenant keeps the
 * skim. A convoy hit that beats a run with the boss aboard lays the boss up too and
 * sends the run home. Home defends raids at 95% while the boss is away or laid up.
 */
export const classicOgTripsC = {
  ...classicOgTripsB,
  meta: {
    id: 'classic-og-trips-c',
    version: 'trips-C',
    name: 'Classic OG - Trips C (the boss is hunted)',
  },
  travel: {
    ...classicOgTripsB.travel,
    trips: {
      ...classicOgTripsB.travel.trips,
      hunted: {
        soloSightChance: 0.5,
        bankrollPercent: { min: 25, max: 60 },
        layUpMinutes: 240,
        awayDefenseMultiplier: 0.95,
      },
    },
  },
} as const satisfies Ruleset;
