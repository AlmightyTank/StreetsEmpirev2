import { classicOgV16C } from '../classic-og-v1.6-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.0-D — properties and local storage. Players buy warehouses (bounded storage in a city)
 * and safehouses (a foothold in a city: a warehouse outside home needs one). Pickups can now
 * deliver to any warehouse, driving the load there before heading home. No property makes
 * product or money; each costs a price and upkeep.
 *
 * BALANCE_APPROXIMATION throughout. Every city trades size against price and upkeep: the
 * supplier cities are close to the source, Las Vegas is cheap staging four hours from Los
 * Angeles, San Francisco is small and dear, and Detroit is big and cheap but far from the west.
 */
export const classicOgV16D = {
  ...classicOgV16C,
  meta: { id: 'classic-og-v1.6-d', version: '1.6.0-D', name: 'Classic OG - Supply Properties' },
  supplyNetwork: {
    ...classicOgV16C.supplyNetwork,
    pickups: {
      ...classicOgV16C.supplyNetwork.pickups,
      // One full-size order fits at home; anything more needs a warehouse.
      homeStashUnits: 12_000,
    },
    properties: {
      maxWarehouses: 3,
      maxSafehouses: 3,
      upkeepPeriodHours: 24,
      cities: {
        'new-york-city': { warehouse: { costCents: 24_000_000, upkeepCents: 450_000, capacityUnits: 30_000 }, safehouse: { costCents: 11_000_000, upkeepCents: 220_000 } },
        'los-angeles': { warehouse: { costCents: 22_000_000, upkeepCents: 400_000, capacityUnits: 26_000 }, safehouse: { costCents: 9_500_000, upkeepCents: 190_000 } },
        'san-francisco': { warehouse: { costCents: 26_000_000, upkeepCents: 500_000, capacityUnits: 16_000 }, safehouse: { costCents: 12_000_000, upkeepCents: 240_000 } },
        'miami-beach': { warehouse: { costCents: 20_000_000, upkeepCents: 380_000, capacityUnits: 18_000 }, safehouse: { costCents: 9_000_000, upkeepCents: 180_000 } },
        seattle: { warehouse: { costCents: 15_000_000, upkeepCents: 260_000, capacityUnits: 20_000 }, safehouse: { costCents: 6_500_000, upkeepCents: 130_000 } },
        'las-vegas': { warehouse: { costCents: 13_000_000, upkeepCents: 240_000, capacityUnits: 22_000 }, safehouse: { costCents: 6_000_000, upkeepCents: 120_000 } },
        atlanta: { warehouse: { costCents: 12_000_000, upkeepCents: 220_000, capacityUnits: 24_000 }, safehouse: { costCents: 5_500_000, upkeepCents: 110_000 } },
        detroit: { warehouse: { costCents: 11_000_000, upkeepCents: 200_000, capacityUnits: 28_000 }, safehouse: { costCents: 4_500_000, upkeepCents: 90_000 } },
      },
    },
  },
} as const satisfies Ruleset;
