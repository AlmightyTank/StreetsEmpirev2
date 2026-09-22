import { classicOgV07H } from '../classic-og-v0.7-h/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestRewardDefinition, Ruleset } from '../types.js';
import { favorCatalog } from './favors.js';

const base = classicOgV07H.questDefinitions!;

function withFavor(
  rewards: readonly QuestRewardDefinition[],
  key: keyof typeof favorCatalog,
  amount = 1,
): QuestRewardDefinition[] {
  return [...rewards, { kind: 'FAVOR_ITEM', key, amount }];
}

const questDefinitions = defineQuestCatalog({
  ...base,
  MAMA_RECRUITMENT_DRIVE: {
    ...base.MAMA_RECRUITMENT_DRIVE,
    rewards: withFavor(base.MAMA_RECRUITMENT_DRIVE.rewards, 'MAMA_ADVICE'),
  },
  MAMA_NIGHT_SHIFT: {
    ...base.MAMA_NIGHT_SHIFT,
    rewards: withFavor(base.MAMA_NIGHT_SHIFT.rewards, 'STREET_FRENZY'),
  },
  PIP_BULK_ORDER: {
    ...base.PIP_BULK_ORDER,
    rewards: withFavor(base.PIP_BULK_ORDER.rewards, 'COOKHOUSE_RUSH'),
  },
  PIP_PARTY_FAVORS: {
    ...base.PIP_PARTY_FAVORS,
    rewards: withFavor(base.PIP_PARTY_FAVORS.rewards, 'PIP_CONNECTION'),
  },
  TOMMY_STOCK_THE_CREW: {
    ...base.TOMMY_STOCK_THE_CREW,
    rewards: withFavor(base.TOMMY_STOCK_THE_CREW.rewards, 'TOMMY_VOUCHER'),
  },
  TOMMY_PATCH_JOB: {
    ...base.TOMMY_PATCH_JOB,
    rewards: withFavor(base.TOMMY_PATCH_JOB.rewards, 'FIELD_MEDIC'),
  },
});

/**
 * Quest roadmap Phase J: durable consumable favor inventory.
 *
 * Favors can be earned and stacked in 0.7-I. Their timed and single-use effects
 * are intentionally activated by later roadmap phases.
 */
export const classicOgV07I = {
  ...classicOgV07H,
  meta: { id: 'classic-og-v0.7-i', version: '0.7.0-I', name: 'Classic OG - Favor Inventory' },
  favors: favorCatalog,
  questDefinitions,
} as const satisfies Ruleset;
