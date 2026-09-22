import { describe, expect, it } from 'vitest';
import { advanceQuestObjective } from '../quest-progress.js';
import { classicOgV07M } from '../classic-og-v0.7-m/index.js';
import { dailyContracts } from '../classic-og-v0.7-n/daily-contracts.js';
import { classicOgV07N } from '../classic-og-v0.7-n/index.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase O daily contracts', () => {
  it('keeps the first 30 handcrafted Jobs and adds an eight-contract daily pool', () => {
    expect(Object.keys(classicOgV07M.questDefinitions ?? {})).toHaveLength(30);
    expect(Object.keys(dailyContracts)).toHaveLength(8);
    expect(Object.keys(classicOgV07N.questDefinitions ?? {})).toHaveLength(38);
    expect(Object.values(dailyContracts).every((quest) => quest.type === 'DAILY')).toBe(true);
    expect(Object.values(dailyContracts).every((quest) => quest.repeatability === 'DAILY')).toBe(true);
  });

  it('uses ordinary gameplay events for the requested small-contract shapes', () => {
    expect(advanceQuestObjective(dailyContracts.DAILY_STREET_SWEEP.objectives[0]!, {
      type: 'SCOUT',
      payload: { turns: 10 },
    }).amount).toBe(10);

    expect(advanceQuestObjective(dailyContracts.DAILY_COOK_ORDER.objectives[0]!, {
      type: 'PRODUCE_CRACK',
      payload: { product: 40 },
    }).amount).toBe(40);

    expect(advanceQuestObjective(dailyContracts.DAILY_SUPPLY_RUN.objectives[0]!, {
      type: 'STORE_BUY',
      payload: { storeKey: 'CORNER', totalCents: 250_000 },
    }).amount).toBe(250_000);

    expect(advanceQuestObjective(dailyContracts.DAILY_MOVE_PRODUCT.objectives[0]!, {
      type: 'STORE_SELL',
      payload: { storeKey: 'PIP', quantity: 25 },
    }).amount).toBe(25);
  });

  it('keeps rewards modest and never grants permanent unlocks', () => {
    const rewards = Object.values(dailyContracts).flatMap((quest) => quest.rewards);
    expect(rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'WEAPON_ACCESS')).toBe(false);
    expect(rewards.filter((reward) => reward.kind === 'FAVOR_ITEM')).toHaveLength(2);

    const cashRewards = rewards
      .filter((reward) => reward.kind === 'CASH')
      .map((reward) => reward.amount ?? 0);
    expect(Math.max(...cashRewards)).toBeLessThanOrEqual(1_500_000);
  });

  it('inherits favor, permanent-unlock and Hideout behavior unchanged from 0.7-M', () => {
    expect(classicOgV07N.favors).toEqual(classicOgV07M.favors);
    expect(classicOgV07N.permanentUnlocks).toEqual(classicOgV07M.permanentUnlocks);
    expect(hideoutV2For(classicOgV07N)).toEqual(hideoutV2For(classicOgV07M));
    expect(hideoutV2Problems(classicOgV07N)).toEqual([]);
  });
});
