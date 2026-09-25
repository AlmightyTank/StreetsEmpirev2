import { classicOgV08G } from '../classic-og-v0.8-g/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.8.0-H: Store Economy release hardening.
 *
 * H keeps the G integration surface and tightens the release balance around
 * special sourcing and shipment variance so the final 0.8 economy remains
 * useful without turning relationship or turf bonuses into arbitrage.
 */
export const classicOgV08H = {
  ...classicOgV08G,
  meta: {
    id: 'classic-og-v0.8-h',
    version: '0.8.0-H',
    name: 'Classic OG - Store Economy Release',
  },
  storeEconomy: {
    ...classicOgV08G.storeEconomy,
    shipments: {
      ...classicOgV08G.storeEconomy.shipments!,
      delayChancePercent: 10,
      partialChancePercent: 12,
      largeChancePercent: 6,
    },
    specialOrders: {
      ...classicOgV08G.storeEconomy.specialOrders!,
      markupPercent: 40,
      minWaitMinutes: 45,
      waitMultiplier: 0.6,
    },
    integrations: {
      ...classicOgV08G.storeEconomy.integrations!,
      maxTurfSpecialOrderDiscountPercent: 8,
      travelOpportunityMinProfitPercent: 12,
    },
  },
} as const satisfies Ruleset;
