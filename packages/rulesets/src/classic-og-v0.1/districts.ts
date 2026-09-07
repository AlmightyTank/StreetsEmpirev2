/**
 * The districts, shared by Scout and Work the Streets. Sections 25-27.
 *
 * BALANCE_APPROXIMATION.
 *
 * A district is two different offers depending on why you are there. Scouting
 * it is about who you can pick up; working it is about what the block pays.
 * They pull in opposite directions on purpose - the places crawling with
 * people who have nowhere else to go are the places nobody has money, and the
 * places with money have barely anyone to recruit.
 *
 * Money is not the whole story of where to work, either. A rich block is
 * watched, and a girl standing on it without somebody of yours nearby gets
 * moved along or worse. `protectionWhoresPerThug` is how many girls one thug
 * can cover here: four in the Casino, twenty in the slums where nobody cares.
 * That is what stops "work the richest district" from being the only answer -
 * the Casino pays two and a half times as much and wants five times the
 * muscle, and muscle costs a thousand dollars a head plus beer and a gun.
 */

import type { District, DistrictKey } from '../types.js';

export const districts = {
  CASINO: {
    slug: 'casino',
    name: 'Casino District',
    whoresPerTurn: 0.6,
    thugsPerTurn: 0.2,
    /** Multiplies what the crew brings in per turn worked here. */
    payMultiplier: 2.5,
    protectionWhoresPerThug: 4,
  },
  WINO_SLUMS: {
    slug: 'wino-slums',
    name: 'Wino Slums',
    whoresPerTurn: 1.8,
    thugsPerTurn: 0.7,
    payMultiplier: 0.4,
    protectionWhoresPerThug: 20,
  },
  LOW_RENT: {
    slug: 'low-rent',
    name: 'Low Rent District',
    whoresPerTurn: 1.3,
    thugsPerTurn: 0.5,
    payMultiplier: 0.7,
    protectionWhoresPerThug: 14,
  },
  NIGHTCLUB: {
    slug: 'nightclub',
    name: 'Nightclub District',
    whoresPerTurn: 1.1,
    thugsPerTurn: 0.4,
    payMultiplier: 1.5,
    protectionWhoresPerThug: 8,
  },
  URBAN_GHETTO: {
    slug: 'urban-ghetto',
    name: 'Urban Ghetto',
    whoresPerTurn: 1.5,
    thugsPerTurn: 0.9,
    payMultiplier: 0.6,
    protectionWhoresPerThug: 18,
  },
} as const satisfies { [K in DistrictKey]: District };
