import { describe, expect, it } from 'vitest';
import type { QuestRewardDefinition } from '../types.js';
import { classicOgV07R } from '../classic-og-v0.7-r/index.js';
import { allianceContracts } from '../classic-og-v0.7-s/alliance-contracts.js';
import { classicOgV07S } from '../classic-og-v0.7-s/index.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase T alliance contracts', () => {
  it('preserves S and adds the four planned alliance slots', () => {
    expect(Object.keys(classicOgV07R.questDefinitions ?? {})).toHaveLength(56);
    expect(Object.keys(allianceContracts)).toHaveLength(4);
    expect(Object.keys(classicOgV07S.questDefinitions ?? {})).toHaveLength(60);

    for (const definition of Object.values(allianceContracts)) {
      expect(definition.type).toBe('ALLIANCE');
      expect(definition.repeatability).toBe('WEEKLY');
      expect(definition.availability.allianceContract).toBe(true);
      expect(definition.availability.sharedProgress).toBe(true);
    }
  });

  it('covers turf, economy, reinforcements and interstate travel', () => {
    expect(allianceContracts.ALLIANCE_HOLD_THE_CITY.objectives[0]).toMatchObject({
      kind: 'EVENT_COUNT',
      target: 4,
      params: { eventTypes: ['TURF_PUSH_DEFENSE'], where: { held: true } },
    });
    expect(allianceContracts.ALLIANCE_WAR_CHEST.objectives[0]).toMatchObject({
      kind: 'EVENT_SUM',
      target: 100_000_000,
    });
    expect(allianceContracts.ALLIANCE_REINFORCEMENTS.objectives[0]).toMatchObject({
      kind: 'EVENT_SUM',
      target: 100,
    });
    expect(allianceContracts.ALLIANCE_INTERSTATE_EMPIRE.objectives).toHaveLength(2);
    expect(allianceContracts.ALLIANCE_INTERSTATE_EMPIRE.objectives[1]).toMatchObject({
      kind: 'UNIQUE_VALUES',
      target: 6,
    });
  });

  it('uses shared bounded rewards without permanent progression', () => {
    const rewards: QuestRewardDefinition[] = Object.values(allianceContracts)
      .flatMap((quest) => [...quest.rewards]);

    expect(rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'WEAPON_ACCESS')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'CONTACT_REP')).toBe(false);

    const cash = rewards
      .filter((reward) => reward.kind === 'CASH')
      .map((reward) => reward.amount ?? 0);
    expect(Math.min(...cash)).toBeGreaterThanOrEqual(3_500_000);
    expect(Math.max(...cash)).toBeLessThanOrEqual(4_000_000);
  });

  it('inherits all Phase S quest and Hideout behavior unchanged', () => {
    for (const definition of Object.values(classicOgV07R.questDefinitions ?? {})) {
      expect(classicOgV07S.questDefinitions?.[definition.key]).toEqual(definition);
    }
    expect(classicOgV07S.favors).toEqual(classicOgV07R.favors);
    expect(classicOgV07S.permanentUnlocks).toEqual(classicOgV07R.permanentUnlocks);
    expect(hideoutV2For(classicOgV07S)).toEqual(hideoutV2For(classicOgV07R));
    expect(hideoutV2Problems(classicOgV07S)).toEqual([]);
  });
});
