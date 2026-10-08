import { classicOgV15E } from '../classic-og-v1.5-e/index.js';
import type { Ruleset } from '../types.js';

const charlie = classicOgV15E.stores.CHARLIE;
const quests = classicOgV15E.questDefinitions;

/**
 * 1.5.0-E2 — Charlie's Fleet.
 *
 * Sedans and Vans move from the Travel garage onto Charlie's shelf, at their 1.5 prices, and
 * each waits for a job from Wheels: Pack Your Bags (the first real run) opens Sedans, and
 * Heavy Haul (real capacity on the road) opens Vans. Charlie never buys them back. Owning,
 * driving and servicing them is unchanged; every other value is 1.5.0-E's.
 */
export const classicOgV15E2 = {
  ...classicOgV15E,
  meta: { id: 'classic-og-v1.5-e2', version: '1.5.0-E2', name: "Classic OG - Charlie's Fleet" },
  stores: {
    ...classicOgV15E.stores,
    CHARLIE: {
      ...charlie,
      blurb: 'Each Low-Rider can transport 6 Thugs. Charlie builds them one at a time, and sells Sedans and Vans to crews Wheels vouches for.',
      items: {
        ...charlie.items,
        SEDAN: { name: 'Sedan', field: 'sedans', vehicleClass: 'SEDAN', buyCents: 350_000, sellCents: null, restock: null },
        VAN: { name: 'Van', field: 'vans', vehicleClass: 'VAN', buyCents: 850_000, sellCents: null, restock: null },
      },
    },
  },
  permanentUnlocks: {
    ...classicOgV15E.permanentUnlocks,
    VEHICLE_SEDAN_ACCESS: {
      key: 'VEHICLE_SEDAN_ACCESS',
      name: 'Sedan Access',
      description: 'Charlie will sell you Sedans for the rest of this round.',
      category: 'VEHICLE',
      effect: { kind: 'VEHICLE_PURCHASE_ACCESS', classId: 'SEDAN' },
    },
    VEHICLE_VAN_ACCESS: {
      key: 'VEHICLE_VAN_ACCESS',
      name: 'Van Access',
      description: 'Charlie will sell you Vans for the rest of this round.',
      category: 'VEHICLE',
      effect: { kind: 'VEHICLE_PURCHASE_ACCESS', classId: 'VAN' },
    },
  },
  questDefinitions: {
    ...quests,
    PACK_YOUR_BAGS: {
      ...quests.PACK_YOUR_BAGS,
      rewards: [...quests.PACK_YOUR_BAGS.rewards, { kind: 'PERMANENT_UNLOCK', key: 'VEHICLE_SEDAN_ACCESS' }],
    },
    WHEELS_HEAVY_HAUL: {
      ...quests.WHEELS_HEAVY_HAUL,
      rewards: [...quests.WHEELS_HEAVY_HAUL.rewards, { kind: 'PERMANENT_UNLOCK', key: 'VEHICLE_VAN_ACCESS' }],
    },
  },
} as const satisfies Ruleset;
