import { classicOgV07V } from '../classic-og-v0.7-v/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { favorCatalog } from './favors.js';

const base = classicOgV07V.questDefinitions!;

const questDefinitions = defineQuestCatalog({
  ...base,

  WHEELS_HOME_SAFE: {
    ...base.WHEELS_HOME_SAFE,
    rewards: [
      ...base.WHEELS_HOME_SAFE.rewards,
      { kind: 'FAVOR_ITEM', key: 'WHEELS_OPEN_ROAD', amount: 1 },
    ],
  },

  VIC_CLEAN_SLATE: {
    ...base.VIC_CLEAN_SLATE,
    rewards: [
      ...base.VIC_CLEAN_SLATE.rewards,
      { kind: 'FAVOR_ITEM', key: 'VIC_CLEAN_SLATE_FAVOR', amount: 1 },
    ],
  },

  BLOCKS_OUT_OF_TOWN: {
    ...base.BLOCKS_OUT_OF_TOWN,
    rewards: [
      ...base.BLOCKS_OUT_OF_TOWN.rewards,
      { kind: 'FAVOR_ITEM', key: 'BLOCKS_STAND_DOWN', amount: 1 },
    ],
  },
});

/**
 * Phase Y-B: Legendary Favor Expansion.
 *
 * Every named contact now has a one-per-round Legendary acquisition path.
 * 0.7-W keeps all Phase Y-A content and adds action-shaped favors for Wheels,
 * Vic and Blocks without adding another persistence model.
 */
export const classicOgV07W = {
  ...classicOgV07V,
  meta: { id: 'classic-og-v0.7-w', version: '0.7.0-W', name: 'Classic OG - Legendary Favor Expansion' },
  favors: favorCatalog,
  questDefinitions,
} as const satisfies Ruleset;
