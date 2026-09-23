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
  MAMA_QUIET_HOUR: withCosmetic(base.MAMA_QUIET_HOUR, 'ghost-of-the-block'),
  PIP_TOP_SHELF: withCosmetic(base.PIP_TOP_SHELF, 'top-shelf-operator'),
  TOMMY_FULL_RACK: withCosmetic(base.TOMMY_FULL_RACK, 'full-rack-enforcer'),
  WHEELS_HOME_SAFE: withCosmetic(base.WHEELS_HOME_SAFE, 'road-king'),
  VIC_CLEAN_SLATE: withCosmetic(base.VIC_CLEAN_SLATE, 'no-paper-trail'),
  BLOCKS_OUT_OF_TOWN: withCosmetic(base.BLOCKS_OUT_OF_TOWN, 'corner-boss'),
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
