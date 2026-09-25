import { classicOgV07K } from '../classic-og-v0.7-k/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { contactExpansionQuests } from './contact-quests.js';

const questDefinitions = defineQuestCatalog({
  ...classicOgV07K.questDefinitions!,
  ...contactExpansionQuests,
});

/**
 * Quest roadmap Phase M: Wheels, Vic and Blocks side-job expansion.
 *
 * This raises the handcrafted catalog from 19 to 28 jobs while reusing the
 * existing Travel, Heat and Turf event streams.
 */
export const classicOgV07L = {
  ...classicOgV07K,
  meta: { id: 'classic-og-v0.7-l', version: '0.7.0-L', name: 'Classic OG - Contact Expansion' },
  questDefinitions,
} as const satisfies Ruleset;
