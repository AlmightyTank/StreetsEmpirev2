import type { QuestRewardDefinition } from '@streets/rulesets';

/** This catalog version never changes after release: old receipt snapshots stay auditable. */
export const ROUND_ROLL_CALL_REWARD_VERSION = 'round-roll-call-v1' as const;
export type RoundRollCallRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export interface RoundRollCallRewardTier {
  tier: number;
  key: string;
  rarity: RoundRollCallRarity;
  rewards: readonly QuestRewardDefinition[];
}

const cash = (dollars: number): QuestRewardDefinition => ({ kind: 'CASH', amount: dollars * 100 });
const turns = (amount: number): QuestRewardDefinition => ({ kind: 'TURNS', amount });
const item = (key: 'beer' | 'condoms' | 'medicine', amount: number): QuestRewardDefinition =>
  ({ kind: 'ITEM', key, amount });

/**
 * The regular 21-stamp schedule: 10 Common, 6 Uncommon, 4 Rare,
 * then the Legendary final step. Larger/smaller tracks resample this
 * fixed schedule across all non-final steps, then put Legendary last.
 * Repetition is intentional, deterministic and never random/buyable.
 *
 * Even the Legendary gameplay bundle is mild. Slice D will attach
 * account-persistent shell + crew cosmetics to the final claim only.
 */
const STANDARD_STEPS: readonly Omit<RoundRollCallRewardTier, 'key' | 'tier'>[] = [
  { rarity: 'common', rewards: [cash(1_000)] },
  { rarity: 'uncommon', rewards: [turns(8)] },
  { rarity: 'common', rewards: [item('beer', 12)] },
  { rarity: 'uncommon', rewards: [cash(1_500)] },
  { rarity: 'rare', rewards: [turns(20)] },
  { rarity: 'common', rewards: [item('condoms', 12)] },
  { rarity: 'uncommon', rewards: [item('medicine', 7)] },
  { rarity: 'common', rewards: [cash(1_200)] },
  { rarity: 'common', rewards: [item('beer', 15)] },
  { rarity: 'rare', rewards: [cash(3_000)] },
  { rarity: 'common', rewards: [turns(4)] },
  { rarity: 'uncommon', rewards: [item('medicine', 8)] },
  { rarity: 'common', rewards: [item('condoms', 25)] },
  { rarity: 'common', rewards: [cash(1_250)] },
  { rarity: 'rare', rewards: [turns(15)] },
  { rarity: 'common', rewards: [item('beer', 15)] },
  { rarity: 'uncommon', rewards: [cash(2_200)] },
  { rarity: 'common', rewards: [item('medicine', 5)] },
  { rarity: 'rare', rewards: [cash(4_000)] },
  { rarity: 'uncommon', rewards: [turns(12)] },
];

const FINALE: Omit<RoundRollCallRewardTier, 'key' | 'tier'> =
  { rarity: 'legendary', rewards: [cash(5_000), turns(15)] };

export const ROLL_CALL_PER_STEP_CAPS = {
  cashCents: 500_000,
  turns: 20,
  supplies: 30,
} as const;

/** Fail closed if a future catalog silently introduces combat/weapon advantages. */
export function validateRollCallRewards(rewards: readonly QuestRewardDefinition[]): boolean {
  return rewards.length > 0 && rewards.every((reward) => {
    const amount = reward.amount ?? 0;
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    if (reward.kind === 'CASH') return amount <= ROLL_CALL_PER_STEP_CAPS.cashCents;
    if (reward.kind === 'TURNS') return amount <= ROLL_CALL_PER_STEP_CAPS.turns;
    return reward.kind === 'ITEM'
      && ['beer', 'condoms', 'medicine'].includes(reward.key ?? '')
      && amount <= ROLL_CALL_PER_STEP_CAPS.supplies;
  });
}

export function roundRollCallCatalog(requiredStamps: number): RoundRollCallRewardTier[] {
  if (!Number.isSafeInteger(requiredStamps) || requiredStamps < 0 || requiredStamps > 10_000) {
    throw new Error('Round Roll Call requires between 0 and 10000 daily stamps.');
  }
  return Array.from({ length: requiredStamps }, (_, index) => {
    const isFinal = index === requiredStamps - 1;
    const templateIndex = requiredStamps <= 1 ? 0
      : Math.floor(index * STANDARD_STEPS.length / (requiredStamps - 1));
    const template = isFinal ? FINALE : STANDARD_STEPS[templateIndex]!;
    if (!validateRollCallRewards(template.rewards)) throw new Error('Round Roll Call catalog is over budget.');
    const tier = index + 1;
    return {
      tier,
      key: `${ROUND_ROLL_CALL_REWARD_VERSION}:tier-${tier}`,
      rarity: template.rarity,
      rewards: template.rewards,
    };
  });
}
