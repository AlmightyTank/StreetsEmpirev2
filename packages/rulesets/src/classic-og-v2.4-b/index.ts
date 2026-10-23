import { classicOgV24A } from '../classic-og-v2.4-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 2.4.0-B — Ammo & Parts data foundation.
 * The versioned catalog is present for validation and future slices, but stays
 * disabled until buying and combat/garage spending ship. Earlier rounds remain
 * pinned to their original ruleset snapshot.
 */
export const classicOgV24B = {
  ...classicOgV24A,
  meta: { ...classicOgV24A.meta, id: 'classic-og-v2.4-b', version: '2.4.0-B', name: 'Classic OG - Ammo & Parts Foundation' },
  ammoParts: {
    enabled: false,
    catalogVersion: 'ammo-parts-v1',
    ammo: {
      costPerRoundCents: 30,
      roundsPerFight: { PISTOL: 12, SHOTGUN: 30, TEK9: 90, AK47: 180 },
      defenderFloor: 10,
      lootShareBps: 1_500,
      sellbackBps: 2_500,
      storeStockCap: 25_000,
      packs: [
        { key: 'box', rounds: 100, priceCents: 4_000 },
        { key: 'case', rounds: 1_000, priceCents: 30_000 },
        { key: 'crate', rounds: 10_000, priceCents: 250_000 },
      ],
    },
    vehicleParts: {
      storeStockCap: 2_000,
      packs: [
        { key: 'box', parts: 10, priceCents: 10_000 },
        { key: 'crate', parts: 100, priceCents: 80_000 },
        { key: 'pallet', parts: 1_000, priceCents: 700_000 },
      ],
      repairs: {
        SEDAN: { damagedParts: 5, damagedCashCents: 25_000, disabledParts: 20, disabledCashCents: 70_000 },
        LOW_RIDER: { damagedParts: 10, damagedCashCents: 40_000, disabledParts: 40, disabledCashCents: 100_000 },
        VAN: { damagedParts: 20, damagedCashCents: 70_000, disabledParts: 80, disabledCashCents: 170_000 },
      },
    },
  },
} as const satisfies Ruleset;
