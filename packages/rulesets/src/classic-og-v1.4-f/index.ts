import { classicOgV14E } from '../classic-og-v1.4-e/index.js';
import type { Ruleset } from '../types.js';
import { factionCosmetics, factionTierCosmetics } from './faction-cosmetics.js';

/**
 * 1.4.0-F — Rewards & Public Flavor.
 *
 * - Cosmetics. Reaching Connected with a faction awards its title and accent; Inner Circle, its
 *   frame. Once per account, kept for good, and they change nothing in play.
 * - Public alignment. From Connected, a profile shows the tier with each faction ("The Kings ·
 *   Connected"). Points, the tiers below Connected and contract progress stay private.
 * - The street feed. Reaching Inner Circle is posted to the public Discord street feed.
 * - Season feats for faction play, on the profile like every other feat.
 *
 * Everything else is exactly 1.4.0-E's. See docs/ROADMAP-1.4.0.md.
 */
export const classicOgV14F = {
  ...classicOgV14E,
  meta: { id: 'classic-og-v1.4-f', version: '1.4.0-F', name: 'Classic OG - Faction Rewards & Public Flavor' },
  cosmetics: { ...classicOgV14E.cosmetics, ...factionCosmetics },
  factionPublic: {
    rewards: factionTierCosmetics,
    publicFrom: 'CONNECTED',
    feedFrom: 'INNER_CIRCLE',
  },
} as const satisfies Ruleset;
