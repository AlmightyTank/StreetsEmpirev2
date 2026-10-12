import { classicOgV16D } from '../classic-og-v1.6-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.0-E — dealer crews. A crew is a few of the player's thugs posted in one district of a
 * city where the player has a foothold, holding one product from that city's storage and
 * asking a price the player sets. Crews are set up, staffed, stocked, priced, paused, moved
 * and closed here; their sales, cuts and costs settle from 1.6.0-F.
 *
 * BALANCE_APPROXIMATION throughout, for 1.6.0-I's simulation to tune. A crew of six at
 * the street price moves about 70 units an hour where demand is 1: a full 2,400-unit crew
 * sells out in a day and a half. Asking more slows it hard, asking less speeds it up.
 */
export const classicOgV16E = {
  ...classicOgV16D,
  meta: { id: 'classic-og-v1.6-e', version: '1.6.0-E', name: 'Classic OG - Dealer Crews' },
  supplyNetwork: {
    ...classicOgV16D.supplyNetwork,
    dealers: {
      maxCrews: 3,
      maxDealersPerCrew: 6,
      unitsPerDealer: 400,
      unitsPerDealerHour: 12,
      operatingCentsPerDealerHour: 1_500,
      streetPriceMultiplier: 1.6,
      priceRange: { min: 0.7, max: 2 },
      priceElasticity: 1.6,
      districtTraffic: { CASINO: 1.25, NIGHTCLUB: 1.15, URBAN_GHETTO: 1, LOW_RENT: 0.9, WINO_SLUMS: 0.75 },
      setupTurns: 4,
      tiers: [
        { key: 'ROOKIE', name: 'Rookie', minExperience: 0, cutPercent: 20, paceBonus: 0 },
        { key: 'REGULAR', name: 'Regular', minExperience: 1_000, cutPercent: 23, paceBonus: 0.15 },
        { key: 'VETERAN', name: 'Veteran', minExperience: 4_000, cutPercent: 26, paceBonus: 0.3 },
        { key: 'CONNECT', name: 'Connect', minExperience: 12_000, cutPercent: 30, paceBonus: 0.5 },
      ],
    },
  },
} as const satisfies Ruleset;
