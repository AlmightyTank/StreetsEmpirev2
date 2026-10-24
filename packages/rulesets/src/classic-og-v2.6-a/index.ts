import { classicOgV25A } from '../classic-og-v2.5-a/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinitionCatalog, Ruleset } from '../types.js';
import { missingLineActOne } from './missing-line-act-1.js';

/**
 * 2.6.0-A. The Missing Line story campaign, Act I. The campaign is added after the existing
 * catalog, so the opening jobs keep their board order; older rounds keep their pinned catalog.
 */
export const classicOgV26A = {
  ...classicOgV25A,
  meta: { ...classicOgV25A.meta, id: 'classic-og-v2.6-a', version: '2.6.0-A', name: 'Classic OG - The Missing Line' },
  questDefinitions: defineQuestCatalog({
    ...(classicOgV25A.questDefinitions as QuestDefinitionCatalog),
    ...missingLineActOne,
  }),
} as const satisfies Ruleset;
