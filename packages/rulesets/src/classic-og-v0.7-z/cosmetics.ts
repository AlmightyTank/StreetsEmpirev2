import type { QuestCosmeticCatalog } from '../types.js';

/**
 * Phase Y-E site themes.
 *
 * These are presentation packs for the entire authenticated player shell.
 * They intentionally are not attached to Jobs yet; Phase Y-F seasonal/event
 * content can award the same permanent cosmetic keys without changing the
 * renderer or account settings contract.
 */
export const siteThemeCosmetics = {
  'winter-christmas-2026': {
    key: 'winter-christmas-2026',
    name: 'Winter Lights',
    description: 'A Christmas/winter site theme with string lights, falling snow, frosted edges and snowman silhouettes across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'winter-lights',
  },
  'halloween-moon-2026': {
    key: 'halloween-moon-2026',
    name: 'Halloween Moon',
    description: 'A Halloween site theme with a full moon, bats, a witch silhouette, drifting fog and dark seasonal trim across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'halloween-moon',
  },
} as const satisfies QuestCosmeticCatalog;
