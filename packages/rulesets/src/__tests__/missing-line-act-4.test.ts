import { describe, expect, it } from 'vitest';
import { classicOgV26D, classicOgV26E, missingLineActFour } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

const before = classicOgV26D.questDefinitions as QuestDefinitionCatalog;
const catalog = classicOgV26E.questDefinitions as QuestDefinitionCatalog;
const ACT = ['ML_M16_MILE_MARKER_NINE', 'ML_M17_PASSENGER_NINE', 'ML_M18_WHAT_MAMA_BOUGHT', 'ML_M19_HONEST_SCALE', 'ML_M20_MAP_IN_THE_MARGINS'];
const quest = (key: string) => catalog[key] as QuestDefinition;
const isScene = (objective: QuestDefinition['objectives'][number]) => (objective.params?.eventTypes as string[] | undefined)?.includes('QUEST_STORY_SCENE');

describe('2.6.0-E The Missing Line, Act IV', () => {
  it('ships in 2.6.0-E on top of 2.6.0-D, which keeps Act III closed', () => {
    expect(classicOgV26E.meta).toMatchObject({ id: 'classic-og-v2.6-e', version: '2.6.0-E' });
    expect(questDefinitionProblems(catalog)).toEqual([]);
    expect(Object.keys(missingLineActFour)).toEqual(['ML_M15_NAME_IN_THE_MARGIN', ...ACT]);
    for (const [key, definition] of Object.entries(before)) {
      if (key !== 'ML_M15_NAME_IN_THE_MARGIN') expect(catalog[key]).toBe(definition);
    }
    expect(Object.keys(catalog).slice(-ACT.length)).toEqual(ACT);
  });

  it('opens from every Act III choice without changing what the choices pay', () => {
    const was = before.ML_M15_NAME_IN_THE_MARGIN!;
    const now = quest('ML_M15_NAME_IN_THE_MARGIN');
    expect(was.followUpKeys).toEqual([]);
    expect(now.followUpKeys).toEqual(['ML_M16_MILE_MARKER_NINE']);
    expect(now.branches!.map(({ followUpKeys: _f, ...branch }) => branch)).toEqual(was.branches!.map(({ followUpKeys: _f, ...branch }) => branch));
    for (const branch of now.branches!) expect(branch.followUpKeys).toEqual(['ML_M16_MILE_MARKER_NINE']);
    const { followUpKeys: _a, branches: _b, ...rest } = now;
    const { followUpKeys: _c, branches: _d, ...restWas } = was;
    expect(rest).toEqual(restWas);
  });

  it('runs as one chain, told by the contacts the ruleset knows', () => {
    let previous = 'ML_M15_NAME_IN_THE_MARGIN';
    ACT.forEach((key, index) => {
      expect(quest(key).prerequisites).toEqual([{ kind: 'QUEST_COMPLETED', params: { questKey: previous } }]);
      expect(quest(key).followUpKeys).toEqual(index < ACT.length - 1 ? [ACT[index + 1]] : []);
      previous = key;
    });
    expect(ACT.map((key) => quest(key).contactKey)).toEqual(['WHEELS', 'WHEELS', 'MAMA_KING', 'PIP', 'BLOCKS']);
    for (const key of ACT) expect(classicOgV26E.contacts as Record<string, unknown>).toHaveProperty(quest(key).contactKey!);
  });

  it('is written to the depth standard, with no lesson text', () => {
    for (const key of ACT) {
      const definition = quest(key);
      expect(definition).toMatchObject({ type: 'STORY', category: 'CAMPAIGN', repeatability: 'ONCE' });
      expect(definition.story?.chapter).toBe('Act IV · The Road Keeps Its Own Books');
      expect(definition.story?.lesson).toBeUndefined();
      expect(definition.story?.scenes).toHaveLength(1);
    }
    // The scene waits for the work, except where finding someone comes first (Eli) or the chapter is a confession (Mama).
    for (const key of ['ML_M16_MILE_MARKER_NINE', 'ML_M19_HONEST_SCALE', 'ML_M20_MAP_IN_THE_MARGINS']) {
      const work = quest(key).objectives.filter((objective) => !isScene(objective)).map((objective) => objective.id);
      expect(quest(key).story!.scenes![0]!.after).toEqual(work);
    }
    expect(quest('ML_M17_PASSENGER_NINE').story!.scenes![0]!.after).toBeUndefined();
    expect(quest('ML_M18_WHAT_MAMA_BOUGHT').objectives.every(isScene)).toBe(true);
  });

  it('uses only verified evidence, needs no turf or fight, and asks for nothing locked', () => {
    const evidence = ACT.flatMap((key) => quest(key).objectives.filter((objective) => !isScene(objective)).map((objective) => [
      key, objective.kind, objective.target, objective.params?.eventTypes, objective.params?.where ?? objective.params?.field,
    ]));
    expect(evidence).toEqual([
      ['ML_M16_MILE_MARKER_NINE', 'EVENT_COUNT', 1, ['RUN_RETURNED'], undefined],
      ['ML_M17_PASSENGER_NINE', 'EVENT_SUM', 1, ['STORE_BUY'], { storeKey: 'CHARLIE', itemKey: 'LOW_RIDER' }],
      ['ML_M19_HONEST_SCALE', 'EVENT_SUM', 20, ['STORE_SELL'], { storeKey: 'PIP' }],
      ['ML_M20_MAP_IN_THE_MARGINS', 'UNIQUE_VALUES', 3, ['SCOUT'], 'districtKey'],
    ]);
    const charlie = (classicOgV26E.stores as unknown as Record<string, { items: Record<string, { unlockKey?: string; vehicleClass?: string }> }>).CHARLIE!;
    expect(charlie.items.LOW_RIDER!.unlockKey).toBeUndefined();
    expect(charlie.items.LOW_RIDER!.vehicleClass).toBeUndefined();
    const openDistricts = Object.keys(classicOgV26E.districts).filter((key) => !Object.keys(classicOgV26E.permanentUnlocks ?? {}).some((unlock) => unlock.includes(key)));
    expect(openDistricts.length).toBeGreaterThanOrEqual(3);
    for (const key of ACT) expect(quest(key).bonusObjectives).toEqual([]);
  });

  it('pays a step above Act III, and covers the car it asks for', () => {
    const cash = (key: string) => quest(key).rewards.find((reward) => reward.kind === 'CASH')?.amount ?? 0;
    for (const key of ACT) expect(quest(key).rewards.every((reward) => reward.kind === 'CASH' || reward.kind === 'CONTACT_REP')).toBe(true);
    expect(ACT.map(cash)).toEqual([650_000, 650_000, 700_000, 700_000, 800_000]);
    const lowRider = (classicOgV26E.stores as unknown as Record<string, { items: Record<string, { buyCents: number }> }>).CHARLIE!.items.LOW_RIDER!.buyCents;
    expect(cash('ML_M17_PASSENGER_NINE')).toBeGreaterThan(lowRider);
  });
});
