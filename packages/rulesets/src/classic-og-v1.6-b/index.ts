import { classicOgV16A } from '../classic-og-v1.6-a/index.js';
import type { Ruleset } from '../types.js';

/** 1.6.0-B — prepaid bulk orders at finite, round-wide suppliers. */
export const classicOgV16B = {
  ...classicOgV16A,
  meta: { id: 'classic-og-v1.6-b', version: '1.6.0-B', name: 'Classic OG - Prepaid Supply Orders' },
  supplyNetwork: {
    enabled: true,
    maxOpenOrders: 3,
    suppliers: [
      {
        key: 'west-coast-depot',
        name: 'West Coast Depot',
        citySlug: 'los-angeles',
        description: 'A large regional supplier with a limited seasonal allotment.',
        offers: {
          WEED: { unitCostCents: 650, minOrderQuantity: 100, maxOrderQuantity: 10_000, stockPerRound: 40_000 },
          ECSTASY: { unitCostCents: 2_500, minOrderQuantity: 100, maxOrderQuantity: 8_000, stockPerRound: 24_000 },
          COCAINE: { unitCostCents: 3_400, minOrderQuantity: 100, maxOrderQuantity: 8_000, stockPerRound: 24_000 },
          METH: { unitCostCents: 1_300, minOrderQuantity: 100, maxOrderQuantity: 8_000, stockPerRound: 24_000 },
          HEROIN: { unitCostCents: 1_300, minOrderQuantity: 100, maxOrderQuantity: 8_000, stockPerRound: 24_000 },
        },
      },
      {
        key: 'great-lakes-depot',
        name: 'Great Lakes Depot',
        citySlug: 'detroit',
        description: 'A smaller regional source with a different mix and tighter supply.',
        offers: {
          WEED: { unitCostCents: 700, minOrderQuantity: 100, maxOrderQuantity: 8_000, stockPerRound: 28_000 },
          COCAINE: { unitCostCents: 3_650, minOrderQuantity: 100, maxOrderQuantity: 6_000, stockPerRound: 18_000 },
          METH: { unitCostCents: 1_400, minOrderQuantity: 100, maxOrderQuantity: 6_000, stockPerRound: 18_000 },
          HEROIN: { unitCostCents: 1_400, minOrderQuantity: 100, maxOrderQuantity: 6_000, stockPerRound: 18_000 },
        },
      },
    ],
  },
} as const satisfies Ruleset;
