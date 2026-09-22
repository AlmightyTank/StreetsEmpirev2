import { classicOgV07E } from '../classic-og-v0.7-e/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { sideQuests } from './side-quests.js';

const questDefinitions = defineQuestCatalog({
  ...(classicOgV07E.questDefinitions ?? {}),
  ...sideQuests,
});

/**
 * 0.7.0-F keeps the economic command center intact and adds Armory/Infirmary support.
 * Quest roadmap Phase H layers Mama/Pip/Tommy side work onto this latest beta ruleset
 * without changing the pinned 0.7-D/E quest catalogs.
 */
export const classicOgV07F = {
  ...classicOgV07E,
  meta: { id: 'classic-og-v0.7-f', version: '0.7.0-F', name: 'Classic OG - Armory & Infirmary' },
  questDefinitions,
} as const satisfies Ruleset;
