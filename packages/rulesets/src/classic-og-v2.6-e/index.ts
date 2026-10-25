import { classicOgV26D } from '../classic-og-v2.6-d/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinitionCatalog, Ruleset } from '../types.js';
import { missingLineActFour } from './missing-line-act-4.js';

/**
 * 2.6.0-E. The Missing Line, Act IV. Your Name in the Margin now opens the act from every choice;
 * the rest of the 2.6.0-D catalog is unchanged and keeps its order.
 */
export const classicOgV26E = {
  ...classicOgV26D,
  meta: { ...classicOgV26D.meta, id: 'classic-og-v2.6-e', version: '2.6.0-E', name: 'Classic OG - The Missing Line IV' },
  questDefinitions: defineQuestCatalog({
    ...(classicOgV26D.questDefinitions as QuestDefinitionCatalog),
    ...missingLineActFour,
  }),
} as const satisfies Ruleset;
