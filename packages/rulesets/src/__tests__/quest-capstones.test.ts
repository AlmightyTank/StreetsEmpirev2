import { describe, expect, it } from 'vitest';
import { advanceQuestObjective } from '../quest-progress.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';
import { classicOgV07L } from '../classic-og-v0.7-l/index.js';
import { capstoneQuests } from '../classic-og-v0.7-m/capstone-quests.js';
import { classicOgV07M } from '../classic-og-v0.7-m/index.js';

describe('quest roadmap Phase N catalog completion', () => {
  it('adds the two capstone contracts that complete the first 30 Jobs', () => {
    expect(Object.keys(capstoneQuests)).toEqual([
      'PIP_TOP_SHELF',
      'TOMMY_FULL_RACK',
    ]);
    expect(Object.values(capstoneQuests).every((quest) => quest.type === 'SIDE')).toBe(true);

    expect(Object.keys(classicOgV07L.questDefinitions ?? {})).toHaveLength(28);
    expect(Object.keys(classicOgV07M.questDefinitions ?? {})).toHaveLength(30);
  });

  it('keeps 0.7-L pinned and wires only the new capstone follow-ups in 0.7-M', () => {
    expect(classicOgV07L.questDefinitions?.PIP_MOVE_THE_WEIGHT?.followUpKeys).toEqual([]);
    expect(classicOgV07L.questDefinitions?.TOMMY_PATCH_JOB?.followUpKeys).toEqual([]);

    expect(classicOgV07M.questDefinitions?.PIP_MOVE_THE_WEIGHT?.followUpKeys).toEqual(['PIP_TOP_SHELF']);
    expect(classicOgV07M.questDefinitions?.TOMMY_PATCH_JOB?.followUpKeys).toEqual(['TOMMY_FULL_RACK']);

    expect(classicOgV07M.favors).toEqual(classicOgV07L.favors);
    expect(classicOgV07M.permanentUnlocks).toEqual(classicOgV07L.permanentUnlocks);
    expect(hideoutV2For(classicOgV07M)).toEqual(hideoutV2For(classicOgV07L));
    expect(hideoutV2Problems(classicOgV07M)).toEqual([]);
  });

  it('gates the capstones at reputation reachable from the existing contact chains', () => {
    expect(capstoneQuests.PIP_TOP_SHELF.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'PIP', points: 60 },
    });
    expect(capstoneQuests.TOMMY_FULL_RACK.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'TOMMY', points: 90 },
    });
    expect(capstoneQuests.TOMMY_FULL_RACK.prerequisites).toContainEqual({
      kind: 'QUEST_COMPLETED',
      params: { questKey: 'PLANT_THE_FLAG' },
    });
  });

  it('counts only the intended high-end product sales for Pip', () => {
    const cocaine = capstoneQuests.PIP_TOP_SHELF.objectives[0]!;
    expect(advanceQuestObjective(cocaine, {
      type: 'STORE_SELL',
      payload: { storeKey: 'PIP', product: 'COCAINE', quantity: 20 },
    }).amount).toBe(20);
    expect(advanceQuestObjective(cocaine, {
      type: 'STORE_SELL',
      payload: { storeKey: 'PIP', product: 'HEROIN', quantity: 20 },
    }).amount).toBe(0);
    expect(advanceQuestObjective(cocaine, {
      type: 'STORE_BUY',
      payload: { storeKey: 'PIP', product: 'COCAINE', quantity: 20 },
    }).amount).toBe(0);
  });

  it('requires Tommy purchases from the correct rack and settled raid wins', () => {
    const aks = capstoneQuests.TOMMY_FULL_RACK.objectives[0]!;
    expect(advanceQuestObjective(aks, {
      type: 'STORE_BUY',
      payload: { storeKey: 'TOMMY', itemKey: 'AK47', quantity: 2 },
    }).amount).toBe(2);
    expect(advanceQuestObjective(aks, {
      type: 'STORE_BUY',
      payload: { storeKey: 'TOMMY', itemKey: 'TEK9', quantity: 2 },
    }).amount).toBe(0);

    const raids = capstoneQuests.TOMMY_FULL_RACK.objectives[1]!;
    expect(advanceQuestObjective(raids, {
      type: 'RAID_ATTACK',
      payload: { won: true },
    }).amount).toBe(1);
    expect(advanceQuestObjective(raids, {
      type: 'RAID_ATTACK',
      payload: { won: false },
    }).amount).toBe(0);
  });

  it('uses only reward mechanics that already exist before Phase N', () => {
    const kinds = new Set(
      Object.values(capstoneQuests).flatMap((quest) => quest.rewards.map((reward) => reward.kind)),
    );
    expect([...kinds].sort()).toEqual(['CASH', 'CONTACT_REP', 'FAVOR_ITEM']);
  });
});
