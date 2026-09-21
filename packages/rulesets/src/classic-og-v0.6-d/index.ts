import { classicOgV06C } from '../classic-og-v0.6-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-D completes away turf: run-delivered outposts with remote boxes, capped
 * capture loot, a Garage-backed second run, and turf conversion when relocating.
 * Remote establishment still requires ordinary Scout presence; driving through town
 * never creates presence by itself.
 */
export const classicOgV06D = {
  ...classicOgV06C,
  meta: { id: 'classic-og-v0.6-d', version: '0.6.0-D', name: 'Classic OG - Turf Outposts' },
  hideout: {
    ...classicOgV06C.hideout!,
    rooms: {
      ...classicOgV06C.hideout!.rooms,
      GARAGE: {
        name: 'Garage',
        blurb: 'A second bay lets another crew take a Low-Rider run out while the first is still away.',
        maxLevel: 1,
        costsCents: [2_500_000],
      },
    },
    buffs: {
      ...classicOgV06C.hideout!.buffs,
      garageRunLimit: 2,
    },
  },
  turf: {
    ...classicOgV06C.turf,
    outposts: {
      cashCapCents: 25_000_000,
      beerCap: 2_000,
      productCap: 5_000,
      transferTurnCost: 2,
      lootShare: 0.25,
      lootCashCapCents: 5_000_000,
      lootBeerCap: 500,
      lootProductCap: 1_000,
    },
  },
} as const satisfies Ruleset;
