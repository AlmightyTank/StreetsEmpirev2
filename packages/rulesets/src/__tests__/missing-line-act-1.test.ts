import { describe, expect, it } from 'vitest';
import { classicOgV25A, classicOgV26A, missingLineActOne } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

const ORDER = ['ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR', 'ML_M03_OTHER_DOOR', 'ML_M04_ROLL_CALL', 'ML_M05_MISSING_LINE'];
const quests = Object.values(missingLineActOne) as QuestDefinition[];

describe('2.6.0-A The Missing Line, Act I', () => {
  it('ships in 2.6.0-A and leaves 2.5.0-A untouched', () => {
    expect(classicOgV26A.meta).toMatchObject({ id: 'classic-og-v2.6-a', version: '2.6.0-A' });
    expect(Object.keys(classicOgV25A.questDefinitions).filter((key) => key.startsWith('ML_'))).toEqual([]);
    const catalog = classicOgV26A.questDefinitions as QuestDefinitionCatalog;
    expect(questDefinitionProblems(catalog)).toEqual([]);
    for (const [key, definition] of Object.entries(classicOgV25A.questDefinitions)) expect(catalog[key]).toBe(definition);
    // Appended after the existing catalog, so the opening jobs keep their board order.
    expect(Object.keys(catalog).slice(-ORDER.length)).toEqual(ORDER);
  });

  it('runs as one chain from a job with no prerequisite', () => {
    expect(quests.map((quest) => quest.key)).toEqual(ORDER);
    ORDER.forEach((key, index) => {
      const quest = missingLineActOne[key as keyof typeof missingLineActOne] as QuestDefinition;
      expect(quest.prerequisites).toEqual(index === 0 ? [] : [{ kind: 'QUEST_COMPLETED', params: { questKey: ORDER[index - 1] } }]);
      expect(quest.followUpKeys).toEqual(index < ORDER.length - 1 ? [ORDER[index + 1]] : []);
      expect(quest).toMatchObject({ type: 'STORY', category: 'CAMPAIGN', repeatability: 'ONCE', expiresAfterMinutes: null });
    });
  });

  it('is given by contacts the ruleset knows', () => {
    const contacts = classicOgV26A.contacts as Record<string, unknown>;
    for (const quest of quests) expect(contacts).toHaveProperty(quest.contactKey!);
    expect(quests.map((quest) => quest.contactKey)).toEqual(['MAMA_KING', 'MAMA_KING', 'PIP', 'MAMA_KING', 'LEDGER']);
  });

  it('tells a story without teaching, in full chapter copy', () => {
    for (const quest of quests) {
      expect(quest.story?.lesson).toBeUndefined();
      expect(quest.story?.chapter).toBe('Act I · A Name in the Rain');
      for (const field of ['intro', 'inProgress', 'ready', 'completed', 'actionHint'] as const) {
        expect(quest.story?.[field].trim().length, `${quest.key}.${field}`).toBeGreaterThan(20);
      }
    }
    expect(quests.filter((quest) => quest.story?.scenes?.length).map((quest) => quest.story!.scenes!.map((scene) => scene.key)))
      .toEqual([['night_receipt_handled'], ['alvarez_statement_taken'], ['missing_line_compared']]);
  });

  it('uses only evidence verified in Slice A, all earned after accepting', () => {
    const evidence = quests.flatMap((quest) => [...quest.objectives, ...quest.bonusObjectives].map((objective) => ({
      quest: quest.key, kind: objective.kind, eventTypes: objective.params?.eventTypes, where: objective.params?.where,
    })));
    expect(evidence.map(({ quest, eventTypes, where }) => [quest, eventTypes, where])).toEqual([
      ['ML_M01_NIGHT_RECEIPT', ['QUEST_STORY_SCENE'], { questKey: 'ML_M01_NIGHT_RECEIPT', sceneKey: 'night_receipt_handled' }],
      ['ML_M02_SMALL_FAVOR', ['QUEST_STORY_SCENE'], { questKey: 'ML_M02_SMALL_FAVOR', sceneKey: 'alvarez_statement_taken' }],
      ['ML_M03_OTHER_DOOR', ['STORE_SELL'], { storeKey: 'PIP' }],
      ['ML_M04_ROLL_CALL', ['RUN_RETURNED'], undefined],
      ['ML_M05_MISSING_LINE', ['QUEST_STORY_SCENE'], { questKey: 'ML_M05_MISSING_LINE', sceneKey: 'missing_line_compared' }],
    ]);
    expect(evidence.every(({ kind }) => kind === 'EVENT_COUNT')).toBe(true);
  });

  it('pays in the opening-job band: modest cash and contact standing only', () => {
    for (const quest of quests) {
      expect(quest.rewards.every((reward) => reward.kind === 'CASH' || reward.kind === 'CONTACT_REP')).toBe(true);
      const cash = quest.rewards.find((reward) => reward.kind === 'CASH')?.amount ?? 0;
      expect(cash).toBeGreaterThan(0);
      expect(cash).toBeLessThanOrEqual(250_000);
    }
    const total = quests.reduce((sum, quest) => sum + (quest.rewards.find((reward) => reward.kind === 'CASH')?.amount ?? 0), 0);
    expect(total).toBe(800_000);
  });
});
