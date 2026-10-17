import { describe, expect, it } from 'vitest';
import type { QuestRewardDefinition } from '@streets/rulesets';
import {
  BONUS_OBJECTIVE_REWARD_PERCENT,
  bumpRewardsForCompletedBonuses,
  completedBonusObjectiveCount,
} from '../reward-grant.service.js';

const rewards: QuestRewardDefinition[] = [
  { kind: 'CASH', amount: 1_500_000 },
  { kind: 'TURNS', amount: 4 },
  { kind: 'ITEM', key: 'lowRiders', amount: 1 },
  { kind: 'CONTACT_REP', key: 'WHEELS', amount: 15 },
  { kind: 'FACTION_STANDING', key: 'KINGS', amount: 15 },
  { kind: 'COSMETIC_UNLOCK', key: 'ace-floor-walker' },
  { kind: 'WEAPON_ACCESS', key: 'SHOTGUN' },
];

describe('bonus objective reward bump', () => {
  it('leaves the listed payout alone until a bonus is finished', () => {
    expect(bumpRewardsForCompletedBonuses(rewards, 0)).toEqual(rewards);
    expect(completedBonusObjectiveCount(
      [{ id: 'extra' }, { id: 'other' }],
      { extra: { current: 1, target: 2, completed: false } },
    )).toBe(0);
  });

  it('adds 10% per finished bonus to cash, turns, goods, and contact reputation', () => {
    expect(BONUS_OBJECTIVE_REWARD_PERCENT).toBe(10);
    expect(bumpRewardsForCompletedBonuses(rewards, 1)).toEqual([
      { kind: 'CASH', amount: 1_650_000 },
      { kind: 'TURNS', amount: 4 },
      { kind: 'ITEM', key: 'lowRiders', amount: 1 },
      { kind: 'CONTACT_REP', key: 'WHEELS', amount: 17 },
      { kind: 'FACTION_STANDING', key: 'KINGS', amount: 15 },
      { kind: 'COSMETIC_UNLOCK', key: 'ace-floor-walker' },
      { kind: 'WEAPON_ACCESS', key: 'SHOTGUN' },
    ]);
    expect(bumpRewardsForCompletedBonuses(rewards, 2)[0]).toEqual({ kind: 'CASH', amount: 1_800_000 });
    expect(bumpRewardsForCompletedBonuses(rewards, 2)[3]).toEqual({ kind: 'CONTACT_REP', key: 'WHEELS', amount: 18 });
  });

  it('counts only bonus objectives marked complete', () => {
    expect(completedBonusObjectiveCount(
      [{ id: 'extra' }, { id: 'other' }],
      {
        extra: { current: 2, target: 2, completed: true },
        other: { current: 1, target: 1, completed: true },
        required: { current: 1, target: 1, completed: true },
      },
    )).toBe(2);
  });
});
