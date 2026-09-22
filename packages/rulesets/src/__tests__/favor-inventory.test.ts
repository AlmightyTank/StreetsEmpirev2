import { describe, expect, it } from 'vitest';
import { classicOgV07H, classicOgV07I } from '../index.js';

describe('quest roadmap Phase J favor inventory', () => {
  it('keeps 0.7-H unchanged and publishes six starter favors only in 0.7-I', () => {
    expect('favors' in classicOgV07H).toBe(false);
    expect(Object.keys(classicOgV07I.favors ?? {})).toEqual([
      'MAMA_ADVICE',
      'STREET_FRENZY',
      'COOKHOUSE_RUSH',
      'PIP_CONNECTION',
      'TOMMY_VOUCHER',
      'FIELD_MEDIC',
    ]);
  });

  it('keeps the existing nineteen jobs while adding favor rewards to six side jobs', () => {
    expect(Object.keys(classicOgV07I.questDefinitions ?? {})).toHaveLength(19);
    const quests = classicOgV07I.questDefinitions!;

    expect(quests.MAMA_RECRUITMENT_DRIVE.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'MAMA_ADVICE', amount: 1,
    });
    expect(quests.MAMA_NIGHT_SHIFT.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'STREET_FRENZY', amount: 1,
    });
    expect(quests.PIP_BULK_ORDER.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'COOKHOUSE_RUSH', amount: 1,
    });
    expect(quests.PIP_PARTY_FAVORS.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'PIP_CONNECTION', amount: 1,
    });
    expect(quests.TOMMY_STOCK_THE_CREW.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'TOMMY_VOUCHER', amount: 1,
    });
    expect(quests.TOMMY_PATCH_JOB.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'FIELD_MEDIC', amount: 1,
    });
  });

  it('predeclares timed versus single-use metadata without activating effects', () => {
    expect(classicOgV07I.favors!.MAMA_ADVICE.activation)
      .toEqual({ kind: 'TIMED', category: 'STREET', durationMinutes: 10 });
    expect(classicOgV07I.favors!.COOKHOUSE_RUSH.activation)
      .toEqual({ kind: 'TIMED', category: 'UNDERWORLD', durationMinutes: 5 });
    expect(classicOgV07I.favors!.FIELD_MEDIC.activation)
      .toEqual({ kind: 'TIMED', category: 'MUSCLE', durationMinutes: 10 });
    expect(classicOgV07I.favors!.TOMMY_VOUCHER.activation)
      .toEqual({ kind: 'SINGLE_USE', category: 'MUSCLE' });
  });

  it('backs every FAVOR_ITEM reward with the pinned ruleset catalog', () => {
    const catalog = classicOgV07I.favors!;
    for (const quest of Object.values(classicOgV07I.questDefinitions ?? {})) {
      for (const reward of quest.rewards) {
        if (reward.kind !== 'FAVOR_ITEM') continue;
        expect(reward.key).toBeTruthy();
        expect(reward.amount).toBeGreaterThan(0);
        expect(catalog[reward.key!]).toBeDefined();
      }
    }
  });

  it('inherits Phase I permanent unlocks unchanged', () => {
    expect(classicOgV07I.permanentUnlocks).toEqual(classicOgV07H.permanentUnlocks);
  });
});
