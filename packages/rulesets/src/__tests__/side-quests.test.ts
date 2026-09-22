import { describe, expect, it } from 'vitest';
import { classicOgV07D } from '../classic-og-v0.7-d/index.js';
import { classicOgV07E } from '../classic-og-v0.7-e/index.js';
import { classicOgV07F } from '../classic-og-v0.7-f/index.js';
import { sideQuests } from '../classic-og-v0.7-f/side-quests.js';

describe('quest roadmap Phase H side jobs', () => {
  it('adds nine optional jobs across Mama, Pip and Tommy', () => {
    expect(Object.keys(sideQuests)).toEqual([
      'MAMA_RECRUITMENT_DRIVE',
      'MAMA_NIGHT_SHIFT',
      'MAMA_HOUSE_FULL',
      'PIP_BULK_ORDER',
      'PIP_PARTY_FAVORS',
      'PIP_MOVE_THE_WEIGHT',
      'TOMMY_STOCK_THE_CREW',
      'TOMMY_TWO_COLLECTIONS',
      'TOMMY_PATCH_JOB',
    ]);

    const counts = Object.values(sideQuests).reduce<Record<string, number>>((out, quest) => {
      out[quest.contactKey] = (out[quest.contactKey] ?? 0) + 1;
      return out;
    }, {});

    expect(counts).toEqual({ MAMA_KING: 3, PIP: 3, TOMMY: 3 });
    for (const quest of Object.values(sideQuests)) {
      expect(quest.type).toBe('SIDE');
      expect(quest.repeatability).toBe('ONCE');
    }
  });

  it('keeps older pinned quest catalogs unchanged', () => {
    expect(Object.keys(classicOgV07D.questDefinitions ?? {})).toHaveLength(10);
    expect(Object.keys(classicOgV07E.questDefinitions ?? {})).toHaveLength(10);
    expect(Object.keys(classicOgV07F.questDefinitions ?? {})).toHaveLength(19);
  });

  it('uses contact reputation to open deeper side work', () => {
    expect(sideQuests.MAMA_NIGHT_SHIFT.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'MAMA_KING', points: 30 },
    });
    expect(sideQuests.MAMA_HOUSE_FULL.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'MAMA_KING', points: 50 },
    });
    expect(sideQuests.PIP_PARTY_FAVORS.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'PIP', points: 25 },
    });
    expect(sideQuests.PIP_MOVE_THE_WEIGHT.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'PIP', points: 40 },
    });
    expect(sideQuests.TOMMY_TWO_COLLECTIONS.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'TOMMY', points: 30 },
    });
    expect(sideQuests.TOMMY_PATCH_JOB.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'TOMMY', points: 50 },
    });
  });

  it('gives each contact mechanically distinct requests', () => {
    expect(sideQuests.MAMA_NIGHT_SHIFT.objectives[0]).toMatchObject({
      kind: 'SPEND_TURNS',
      params: { eventTypes: ['SCOUT'], where: { districtKey: 'NIGHTCLUB' } },
    });

    expect(sideQuests.PIP_BULK_ORDER.objectives[0]).toMatchObject({
      kind: 'EVENT_SUM',
      params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'METH' } },
    });
    expect(sideQuests.PIP_MOVE_THE_WEIGHT.objectives.map((objective) => objective.params?.where)).toEqual([
      { storeKey: 'PIP', product: 'WEED' },
      { storeKey: 'PIP', product: 'ECSTASY' },
      { storeKey: 'PIP', product: 'METH' },
    ]);

    expect(sideQuests.TOMMY_STOCK_THE_CREW.objectives[0]).toMatchObject({
      kind: 'EVENT_SUM',
      params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'TOMMY', itemKey: 'PISTOL' } },
    });
    expect(sideQuests.TOMMY_TWO_COLLECTIONS.objectives[0]).toMatchObject({
      kind: 'WIN_EVENTS',
      target: 2,
      params: { eventTypes: ['RAID_ATTACK'] },
    });
    expect(sideQuests.TOMMY_PATCH_JOB.objectives[0]).toMatchObject({
      kind: 'EVENT_SUM',
      target: 10,
      params: { eventTypes: ['COMBAT_TREATMENT'], field: 'treatedThugs' },
    });
  });

  it('does not introduce new reward mechanics before Phase I', () => {
    const kinds = new Set(Object.values(sideQuests).flatMap((quest) => quest.rewards.map((reward) => reward.kind)));
    expect([...kinds].sort()).toEqual(['CASH', 'CONTACT_REP', 'ITEM']);
  });
});
