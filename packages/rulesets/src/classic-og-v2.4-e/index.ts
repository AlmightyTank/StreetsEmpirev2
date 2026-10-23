import { classicOgV24D } from '../classic-og-v2.4-d/index.js';
import type { Ruleset } from '../types.js';

const partsShelf = {
  cap: 2_000,
  perInterval: 2_000,
  intervalMinutes: 24 * 60,
  stockField: 'vehiclePartsStock',
  stockAtField: 'vehiclePartsStockAt',
} as const;

/** 2.4.0-E — vehicle run fees, parts-based garage service, and Charlie's parts shelf. */
export const classicOgV24E = {
  ...classicOgV24D,
  meta: { ...classicOgV24D.meta, id: 'classic-og-v2.4-e', version: '2.4.0-E', name: 'Classic OG - Parts & Garage' },
  vehicleCatalog: {
    ...classicOgV24D.vehicleCatalog,
    classes: classicOgV24D.vehicleCatalog!.classes.map((vehicleClass) => ({
      ...vehicleClass,
      runFeeCents: vehicleClass.id === 'SEDAN' ? 3_500 : vehicleClass.id === 'LOW_RIDER' ? 6_500 : 13_000,
    })),
  },
  ammoParts: {
    ...classicOgV24D.ammoParts!,
    vehicleParts: {
      ...classicOgV24D.ammoParts!.vehicleParts,
      enabled: true,
      restockIntervalMinutes: 24 * 60,
      cashOnlyMultiplierBps: 15_000,
      cashOnlyServiceTurnsPerVehicle: 1,
      scrapYieldParts: { SEDAN: 10, LOW_RIDER: 15, VAN: 30 },
    },
  },
  stores: {
    ...classicOgV24D.stores,
    CHARLIE: {
      ...classicOgV24D.stores.CHARLIE,
      items: {
        ...classicOgV24D.stores.CHARLIE.items,
        PARTS_BOX: { name: 'Parts Box · 10 parts', field: 'vehicleParts', unitsPerOrder: 10, inventoryUnitLabel: 'parts', buyCents: 10_000, sellCents: null, restock: partsShelf },
        PARTS_CRATE: { name: 'Parts Crate · 100 parts', field: 'vehicleParts', unitsPerOrder: 100, inventoryUnitLabel: 'parts', buyCents: 80_000, sellCents: null, restock: partsShelf },
        PARTS_PALLET: { name: 'Parts Pallet · 1,000 parts', field: 'vehicleParts', unitsPerOrder: 1_000, inventoryUnitLabel: 'parts', buyCents: 700_000, sellCents: null, restock: partsShelf },
      },
    },
  },
} as const satisfies Ruleset;
