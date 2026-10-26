import { classicOgV26G } from '../classic-og-v2.6-g/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinitionCatalog, Ruleset } from '../types.js';
import { missingLineSideEchoes, missingLineSideQuests } from './missing-line-side-stories.js';

/**
 * 2.6.0-H. The Missing Line side stories: fifteen side quests in five arcs, added after the
 * 2.6.0-G catalog, and the finale lines that remember them. The main chain is unchanged.
 */
export const classicOgV26H = {
  ...classicOgV26G,
  meta: { ...classicOgV26G.meta, id: 'classic-og-v2.6-h', version: '2.6.0-H', name: 'Classic OG - The Missing Line (side stories)' },
  questDefinitions: defineQuestCatalog({
    ...(classicOgV26G.questDefinitions as QuestDefinitionCatalog),
    ...missingLineSideEchoes,
    ...missingLineSideQuests,
  }),
} as const satisfies Ruleset;
