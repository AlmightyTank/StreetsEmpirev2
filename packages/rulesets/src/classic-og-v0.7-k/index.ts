import { classicOgV07J } from '../classic-og-v0.7-j/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestRewardDefinition, Ruleset } from '../types.js';
import { favorCatalog } from './favors.js';

const base = classicOgV07J.questDefinitions!;

function withFavor(
  rewards: readonly QuestRewardDefinition[],
  key: keyof typeof favorCatalog,
  amount = 1,
): QuestRewardDefinition[] {
  return [...rewards, { kind: 'FAVOR_ITEM', key, amount }];
}

const questDefinitions = defineQuestCatalog({
  ...base,
  TOMMY_TWO_COLLECTIONS: {
    ...base.TOMMY_TWO_COLLECTIONS,
    rewards: withFavor(base.TOMMY_TWO_COLLECTIONS.rewards, 'BURNER_PHONE'),
  },
  TOMMY_PATCH_JOB: {
    ...base.TOMMY_PATCH_JOB,
    rewards: withFavor(base.TOMMY_PATCH_JOB.rewards, 'DOCTOR_FAVOR'),
  },
});

/**
 * Quest roadmap Phase L: armed single-use favors.
 *
 * A single-use favor is moved from inventory into an armed category slot.
 * It is consumed only by a successful matching action.
 */
export const classicOgV07K = {
  ...classicOgV07J,
  meta: { id: 'classic-og-v0.7-k', version: '0.7.0-K', name: 'Classic OG - Single-Use Favors' },
  favors: favorCatalog,
  questDefinitions,
} as const satisfies Ruleset;
