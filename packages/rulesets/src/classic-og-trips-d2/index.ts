import { classicOgTripsD } from '../classic-og-trips-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * Trips D2: more reasons to go, and a little help when you do.
 *
 * Trips D plus four pieces. Airport security reads Heat: from 40 Heat a boss can be pulled
 * aside on the way out (a point more chance per Heat, at most half), losing 30% of the
 * carried bankroll and 30 minutes; from 90 Heat nobody lets them fly. A boss in town can
 * walk an outpost they hold there: its crew stays put for a day whatever the box holds, and
 * a boss who flew in can carry the box's cash home in the bankroll. Two bosses in the same
 * city can sit down and agree a day's truce. And allies who live where a boss is hit can
 * send backup once the boss calls, as they can for a convoy.
 */
export const classicOgTripsD2 = {
  ...classicOgTripsD,
  meta: {
    id: 'classic-og-trips-d2',
    version: 'trips-D2',
    name: 'Classic OG - Trips D2 (help and handshakes)',
  },
  travel: {
    ...classicOgTripsD.travel,
    trips: {
      ...classicOgTripsD.travel.trips,
      airport: {
        checkFromHeat: 40,
        chancePerHeat: 0.01,
        maxChance: 0.5,
        seizePercent: 30,
        delayMinutes: 30,
        noFlyHeat: 90,
      },
      outpostVisits: { moraleHours: 24 },
      sitDowns: { inviteMinutes: 30, truceHours: 24 },
      allyBackup: true,
    },
  },
} as const satisfies Ruleset;
