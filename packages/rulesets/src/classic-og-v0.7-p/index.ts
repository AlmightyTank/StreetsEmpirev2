import { classicOgV07O } from '../classic-og-v0.7-o/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { secretQuests } from './secret-quests.js';

/**
 * Quest roadmap Phase Q: hidden, condition-revealed one-time Jobs.
 *
 * 0.7-P preserves all 0.7-O Jobs, daily/weekly rotations, unlocks and favors,
 * then adds seven SECRET definitions that are not materialized until triggered.
 */
export const classicOgV07P = {
  ...classicOgV07O,
  meta: { id: 'classic-og-v0.7-p', version: '0.7.0-P', name: 'Classic OG - Secret Jobs' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07O.questDefinitions!,
    ...secretQuests,
  }),
} as const satisfies Ruleset;
