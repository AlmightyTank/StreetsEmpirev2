import { classicOgV07P } from '../classic-og-v0.7-p/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { branchingQuests } from './branching-quests.js';

/**
 * Quest roadmap Phase R: durable branching choices.
 *
 * 0.7-Q preserves the complete 0.7-P catalog and adds Taking Sides plus its
 * mutually exclusive Pip/Tommy follow-ups.
 */
export const classicOgV07Q = {
  ...classicOgV07P,
  meta: { id: 'classic-og-v0.7-q', version: '0.7.0-Q', name: 'Classic OG - Branching Jobs' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07P.questDefinitions!,
    ...branchingQuests,
  }),
} as const satisfies Ruleset;
