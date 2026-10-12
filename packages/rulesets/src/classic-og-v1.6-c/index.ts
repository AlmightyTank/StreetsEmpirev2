import { classicOgV16B } from '../classic-og-v1.6-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.0-C — multi-trip pickup routes. A paid order is collected in vehicle-sized loads:
 * each pickup is a run to the supplier and back, exposed to the road like any other
 * run, and what makes it home lands in the home stash. The rest waits on the order.
 */
export const classicOgV16C = {
  ...classicOgV16B,
  meta: { id: 'classic-og-v1.6-c', version: '1.6.0-C', name: 'Classic OG - Supply Pickup Routes' },
  supplyNetwork: {
    ...classicOgV16B.supplyNetwork,
    pickups: {
      // BALANCE_APPROXIMATION: three full-size open orders. Nothing leaves the stash until
      // dealer crews (1.6.0-E), so this is the ceiling on what a player can bring home.
      homeStashUnits: 30_000,
      localPickupTurns: 1,
    },
  },
} as const satisfies Ruleset;
