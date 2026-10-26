import { classicOgV26F } from '../classic-og-v2.6-f/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinitionCatalog, Ruleset } from '../types.js';
import { MARA_VENN, missingLineActFive } from './missing-line-act-5.js';

/**
 * 2.6.0-G. The Missing Line, Act V and its endings. Mara Venn joins the contacts; The Map in the
 * Margins now opens the act; the rest of the 2.6.0-F catalog is unchanged and keeps its order.
 */
export const classicOgV26G = {
  ...classicOgV26F,
  meta: { ...classicOgV26F.meta, id: 'classic-og-v2.6-g', version: '2.6.0-G', name: 'Classic OG - Who Keeps the Book' },
  contacts: { ...classicOgV26F.contacts, MARA_VENN },
  questDefinitions: defineQuestCatalog({
    ...(classicOgV26F.questDefinitions as QuestDefinitionCatalog),
    ...missingLineActFive,
  }),
} as const satisfies Ruleset;
