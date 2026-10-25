import { classicOgV26E } from '../classic-og-v2.6-e/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinitionCatalog, Ruleset } from '../types.js';
import { missingLineEchoes } from './missing-line-echoes.js';

/**
 * 2.6.0-F. The Missing Line remembers: Act IV story lines follow the crew's earlier choices.
 * Same chapters, work, rewards and catalog order as 2.6.0-E.
 */
export const classicOgV26F = {
  ...classicOgV26E,
  meta: { ...classicOgV26E.meta, id: 'classic-og-v2.6-f', version: '2.6.0-F', name: 'Classic OG - The Missing Line (echoes)' },
  questDefinitions: defineQuestCatalog({
    ...(classicOgV26E.questDefinitions as QuestDefinitionCatalog),
    ...missingLineEchoes,
  }),
} as const satisfies Ruleset;
