import type { QuestCosmeticCatalog } from './types.js';

/**
 * Round Roll Call — Obsidian Signal: an account-permanent shell.
 * Kept outside round-pinned rulesets so even past round earners retain the look.
 * These contain presentation metadata ONLY; neither definition grants resources.
 */
export const ROUND_ROLL_CALL_FINALE = {
  themeKey: 'round-roll-call-obsidian-signal-theme',
  themeStyle: 'obsidian-signal',
  name: 'Obsidian Signal',
} as const;

export const ROUND_ROLL_CALL_FINALE_COSMETICS = {
  [ROUND_ROLL_CALL_FINALE.themeKey]: {
    key: ROUND_ROLL_CALL_FINALE.themeKey,
    name: 'Obsidian Signal · Empire Shell',
    description: 'A permanent midnight graphite, gold and ice-blue game shell earned by completing an entire Round Roll Call.',
    kind: 'SITE_THEME',
    rarity: 'legendary',
    styleKey: ROUND_ROLL_CALL_FINALE.themeStyle,
  },
} as const satisfies QuestCosmeticCatalog;
