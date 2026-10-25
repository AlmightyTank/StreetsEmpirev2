import { classicOgV26A } from '../classic-og-v2.6-a/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinitionCatalog, Ruleset } from '../types.js';
import { missingLineActTwo } from './missing-line-act-2.js';

/**
 * 2.6.0-B. The Missing Line, Act II. The Missing Line (Act I's last chapter) now opens the three
 * leads; the rest of the 2.6.0-A catalog is unchanged and keeps its order.
 */
export const classicOgV26B = {
  ...classicOgV26A,
  meta: { ...classicOgV26A.meta, id: 'classic-og-v2.6-b', version: '2.6.0-B', name: 'Classic OG - The Missing Line II' },
  questDefinitions: defineQuestCatalog({
    ...(classicOgV26A.questDefinitions as QuestDefinitionCatalog),
    ...missingLineActTwo,
  }),
} as const satisfies Ruleset;
