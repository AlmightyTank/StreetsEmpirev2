import { classicOgV16E } from '../classic-og-v1.6-e/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.0-F — sales, restocking and the ledger. Working crews sell on the server's clock in
 * whole hours: stock out, cash in after the dealers' cut and wages, experience to the
 * dealers who sold it. Police-heavy cities sell slower. Stock moves between warehouses
 * only by run, so restocking a crew in another city takes a shipment and the cars for it.
 *
 * BALANCE_APPROXIMATION, for 1.6.0-I's simulation to tune.
 */
export const classicOgV16F = {
  ...classicOgV16E,
  meta: { id: 'classic-og-v1.6-f', version: '1.6.0-F', name: 'Classic OG - Dealer Sales' },
  supplyNetwork: {
    ...classicOgV16E.supplyNetwork,
    pickups: { ...classicOgV16E.supplyNetwork.pickups, shipments: true },
    dealers: {
      ...classicOgV16E.supplyNetwork.dealers,
      // San Francisco's 1.6 pressure sells at about 79% pace; Atlanta's 0.6 at about 129%.
      pressureWeight: 0.5,
      sales: { intervalMinutes: 60, maxBatchIntervals: 24, experiencePerUnit: 1 },
    },
  },
} as const satisfies Ruleset;
