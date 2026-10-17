import { describe, expect, it } from 'vitest';
import type { QuestObjectiveDefinition, QuestProgressMap, QuestRewardDefinition } from '@streets/rulesets';
import {
  BONUS_OBJECTIVE_REWARD_PERCENT,
  bumpRewardsForCompletedBonuses,
  completedBonusObjectiveCount,
} from '../reward-grant.service.js';

describe('optional quest objective rewards', () => {
  const objectives: QuestObjectiveDefinition[] = [
    { id: 'scout', kind: 'EVENT_COUNT', description: 'Scout once', target: 1 },
    { id: 'deliver', kind: 'EVENT_COUNT', description: 'Deliver once', target: 1 },
  ];

  it('counts only explicitly completed optional objectives by stable ID', () => {
    const progress: QuestProgressMap = {
      scout: { current: 1, target: 1, completed: true },
      deliver: { current: 0, target: 1, completed: false },
      unrelated: { current: 1, target: 1, completed: true },
    };
    expect(completedBonusObjectiveCount(objectives, progress)).toBe(1);
    expect(completedBonusObjectiveCount(objectives, {})).toBe(0);
  });

  it('adds a bounded per-objective percentage to stackable payouts only', () => {
    expect(BONUS_OBJECTIVE_REWARD_PERCENT).toBe(10);
    const rewards: QuestRewardDefinition[] = [
      { kind: 'CASH', amount: 1000 },
      { kind: 'TURNS', amount: 9 },
      { kind: 'WEAPON_ACCESS', key: 'AK47' },
      { kind: 'FAVOR_ITEM', key: 'some-favor', amount: 1 },
      { kind: 'COSMETIC_UNLOCK', key: 'some-cosmetic' },
    ];
    const scaled = bumpRewardsForCompletedBonuses(rewards, 2);
    expect(scaled).toEqual([
      { kind: 'CASH', amount: 1200 },
      { kind: 'TURNS', amount: 10 },
      rewards[2], rewards[3], rewards[4],
    ]);
    expect(bumpRewardsForCompletedBonuses(rewards, 0)).toEqual(rewards);
    expect(rewards[0]?.amount).toBe(1000);
  });
});
