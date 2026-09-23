import { classicOgV07Y } from '../classic-og-v0.7-y/index.js';
import type { QuestCosmeticCatalog, Ruleset } from '../types.js';
import { siteThemeCosmetics } from './cosmetics.js';

const cosmetics = {
  ...classicOgV07Y.cosmetics!,
  ...siteThemeCosmetics,
} as const satisfies QuestCosmeticCatalog;

/**
 * Phase Y-E: Player-Facing Site Themes / Decor.
 *
 * The theme catalog is intentionally acquisition-neutral. Phase Y-F will tie
 * holiday/event rewards to these permanent keys.
 */
export const classicOgV07Z = {
  ...classicOgV07Y,
  meta: { id: 'classic-og-v0.7-z', version: '0.7.0-Z', name: 'Classic OG - Site Themes & Decor' },
  cosmetics,
} as const satisfies Ruleset;
