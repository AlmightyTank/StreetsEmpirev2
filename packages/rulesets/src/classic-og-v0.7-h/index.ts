import { classicOgV07G } from '../classic-og-v0.7-g/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestRewardDefinition, Ruleset } from '../types.js';
import { permanentUnlocks } from './permanent-unlocks.js';

const base = classicOgV07G.questDefinitions!;

function withoutLegacyWeapon(rewards: readonly QuestRewardDefinition[]): QuestRewardDefinition[] {
  return rewards.filter((reward) => reward.kind !== 'WEAPON_ACCESS');
}

const questDefinitions = defineQuestCatalog({
  ...base,
  HEAVY_HANDS: {
    ...base.HEAVY_HANDS,
    rewards: [
      ...withoutLegacyWeapon(base.HEAVY_HANDS.rewards),
      { kind: 'PERMANENT_UNLOCK', key: 'WEAPON_SHOTGUN_ACCESS' },
    ],
  },
  COLLECTION_DAY: {
    ...base.COLLECTION_DAY,
    rewards: [
      ...withoutLegacyWeapon(base.COLLECTION_DAY.rewards),
      { kind: 'PERMANENT_UNLOCK', key: 'WEAPON_TEK9_ACCESS' },
    ],
  },
  PLANT_THE_FLAG: {
    ...base.PLANT_THE_FLAG,
    rewards: [
      ...withoutLegacyWeapon(base.PLANT_THE_FLAG.rewards),
      { kind: 'PERMANENT_UNLOCK', key: 'WEAPON_AK47_ACCESS' },
    ],
  },
  PIP_BULK_ORDER: {
    ...base.PIP_BULK_ORDER,
    rewards: [
      ...base.PIP_BULK_ORDER.rewards,
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_METH_ACCESS' },
    ],
  },
  PIP_PARTY_FAVORS: {
    ...base.PIP_PARTY_FAVORS,
    rewards: [
      ...base.PIP_PARTY_FAVORS.rewards,
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_ECSTASY_ACCESS' },
    ],
  },
  PIP_MOVE_THE_WEIGHT: {
    ...base.PIP_MOVE_THE_WEIGHT,
    rewards: [
      ...base.PIP_MOVE_THE_WEIGHT.rewards,
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_COCAINE_ACCESS' },
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_HEROIN_ACCESS' },
    ],
  },
});

/**
 * Quest roadmap Phase I: generic permanent unlocks.
 *
 * 0.7-G keeps Hideout Specializations. 0.7-H is the first ruleset
 * where Jobs write the generic PlayerUnlock ledger and Pip product purchases
 * can be gated by earned access.
 */
export const classicOgV07H = {
  ...classicOgV07G,
  meta: { id: 'classic-og-v0.7-h', version: '0.7.0-H', name: 'Classic OG - Permanent Unlocks' },
  permanentUnlocks,
  questDefinitions,
} as const satisfies Ruleset;
