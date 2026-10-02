import { classicOgV11C } from '../classic-og-v1.1-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.1.0-D puts block wars in play. A block held by the locals is still a single claim
 * fight; a block held by a player is taken by a war: declare, an opening fight, a siege
 * that builds Control, break attempts, and an end by Control, concession, withdrawal or
 * the time limit, for a Take or a Sack. One ally per side who is online and answers, a
 * cut of the winnings the caller sets, war fatigue, block tiers, torching, and dormancy
 * under the locals. The numbers are A's first-pass values; D adds only the loot and Heat
 * a Sack and a torch carry.
 */
export const classicOgV11D = {
  ...classicOgV11C,
  meta: { id: 'classic-og-v1.1-d', version: '1.1.0-D', name: 'Classic OG - Block Wars' },
  business: {
    ...classicOgV11C.business,
    wars: {
      ...classicOgV11C.business.wars,
      enabled: true,
      // The 0.6.0-D outpost loot shape: a quarter of the registers in A, half here because a
      // Sack costs a whole war; capped at the outpost loot cap.
      sackLootShare: 0.5,
      sackLootCapCents: 5_000_000,
      sackHeat: 15,
      torchHeat: 10,
    },
  },
} as const satisfies Ruleset;
