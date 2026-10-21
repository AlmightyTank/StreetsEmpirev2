import { classicOgV24B } from '../classic-og-v2.4-b/index.js';
import type { Ruleset } from '../types.js';

const ammoShelf = {
  cap: 25_000,
  perInterval: 25_000,
  intervalMinutes: 24 * 60,
  stockField: 'ammoStock',
  stockAtField: 'ammoStockAt',
} as const;

/** 2.4.0-C — ammo packs, sell-back, daily shelf, and inventory display. */
export const classicOgV24C = {
  ...classicOgV24B,
  meta: { ...classicOgV24B.meta, id: 'classic-og-v2.4-c', version: '2.4.0-C', name: 'Classic OG - Ammo & Parts Stores' },
  ammoParts: {
    ...classicOgV24B.ammoParts!,
    enabled: true,
    ammo: { ...classicOgV24B.ammoParts!.ammo, restockIntervalMinutes: 24 * 60 },
    vehicleParts: classicOgV24B.ammoParts!.vehicleParts,
  },
  stores: {
    ...classicOgV24B.stores,
    TOMMY: {
      ...classicOgV24B.stores.TOMMY,
      items: {
        ...classicOgV24B.stores.TOMMY.items,
        AMMO_BOX: {
          name: 'Ammo Box · 100 rounds', field: 'ammo', unitsPerOrder: 100, inventoryUnitLabel: 'rounds',
          buyCents: 4_000, sellCents: 1_000, restock: ammoShelf,
        },
        AMMO_CASE: {
          name: 'Ammo Case · 1,000 rounds', field: 'ammo', unitsPerOrder: 1_000, inventoryUnitLabel: 'rounds',
          buyCents: 30_000, sellCents: 7_500, restock: ammoShelf,
        },
        AMMO_CRATE: {
          name: 'Ammo Crate · 10,000 rounds', field: 'ammo', unitsPerOrder: 10_000, inventoryUnitLabel: 'rounds',
          buyCents: 250_000, sellCents: 62_500, restock: ammoShelf,
        },
      },
    },
  },
} as const satisfies Ruleset;
