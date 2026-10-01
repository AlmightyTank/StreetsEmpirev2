import { classicOgTripsC } from '../classic-og-trips-c/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { tripQuests } from './trip-quests.js';

/**
 * Trips D: reasons to go, and people to go with.
 *
 * Trips C plus `travel.trips.bodyguards`, the Out-of-Town Iron unlock and four jobs that
 * only happen in person. The boss can fly with up to a dozen bodyguards: fit thugs out of
 * home, a ticket each, lodged by the hour, and unarmed off the plane. With Tommy's
 * out-of-town connect (earned by flying to Detroit for him) they can rent guns in town,
 * one each, handed back at check-out. Bodyguards fight a hit on the boss; a boss with no
 * one standing is robbed as before.
 */
export const classicOgTripsD = {
  ...classicOgTripsC,
  meta: {
    id: 'classic-og-trips-d',
    version: 'trips-D',
    name: 'Classic OG - Trips D (reasons to go)',
  },
  travel: {
    ...classicOgTripsC.travel,
    trips: {
      ...classicOgTripsC.travel.trips,
      bodyguards: {
        max: 12,
        ticketCents: 100_000,
        lodgingCentsPerThugHour: 2_000,
        // 40% of Tommy's price for one stay: never free, never the gun.
        gunRentCents: { PISTOL: 2_000, SHOTGUN: 18_000, TEK9: 50_000, AK47: 140_000 },
        gunConnectUnlockKey: 'OUT_OF_TOWN_IRON',
      },
    },
  },
  permanentUnlocks: {
    ...classicOgTripsC.permanentUnlocks,
    OUT_OF_TOWN_IRON: {
      key: 'OUT_OF_TOWN_IRON',
      name: 'Out-of-Town Iron',
      description: 'Tommy’s people in every city will rent guns to your bodyguards when the boss flies in.',
      category: 'TRAVEL',
      effect: { kind: 'GUN_CONNECT' },
    },
  },
  questDefinitions: defineQuestCatalog({
    ...classicOgTripsC.questDefinitions!,
    ...tripQuests,
  }),
} as const satisfies Ruleset;
