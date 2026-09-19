import { classicOgV05E } from '../classic-og-v0.5-e/index.js';
import type { Ruleset } from '../types.js';

const cities = classicOgV05E.cities;

/**
 * 0.5.0-F, the travel release. Set against the full-round simulation
 * (`runTravelRoundSimulation`, docs/TRAVEL-SIMULATION-0.5.0-F.md), where mixed play (the street,
 * the stove and runs) has to beat the street alone and running alone from every home city.
 *
 * - **Load up on the home market.** A run could only load what the home Pip's shelf holds,
 *   so living in the port or the Valley cut a crew off from what its city is known for. A
 *   run can now buy on the home high market as it leaves, straight into the trunk. Buying
 *   only: nobody sells on their own market, so cooking to sell still never pays.
 * - **Seattle** was the best street in the game and no run could beat it: its casinos pay
 *   a little less. A quiet city.
 * - **Miami Beach**: the clubs buy up Pip's ecstasy and the casinos pay a little less, so a
 *   crew living in the port has something to drive for.
 *
 * BALANCE_APPROXIMATION.
 */
export const classicOgV05F = {
  ...classicOgV05E,
  meta: { id: 'classic-og-v0.5-f', version: '0.5.0-F', name: 'Classic OG - Travel' },
  cities: {
    ...cities,
    'seattle': {
      ...cities.seattle,
      talk: [...cities.seattle.talk, "The casinos are quiet: they don't pay like they do down south."],
      districtPay: { CASINO: 0.9 },
    },
    'miami-beach': {
      ...cities['miami-beach'],
      talk: [
        'Cocaine comes off the boats cheap.',
        "The clubs on the beach pay for ecstasy, and buy up Pip's before you can.",
        'The feds watch the water, and the highway in.',
      ],
      products: { ...cities['miami-beach'].products, ECSTASY: { price: 1.5, demand: 1.25, supply: 'LOW' } },
      districtPay: { CASINO: 0.95 },
    },
  },
  travel: {
    ...classicOgV05E.travel,
    runs: { ...classicOgV05E.travel.runs, homeMarketAtLaunch: true },
  },
} as const satisfies Ruleset;
