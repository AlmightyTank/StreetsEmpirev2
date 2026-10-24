import { classicOgV26C } from '../classic-og-v2.6-c/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinitionCatalog, Ruleset } from '../types.js';
import { missingLineActThree } from './missing-line-act-3.js';

/**
 * 2.6.0-D. The Missing Line, Act III. A Favor Already Paid now opens the act; the rest of the
 * 2.6.0-C catalog is unchanged and keeps its order.
 */
export const classicOgV26D = {
  ...classicOgV26C,
  meta: { ...classicOgV26C.meta, id: 'classic-og-v2.6-d', version: '2.6.0-D', name: 'Classic OG - The Missing Line III' },
  questDefinitions: defineQuestCatalog({
    ...(classicOgV26C.questDefinitions as QuestDefinitionCatalog),
    ...missingLineActThree,
  }),
} as const satisfies Ruleset;
