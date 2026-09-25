import { describe, expect, it } from 'vitest';
import type { QuestRewardDefinition } from '../types.js';
import { classicOgV07N } from '../classic-og-v0.7-n/index.js';
import { weeklyContracts } from '../classic-og-v0.7-o/weekly-contracts.js';
import { classicOgV07O } from '../classic-og-v0.7-o/index.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase P weekly contracts', () => {
  it('keeps O intact and adds the six larger weekly goals', () => {
    expect(Object.keys(classicOgV07N.questDefinitions ?? {})).toHaveLength(38);
    expect(Object.keys(weeklyContracts)).toHaveLength(6);
    expect(Object.keys(classicOgV07O.questDefinitions ?? {})).toHaveLength(44);
    expect(Object.values(weeklyContracts).every((quest) => quest.type === 'WEEKLY')).toBe(true);
    expect(Object.values(weeklyContracts).every((quest) => quest.repeatability === 'WEEKLY')).toBe(true);
  });

  it('matches the planned weekly goal shapes', () => {
    expect(weeklyContracts.WEEKLY_STREET_BOSS.objectives[0]).toMatchObject({
      kind: 'EARN_CASH',
      target: 50_000_000,
    });
    expect(weeklyContracts.WEEKLY_ROAD_WARRIOR.objectives[0]).toMatchObject({
      kind: 'EVENT_COUNT',
      target: 5,
    });
    expect(weeklyContracts.WEEKLY_WARLORD.objectives[0]).toMatchObject({
      kind: 'WIN_EVENTS',
      target: 5,
    });
    expect(weeklyContracts.WEEKLY_LANDLORD.objectives[0]).toMatchObject({
      kind: 'TURF_HOLD_HOURS',
      target: 48,
    });
    expect(weeklyContracts.WEEKLY_ENTREPRENEUR.objectives[0]).toMatchObject({
      kind: 'EVENT_SUM',
      target: 25_000_000,
    });
    expect(weeklyContracts.WEEKLY_TRAVELER.objectives[0]).toMatchObject({
      kind: 'UNIQUE_VALUES',
      target: 5,
    });
  });

  it('uses bounded rewards without permanent progression', () => {
    const rewards: QuestRewardDefinition[] = Object.values(weeklyContracts)
      .flatMap((quest) => [...quest.rewards]);

    expect(rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'WEAPON_ACCESS')).toBe(false);

    const cash = rewards
      .filter((reward) => reward.kind === 'CASH')
      .map((reward) => reward.amount ?? 0);
    expect(Math.min(...cash)).toBeGreaterThanOrEqual(4_000_000);
    expect(Math.max(...cash)).toBeLessThanOrEqual(6_000_000);
  });

  it('inherits daily contracts, favors, unlocks and Hideout behavior unchanged', () => {
    for (const definition of Object.values(classicOgV07N.questDefinitions ?? {})) {
      expect(classicOgV07O.questDefinitions?.[definition.key]).toEqual(definition);
    }
    expect(classicOgV07O.favors).toEqual(classicOgV07N.favors);
    expect(classicOgV07O.permanentUnlocks).toEqual(classicOgV07N.permanentUnlocks);
    expect(hideoutV2For(classicOgV07O)).toEqual(hideoutV2For(classicOgV07N));
    expect(hideoutV2Problems(classicOgV07O)).toEqual([]);
  });
});
