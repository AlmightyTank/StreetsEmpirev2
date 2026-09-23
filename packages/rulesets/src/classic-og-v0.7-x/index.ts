import { classicOgV07W } from '../classic-og-v0.7-w/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { questCosmetics } from './cosmetics.js';

const base = classicOgV07W.questDefinitions!;

const withCosmetic = (
  definition: (typeof base)[keyof typeof base],
  key: keyof typeof questCosmetics,
) => ({
  ...definition,
  rewards: [
    ...definition.rewards,
    { kind: 'COSMETIC_UNLOCK' as const, key },
  ],
});

const questDefinitions = defineQuestCatalog({
  ...base,
  MAMA_QUIET_HOUR: withCosmetic(base.MAMA_QUIET_HOUR, 'GHOST_OF_THE_BLOCK'),
  PIP_TOP_SHELF: withCosmetic(base.PIP_TOP_SHELF, 'TOP_SHELF_OPERATOR'),
  TOMMY_FULL_RACK: withCosmetic(base.TOMMY_FULL_RACK, 'FULL_RACK_ENFORCER'),
  WHEELS_HOME_SAFE: withCosmetic(base.WHEELS_HOME_SAFE, 'ROAD_KING'),
  VIC_CLEAN_SLATE: withCosmetic(base.VIC_CLEAN_SLATE, 'NO_PAPER_TRAIL'),
  BLOCKS_OUT_OF_TOWN: withCosmetic(base.BLOCKS_OUT_OF_TOWN, 'CORNER_BOSS'),
});

/**
 * Phase Y-C: Quest-Only Cosmetics.
 *
 * These rewards are permanent account prestige. They never alter combat,
 * economy, Heat, travel, turf or round starts.
 */
export const classicOgV07X = {
  ...classicOgV07W,
  meta: { id: 'classic-og-v0.7-x', version: '0.7.0-X', name: 'Classic OG - Quest Cosmetics' },
  cosmetics: questCosmetics,
  questDefinitions,
} as const satisfies Ruleset;
