import { describe, expect, it } from 'vitest';
import { classicOgV26A, classicOgV26B, missingLineActOne, missingLineActTwo } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

const LEADS = ['ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL'];
const NEW = [...LEADS, 'ML_M09_TWO_BUYERS', 'ML_M10_FAVOR_ALREADY_PAID'];
const catalog = classicOgV26B.questDefinitions as QuestDefinitionCatalog;
const quest = (key: string) => catalog[key] as QuestDefinition;

describe('2.6.0-B The Missing Line, Act II', () => {
  it('ships in 2.6.0-B on top of 2.6.0-A, which keeps Act I as it was', () => {
    expect(classicOgV26B.meta).toMatchObject({ id: 'classic-og-v2.6-b', version: '2.6.0-B' });
    expect(questDefinitionProblems(catalog)).toEqual([]);
    expect((classicOgV26A.questDefinitions as QuestDefinitionCatalog).ML_M05_MISSING_LINE?.followUpKeys).toEqual([]);
    expect(Object.keys(classicOgV26A.questDefinitions).some((key) => NEW.includes(key))).toBe(false);
    for (const [key, definition] of Object.entries(classicOgV26A.questDefinitions)) {
      if (key !== 'ML_M05_MISSING_LINE') expect(catalog[key]).toBe(definition);
    }
    // Act I's last chapter keeps its place and content; only its follow-ups change.
    const { followUpKeys: _old, ...actOneFinale } = missingLineActOne.ML_M05_MISSING_LINE;
    const { followUpKeys, ...reissued } = quest('ML_M05_MISSING_LINE');
    expect(reissued).toEqual(actOneFinale);
    expect(followUpKeys).toEqual(LEADS);
    const keys = Object.keys(catalog);
    expect(keys.indexOf('ML_M05_MISSING_LINE')).toBe(Object.keys(classicOgV26A.questDefinitions).indexOf('ML_M05_MISSING_LINE'));
    expect(keys.slice(-NEW.length)).toEqual(NEW);
  });

  it('opens three leads together after Act I and joins them in Two Buyers, One Load', () => {
    for (const key of LEADS) {
      expect(quest(key).prerequisites).toEqual([{ kind: 'QUEST_COMPLETED', params: { questKey: 'ML_M05_MISSING_LINE' } }]);
      expect(quest(key).followUpKeys).toEqual(['ML_M09_TWO_BUYERS']);
    }
    expect(quest('ML_M09_TWO_BUYERS').prerequisites).toEqual(LEADS.map((questKey) => ({ kind: 'QUEST_COMPLETED', params: { questKey } })));
    expect(quest('ML_M09_TWO_BUYERS').followUpKeys).toEqual(['ML_M10_FAVOR_ALREADY_PAID']);
    expect(quest('ML_M10_FAVOR_ALREADY_PAID').prerequisites).toEqual([{ kind: 'QUEST_COMPLETED', params: { questKey: 'ML_M09_TWO_BUYERS' } }]);
    expect(quest('ML_M10_FAVOR_ALREADY_PAID').followUpKeys).toEqual([]);
  });

  it('is given by contacts the ruleset knows, as story jobs without lessons', () => {
    const contacts = classicOgV26B.contacts as Record<string, unknown>;
    expect(NEW.map((key) => quest(key).contactKey)).toEqual(['PIP', 'WHEELS', 'TOMMY', 'LEDGER', 'VIC']);
    for (const key of NEW) {
      const definition = quest(key);
      expect(contacts).toHaveProperty(definition.contactKey!);
      expect(definition).toMatchObject({ type: 'STORY', category: 'CAMPAIGN', repeatability: 'ONCE' });
      expect(definition.story?.chapter).toBe('Act II · Three Ways to Lose a Load');
      expect(definition.story?.lesson).toBeUndefined();
      for (const field of ['intro', 'inProgress', 'ready', 'completed', 'actionHint'] as const) {
        expect(definition.story?.[field].trim().length, `${key}.${field}`).toBeGreaterThan(20);
      }
    }
    for (const key of LEADS) expect(quest(key).description).toMatch(/^One of three leads, in any order\./);
  });

  it('uses only evidence verified in Slice A', () => {
    const evidence = NEW.map((key) => quest(key).objectives.map((objective) => [objective.kind, objective.params?.eventTypes, objective.params?.where]));
    expect(evidence).toEqual([
      [['EVENT_COUNT', ['STORE_BUY', 'STORE_SELL'], { storeKey: 'PIP' }]],
      [['EVENT_COUNT', ['RUN_RETURNED'], undefined]],
      [['EVENT_COUNT', ['STORE_BUY'], { storeKey: 'TOMMY' }]],
      [['EVENT_COUNT', ['QUEST_STORY_SCENE'], { questKey: 'ML_M09_TWO_BUYERS', sceneKey: 'two_buyers_briefed' }]],
      [['EVENT_COUNT', ['QUEST_STORY_SCENE'], { questKey: 'ML_M10_FAVOR_ALREADY_PAID', sceneKey: 'vic_favor_answered' }]],
    ]);
    expect(Object.keys(missingLineActTwo)).toEqual(['ML_M05_MISSING_LINE', ...NEW]);
  });

  it('pays a step above Act I, in cash and contact standing only', () => {
    const cash = (key: string) => quest(key).rewards.find((reward) => reward.kind === 'CASH')?.amount ?? 0;
    for (const key of NEW) {
      expect(quest(key).rewards.every((reward) => reward.kind === 'CASH' || reward.kind === 'CONTACT_REP')).toBe(true);
      expect(cash(key)).toBeGreaterThanOrEqual(250_000);
      expect(cash(key)).toBeLessThanOrEqual(400_000);
    }
    expect(NEW.reduce((sum, key) => sum + cash(key), 0)).toBe(1_600_000);
  });
});
