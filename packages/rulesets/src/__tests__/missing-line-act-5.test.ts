import { describe, expect, it } from 'vitest';
import { classicOgV26F, classicOgV26G, LATEST_RULESET, missingLineActFive } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import { resolveStoryCopy, type StoryFacts } from '../story-copy.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

const before = classicOgV26F.questDefinitions as QuestDefinitionCatalog;
const catalog = classicOgV26G.questDefinitions as QuestDefinitionCatalog;
const ACT = ['ML_M21_SIGNED_TWICE', 'ML_M22_NO_ONE_OWES_ALONE', 'ML_M23_LAST_APPOINTMENT', 'ML_M24_EVERYBODY_AT_THE_TABLE', 'ML_M25_MISSING_LINE'];
const quest = (key: string) => catalog[key] as QuestDefinition;
const facts = (branches: Record<string, string>, responses: Record<string, Record<string, string>> = {}): StoryFacts => ({
  completed: new Set(),
  branches: new Map(Object.entries(branches)),
  responses: new Map(Object.entries(responses).map(([key, scenes]) => [key, new Map(Object.entries(scenes))])),
});

describe('2.6.0-G The Missing Line, Act V', () => {
  it('ships as the latest ruleset with Mara Venn, opening from Act IV', () => {
    expect(LATEST_RULESET.meta.id).toBe('classic-og-v2.6-g');
    expect(questDefinitionProblems(catalog)).toEqual([]);
    expect(classicOgV26G.contacts).toHaveProperty('MARA_VENN');
    expect(classicOgV26F.contacts).not.toHaveProperty('MARA_VENN');
    expect(Object.keys(missingLineActFive)).toEqual(['ML_M20_MAP_IN_THE_MARGINS', ...ACT]);
    for (const [key, definition] of Object.entries(before)) {
      if (key !== 'ML_M20_MAP_IN_THE_MARGINS') expect(catalog[key]).toBe(definition);
    }
    const { followUpKeys, ...blocks } = quest('ML_M20_MAP_IN_THE_MARGINS');
    const { followUpKeys: _old, ...was } = before.ML_M20_MAP_IN_THE_MARGINS!;
    expect(blocks).toEqual(was);
    expect(followUpKeys).toEqual(['ML_M21_SIGNED_TWICE']);
    expect(Object.keys(catalog).slice(-ACT.length)).toEqual(ACT);
  });

  it('runs as one chain to the finale, which leads nowhere else', () => {
    let previous = 'ML_M20_MAP_IN_THE_MARGINS';
    ACT.forEach((key, index) => {
      expect(quest(key).prerequisites).toEqual([{ kind: 'QUEST_COMPLETED', params: { questKey: previous } }]);
      expect(quest(key).followUpKeys).toEqual(index < ACT.length - 1 ? [ACT[index + 1]] : []);
      expect(quest(key).story?.lesson).toBeUndefined();
      expect(quest(key).story?.chapter).toBe('Act V · Who Keeps the Book');
      previous = key;
    });
    expect(ACT.map((key) => quest(key).contactKey)).toEqual(['BLOCKS', 'MAMA_KING', 'MARA_VENN', 'MAMA_KING', 'MAMA_KING']);
  });

  it('offers Mara three answers and the book three endings, each paying the same', () => {
    const appointment = quest('ML_M23_LAST_APPOINTMENT');
    const finale = quest('ML_M25_MISSING_LINE');
    expect(appointment.branches!.map((branch) => branch.key)).toEqual(['MEET_MARA_ACCEPT', 'MEET_MARA_REFUSE', 'MEET_MARA_DEFER']);
    expect(finale.branches!.map((branch) => branch.key)).toEqual(['OPEN_BOOK', 'BURN_BOOK', 'KEEP_BOOK']);
    for (const branch of [...appointment.branches!, ...finale.branches!]) {
      expect(branch.rewards).toEqual([]);
      expect(branch.reputationDeltas).toEqual([{ contactKey: expect.any(String), amount: 2 }]);
    }
    for (const branch of appointment.branches!) expect(branch.followUpKeys).toEqual(['ML_M24_EVERYBODY_AT_THE_TABLE']);
    for (const branch of finale.branches!) expect(branch.followUpKeys).toEqual([]);
  });

  it('locks nothing: no specialty, unlock, cosmetic or item rewards anywhere in the act', () => {
    for (const key of ACT) {
      expect(quest(key).rewards.every((reward) => reward.kind === 'CASH' || reward.kind === 'CONTACT_REP')).toBe(true);
      for (const branch of quest(key).branches ?? []) expect(branch.rewards).toEqual([]);
    }
    const unlockedByCampaign = Object.values(catalog).filter((definition) => definition.prerequisites.some((prerequisite) =>
      (prerequisite.kind === 'QUEST_COMPLETED' || prerequisite.kind === 'BRANCH_CHOSEN') && String(prerequisite.params?.questKey ?? '').startsWith('ML_')
      && !definition.key.startsWith('ML_')));
    expect(unlockedByCampaign).toEqual([]);
  });

  it('uses only verified evidence for its work', () => {
    const work = ACT.flatMap((key) => quest(key).objectives
      .filter((objective) => !(objective.params?.eventTypes as string[]).includes('QUEST_STORY_SCENE'))
      .map((objective) => [key, objective.target, objective.params?.eventTypes, objective.params?.where]));
    expect(work).toEqual([
      ['ML_M21_SIGNED_TWICE', 1, ['SCOUT'], { districtKey: 'WINO_SLUMS' }],
      ['ML_M24_EVERYBODY_AT_THE_TABLE', 10, ['STORE_BUY'], { storeKey: 'CORNER', itemKey: 'BEER' }],
    ]);
  });

  it('answers earlier choices: Mara knows your stance, the table knows your answer, and the ending is your own', () => {
    const appointment = quest('ML_M23_LAST_APPOINTMENT').story!;
    expect(resolveStoryCopy(appointment, facts({ ML_M15_NAME_IN_THE_MARGIN: 'DISPUTE_THE_ENTRY' })).inProgress).toContain('You disputed my entry');
    expect(resolveStoryCopy(appointment, facts({ ML_M15_NAME_IN_THE_MARGIN: 'KEEP_A_COPY' })).inProgress).toContain('You copied my page');
    expect(resolveStoryCopy(appointment, facts({})).inProgress).toBe(appointment.inProgress);

    const table = quest('ML_M24_EVERYBODY_AT_THE_TABLE').story!;
    const intros = ['MEET_MARA_ACCEPT', 'MEET_MARA_REFUSE', 'MEET_MARA_DEFER'].map((branchKey) => resolveStoryCopy(table, facts({ ML_M23_LAST_APPOINTMENT: branchKey })).intro);
    expect(new Set(intros).size).toBe(3);

    const finale = quest('ML_M25_MISSING_LINE').story!;
    const endings = ['OPEN_BOOK', 'BURN_BOOK', 'KEEP_BOOK'].map((branchKey) => resolveStoryCopy(finale, facts({ ML_M25_MISSING_LINE: branchKey })).completed);
    expect(new Set(endings).size).toBe(3);
    expect(endings.every((line) => line !== finale.completed)).toBe(true);
    const families = resolveStoryCopy(finale, facts({}, { ML_M18_WHAT_MAMA_BOUGHT: { mama_debt_reckoned: 'tell_the_families' } }));
    expect(families.ready).toContain('families from Delancey');
    expect(families.completed).toBe(finale.completed);
  });

  it('pays the most of any act, with the finale the largest single chapter', () => {
    const cash = (key: string) => quest(key).rewards.find((reward) => reward.kind === 'CASH')?.amount ?? 0;
    expect(ACT.map(cash)).toEqual([850_000, 900_000, 900_000, 950_000, 1_500_000]);
  });
});
