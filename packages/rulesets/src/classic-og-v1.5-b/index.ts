import { classicOgV15A } from '../classic-og-v1.5-a/index.js';
import type { Ruleset } from '../types.js';

/** 1.5.0-B — Vehicle Classes & Run Loadouts. */
export const classicOgV15B = {
  ...classicOgV15A,
  meta: { id: 'classic-og-v1.5-b', version: '1.5.0-B', name: 'Classic OG - Vehicle Classes & Run Loadouts' },
  vehicleCatalog: {
    classes: [
      {
        id: 'LOW_RIDER',
        name: 'Low-Rider',
        description: 'The familiar all-purpose ride, with balanced cargo and crew capacity.',
        legacyResource: 'lowRiders',
        cargoPercent: 100,
        crewSeats: null,
        purchasePriceCents: null,
        routeProfile: 'NORMAL',
      },
      {
        id: 'SEDAN',
        name: 'Sedan',
        description: 'A smaller, lower-profile car for lighter, quieter runs.',
        legacyResource: 'sedans',
        cargoPercent: 65,
        crewSeats: 4,
        purchasePriceCents: 350_000,
        routeProfile: 'LOW_PROFILE',
      },
      {
        id: 'VAN',
        name: 'Van',
        description: 'A practical hauler with extra trunk space and higher visibility.',
        legacyResource: 'vans',
        cargoPercent: 150,
        crewSeats: null,
        purchasePriceCents: 850_000,
        routeProfile: 'HIGH_VISIBILITY',
      },
    ],
  },
} as const satisfies Ruleset;
