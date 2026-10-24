import { describe, expect, it } from 'vitest';
import { classicOgV26B, classicOgV26C, LATEST_RULESET, missingLineDepth } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

const before = classicOgV26B.questDefinitions as QuestDefinitionCatalog;
const after = classicOgV26C.questDefinitions as QuestDefinitionCatalog;
const DEEPENED = ['ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR', 'ML_M03_OTHER_DOOR', 'ML_M04_ROLL_CALL', 'ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL'];
const quest = (key: string) => after[key] as QuestDefinition;
const isScene = (objective: QuestDefinition['objectives'][number]) => (objective.params?.eventTypes as string[] | undefined)?.includes('QUEST_STORY_SCENE');

describe('2.6.0-C The Missing Line depth pass', () => {
  it('ships as the latest ruleset and changes only the deepened chapters', () => {
    expect(LATEST_RULESET.meta.id).toBe('classic-og-v2.6-c');
    expect(questDefinitionProblems(after)).toEqual([]);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(Object.keys(missingLineDepth)).toEqual(DEEPENED);
    for (const [key, definition] of Object.entries(before)) {
      if (!DEEPENED.includes(key)) expect(after[key]).toBe(definition);
    }
  });

  it('keeps each chapter’s identity, chain and pay', () => {
    for (const key of DEEPENED) {
      const { objectives: _a, story: _b, ...was } = before[key]!;
      const { objectives: _c, story: _d, ...now } = quest(key);
      expect(now, key).toEqual(was);
      for (const field of ['chapter', 'intro'] as const) expect(quest(key).story?.[field]).toBe(before[key]!.story?.[field]);
      expect(quest(key).story?.lesson).toBeUndefined();
    }
  });

  it('asks for real work in every deepened chapter, and plays the reveal once that work is done', () => {
    for (const key of DEEPENED) {
      const work = quest(key).objectives.filter((objective) => !isScene(objective));
      const scenes = quest(key).story?.scenes ?? [];
      expect(work.length, key).toBeGreaterThan(0);
      expect(scenes.length, key).toBe(1);
      // Mama hands over the receipt first and the walk follows; everywhere else the scene waits for the work.
      if (key !== 'ML_M01_NIGHT_RECEIPT') expect(scenes[0]!.after, key).toEqual(work.map((objective) => objective.id));
    }
  });

  it('uses only verified evidence, at fair targets', () => {
    const evidence = DEEPENED.flatMap((key) => quest(key).objectives.filter((objective) => !isScene(objective)).map((objective) => [
      key, objective.kind, objective.target, objective.params?.eventTypes, objective.params?.where ?? null,
    ]));
    expect(evidence).toEqual([
      ['ML_M01_NIGHT_RECEIPT', 'EVENT_COUNT', 1, ['SCOUT'], { districtKey: 'LOW_RENT' }],
      ['ML_M02_SMALL_FAVOR', 'EVENT_SUM', 10, ['STORE_BUY'], { storeKey: 'CORNER', itemKey: 'BEER' }],
      ['ML_M03_OTHER_DOOR', 'EVENT_SUM', 10, ['STORE_SELL'], { storeKey: 'PIP' }],
      ['ML_M04_ROLL_CALL', 'EVENT_COUNT', 1, ['RUN_RETURNED'], null],
      ['ML_M06_PIPS_COUNT', 'EVENT_COUNT', 1, ['PRODUCE_CRACK'], null],
      ['ML_M06_PIPS_COUNT', 'EVENT_SUM', 10, ['STORE_SELL'], { storeKey: 'PIP' }],
      ['ML_M07_NORTH_ROAD', 'EVENT_COUNT', 1, ['RUN_RETURNED'], null],
      ['ML_M08_TOMMYS_SERIAL', 'EVENT_SUM', 5, ['STORE_BUY'], { storeKey: 'TOMMY', itemKey: 'PISTOL' }],
    ]);
  });

  it('can be done from a fresh start: the district is open, the goods are on hand and the buys are affordable', () => {
    const ruleset = classicOgV26C;
    expect(ruleset.districts).toHaveProperty('LOW_RENT');
    expect(Object.keys(ruleset.permanentUnlocks ?? {}).some((key) => key.includes('LOW_RENT'))).toBe(false);
    const start = ruleset.round.startingPlayer as unknown as { crack: number; cashCents: number };
    expect(start.crack).toBeGreaterThanOrEqual(20);
    const stores = ruleset.stores as unknown as Record<string, { items: Record<string, { buyCents: number; unlockKey?: string }> }>;
    expect(stores.TOMMY!.items.PISTOL!.unlockKey).toBeUndefined();
    const spend = 10 * stores.CORNER!.items.BEER!.buyCents + 5 * stores.TOMMY!.items.PISTOL!.buyCents;
    expect(spend).toBeLessThan(start.cashCents / 10);
  });
});
