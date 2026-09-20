import { classicOgV06C } from '../classic-og-v0.6-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-D turns away turf into an outpost with its own box.
 *
 * This first D slice only pins the storage/transfer balance contract. Establishing and
 * supplying an outpost through a run follows in the next slice so the remote-presence
 * rule can be decided deliberately rather than hidden inside persistence code.
 */
export const classicOgV06D = {
  ...classicOgV06C,
  meta: { id: 'classic-og-v0.6-d', version: '0.6.0-D', name: 'Classic OG - Turf Outposts' },
  turf: {
    ...classicOgV06C.turf,
    outposts: {
      cashCapCents: 25_000_000,
      beerCap: 2_000,
      productCap: 5_000,
      transferTurnCost: 2,
    },
  },
} as const satisfies Ruleset;
