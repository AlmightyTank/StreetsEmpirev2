import { classicOgV08H } from '../classic-og-v0.8-h/index.js';
import type { Ruleset } from '../types.js';

/**
 * Trips A: the boss travels.
 *
 * 0.8.0-H balance plus `travel.trips`. The boss can fly alone to any other city for a
 * hotel stay and fly home again. Home keeps working, run by a lieutenant who skims a
 * share of every Scout and Produce take until the boss is back. Nothing else changes:
 * a round where nobody travels plays exactly like 0.8.0-H.
 */
export const classicOgTripsA = {
  ...classicOgV08H,
  meta: {
    id: 'classic-og-trips-a',
    version: 'trips-A',
    name: 'Classic OG - Trips A (the boss travels)',
  },
  travel: {
    ...classicOgV08H.travel,
    trips: {
      flightMinutes: 45,
      ticketCents: 250_000,
      carryOnCapCents: 25_000_000,
      stayMinutes: [120, 360, 720],
      maxStayMinutes: 1_440,
      extendMinutes: 120,
      hotelCentsPerHour: 50_000,
      hotelPrice: {
        'new-york-city': 1.5,
        'miami-beach': 1.2,
        seattle: 0.9,
        detroit: 0.6,
        'beverly-hills': 2,
        'las-vegas': 0.6,
        'los-angeles': 1.1,
        atlanta: 0.8,
      },
      launchTurns: 5,
      lieutenantCut: 0.1,
      cutoffHours: 12,
    },
  },
} as const satisfies Ruleset;
