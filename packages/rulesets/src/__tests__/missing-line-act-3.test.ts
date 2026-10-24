import { describe, expect, it } from 'vitest';
import { classicOgV26C, classicOgV26D, missingLineActThree } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

const before = classicOgV26C.questDefinitions as QuestDefinitionCatalog;
const catalog = classicOgV26D.questDefinitions as QuestDefinitionCatalog;
const ACT = ['ML_M11_TERMS_OF_QUIET', 'ML_M12_CLERK_ON_THE_STAIRS', 'ML_M13_DATE_CHANGED_IN_INK', 'ML_M14_WOMAN_AT_CLOSING', 'ML_M15_NAME_IN_THE_MARGIN'];
const quest = (key: string) => catalog[key] as QuestDefinition;
const isScene = (objective: QuestDefinition['objectives'][number]) => (objective.params?.eventTypes as string[] | undefined)?.includes('QUEST_STORY_SCENE');

describe('2.6.0-D The Missing Line, Act III', () => {
  it('ships in 2.6.0-D on top of 2.6.0-C, which keeps Act II closed', () => {
    expect(classicOgV26D.meta).toMatchObject({ id: 'classic-og-v2.6-d', version: '2.6.0-D' });
    expect(questDefinitionProblems(catalog)).toEqual([]);
    expect(before.ML_M10_FAVOR_ALREADY_PAID?.followUpKeys).toEqual([]);
    expect(Object.keys(missingLineActThree)).toEqual(['ML_M10_FAVOR_ALREADY_PAID', ...ACT]);
    for (const [key, definition] of Object.entries(before)) {
      if (key !== 'ML_M10_FAVOR_ALREADY_PAID') expect(catalog[key]).toBe(definition);
    }
    const { followUpKeys, ...vic } = quest('ML_M10_FAVOR_ALREADY_PAID');
    const { followUpKeys: _old, ...was } = before.ML_M10_FAVOR_ALREADY_PAID!;
    expect(vic).toEqual(was);
    expect(followUpKeys).toEqual(['ML_M11_TERMS_OF_QUIET']);
    expect(Object.keys(catalog).slice(-ACT.length)).toEqual(ACT);
  });

  it('runs as one chain from Vic’s confession', () => {
    let previous = 'ML_M10_FAVOR_ALREADY_PAID';
    ACT.forEach((key, index) => {
      expect(quest(key).prerequisites).toEqual([{ kind: 'QUEST_COMPLETED', params: { questKey: previous } }]);
      expect(quest(key).followUpKeys).toEqual(index < ACT.length - 1 ? [ACT[index + 1]] : []);
      previous = key;
    });
    expect(ACT.map((key) => quest(key).contactKey)).toEqual(['VIC', 'LEDGER', 'TOMMY', 'MAMA_KING', 'LEDGER']);
    const contacts = classicOgV26D.contacts as Record<string, unknown>;
    for (const key of ACT) expect(contacts).toHaveProperty(quest(key).contactKey!);
  });

  it('is written to the depth standard: work, then the reveal, with no lesson text', () => {
    for (const key of ACT) {
      const definition = quest(key);
      expect(definition).toMatchObject({ type: 'STORY', category: 'CAMPAIGN', repeatability: 'ONCE' });
      expect(definition.story?.chapter).toBe('Act III · The Price of Keeping Quiet');
      expect(definition.story?.lesson).toBeUndefined();
      const work = definition.objectives.filter((objective) => !isScene(objective));
      expect(definition.story?.scenes).toHaveLength(1);
      if (key !== 'ML_M15_NAME_IN_THE_MARGIN') expect(definition.story!.scenes![0]!.after).toEqual(work.map((objective) => objective.id));
    }
  });

  it('uses only verified evidence at fair targets, and keeps recon optional', () => {
    const evidence = ACT.flatMap((key) => quest(key).objectives.filter((objective) => !isScene(objective)).map((objective) => [
      key, objective.kind, objective.target, objective.params?.eventTypes, objective.params?.where,
    ]));
    expect(evidence).toEqual([
      ['ML_M11_TERMS_OF_QUIET', 'EVENT_COUNT', 1, ['SCOUT'], { districtKey: 'URBAN_GHETTO' }],
      ['ML_M12_CLERK_ON_THE_STAIRS', 'EVENT_SUM', 5, ['STORE_BUY'], { storeKey: 'CORNER', itemKey: 'MEDICINE' }],
      ['ML_M13_DATE_CHANGED_IN_INK', 'EVENT_SUM', 2, ['STORE_BUY'], { storeKey: 'TOMMY', itemKey: 'AMMO_BOX' }],
      ['ML_M14_WOMAN_AT_CLOSING', 'EVENT_SUM', 1, ['STORE_BUY'], { storeKey: 'TOMMY', itemKey: 'THUG' }],
    ]);
    expect(ACT.flatMap((key) => quest(key).bonusObjectives.map((objective) => [key, objective.params?.eventTypes])))
      .toEqual([['ML_M13_DATE_CHANGED_IN_INK', ['COMBAT_RECON']]]);
    const stores = classicOgV26D.stores as unknown as Record<string, { items: Record<string, { unlockKey?: string }> }>;
    for (const [store, item] of [['CORNER', 'MEDICINE'], ['TOMMY', 'AMMO_BOX'], ['TOMMY', 'THUG']] as const) {
      expect(stores[store]!.items[item], `${store}.${item}`).toBeDefined();
      expect(stores[store]!.items[item]!.unlockKey).toBeUndefined();
    }
  });

  it('closes with a turn-in choice whose options pay the same and differ only in who trusts the crew', () => {
    const margin = quest('ML_M15_NAME_IN_THE_MARGIN');
    expect(margin.branches?.map((branch) => branch.key)).toEqual(['DISPUTE_THE_ENTRY', 'LEAVE_IT_FOR_NOW', 'KEEP_A_COPY']);
    for (const branch of margin.branches!) {
      expect(branch.rewards).toEqual([]);
      expect(branch.followUpKeys).toEqual([]);
      expect(branch.reputationDeltas).toHaveLength(1);
      expect(branch.reputationDeltas[0]!.amount).toBe(2);
    }
    expect(margin.branches!.map((branch) => branch.reputationDeltas[0]!.contactKey)).toEqual(['LEDGER', 'VIC', 'MAMA_KING']);
  });

  it('pays a step above Act II, in cash and contact standing only', () => {
    const cash = (key: string) => quest(key).rewards.find((reward) => reward.kind === 'CASH')?.amount ?? 0;
    for (const key of ACT) expect(quest(key).rewards.every((reward) => reward.kind === 'CASH' || reward.kind === 'CONTACT_REP')).toBe(true);
    expect(ACT.map(cash)).toEqual([450_000, 450_000, 500_000, 500_000, 600_000]);
  });
});
