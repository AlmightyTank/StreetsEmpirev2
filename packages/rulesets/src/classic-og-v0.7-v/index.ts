import { classicOgV07U } from '../classic-og-v0.7-u/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { favorCatalog } from './favors.js';
import { legendaryFavorQuests } from './legendary-favor-quests.js';

const base = classicOgV07U.questDefinitions!;

const questDefinitions = defineQuestCatalog({
  ...base,

  MAMA_HOUSE_FULL: {
    ...base.MAMA_HOUSE_FULL,
    followUpKeys: [...base.MAMA_HOUSE_FULL.followUpKeys, 'MAMA_QUIET_HOUR'],
  },

  PIP_TOP_SHELF: {
    ...base.PIP_TOP_SHELF,
    rewards: [
      ...base.PIP_TOP_SHELF.rewards,
      { kind: 'FAVOR_ITEM', key: 'PIP_BLACK_BOOK', amount: 1 },
    ],
  },

  TOMMY_FULL_RACK: {
    ...base.TOMMY_FULL_RACK,
    rewards: [
      ...base.TOMMY_FULL_RACK.rewards,
      { kind: 'FAVOR_ITEM', key: 'TOMMY_WAR_CHEST', amount: 1 },
    ],
  },

  ...legendaryFavorQuests,
});

/**
 * Phase Y-A: Rare Legendary Favors.
 *
 * 0.7-V preserves the hardened Phase W quest catalog and all Phase X runtime
 * content controls, then adds a catalog rarity plus three one-per-round
 * Legendary favor acquisition paths.
 */
export const classicOgV07V = {
  ...classicOgV07U,
  meta: { id: 'classic-og-v0.7-v', version: '0.7.0-V', name: 'Classic OG - Legendary Favors' },
  favors: favorCatalog,
  questDefinitions,
} as const satisfies Ruleset;
