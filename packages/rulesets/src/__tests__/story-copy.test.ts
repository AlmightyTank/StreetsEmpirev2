import { describe, expect, it } from 'vitest';
import { questDefinitionProblems, storyVariantProblems } from '../quest-definitions.js';
import { NO_STORY_FACTS, resolveStoryCopy, storyConditionHolds, storyFactQuestKeys, type StoryFacts } from '../story-copy.js';
import type { QuestDefinition, QuestStoryDefinition, QuestStoryVariant } from '../types.js';

const story: QuestStoryDefinition = {
  chapter: 'Act IV', intro: 'Default intro.', inProgress: 'Default progress.', ready: 'Default ready.', completed: 'Default completed.', actionHint: 'Default hint.',
};

const facts = (partial: Partial<{ completed: string[]; branches: Record<string, string>; responses: Record<string, Record<string, string>> }>): StoryFacts => ({
  completed: new Set(partial.completed ?? []),
  branches: new Map(Object.entries(partial.branches ?? {})),
  responses: new Map(Object.entries(partial.responses ?? {}).map(([quest, scenes]) => [quest, new Map(Object.entries(scenes))])),
});

function quest(key: string, overrides: Partial<QuestDefinition> = {}): QuestDefinition {
  return {
    key, title: key, description: `${key} description`, contactKey: 'MAMA_KING', type: 'STORY', category: 'CAMPAIGN', difficulty: 'STREET_JOB',
    prerequisites: [], objectives: [{ id: 'run', kind: 'EVENT_COUNT', description: 'Run.', target: 1, params: { eventTypes: ['RUN_RETURNED'] } }],
    bonusObjectives: [], rewards: [{ kind: 'CASH', amount: 1_000 }], followUpKeys: [], repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
    ...overrides,
  };
}

const source = quest('SOURCE', {
  branches: [{ key: 'LEFT', title: 'Left', description: 'Go left.', rewards: [], reputationDeltas: [], followUpKeys: [] }],
  objectives: [{ id: 'scene', kind: 'EVENT_COUNT', description: 'Scene.', target: 1, params: { eventTypes: ['QUEST_STORY_SCENE'], where: { questKey: 'SOURCE', sceneKey: 'choice' } } }],
  story: { ...story, scenes: [{ key: 'choice', title: 'Choice', prose: 'Choose.', responses: [{ key: 'yes', label: 'Yes', outcome: 'Yes.' }] }] },
});

describe('story copy variants', () => {
  it('checks each kind of condition against what the player did', () => {
    const done = facts({ completed: ['A'], branches: { B: 'LEFT' }, responses: { C: { choice: 'yes' } } });
    expect(storyConditionHolds({ kind: 'QUEST_COMPLETED', questKey: 'A' }, done)).toBe(true);
    expect(storyConditionHolds({ kind: 'QUEST_COMPLETED', questKey: 'B' }, done)).toBe(false);
    expect(storyConditionHolds({ kind: 'BRANCH_CHOSEN', questKey: 'B', branchKey: 'LEFT' }, done)).toBe(true);
    expect(storyConditionHolds({ kind: 'BRANCH_CHOSEN', questKey: 'B', branchKey: 'RIGHT' }, done)).toBe(false);
    expect(storyConditionHolds({ kind: 'SCENE_RESPONSE', questKey: 'C', sceneKey: 'choice', responseKey: 'yes' }, done)).toBe(true);
    expect(storyConditionHolds({ kind: 'SCENE_RESPONSE', questKey: 'C', sceneKey: 'choice', responseKey: 'no' }, done)).toBe(false);
  });

  it('keeps the default lines when nothing matches, and never leaks the variants', () => {
    const variants: QuestStoryVariant[] = [{ when: { kind: 'QUEST_COMPLETED', questKey: 'A' }, intro: 'Changed.' }];
    expect(resolveStoryCopy({ ...story, variants }, NO_STORY_FACTS)).toEqual(story);
    expect(resolveStoryCopy(story, NO_STORY_FACTS)).toEqual(story);
  });

  it('replaces each line from the first matching variant that has it', () => {
    const variants: QuestStoryVariant[] = [
      { when: { kind: 'QUEST_COMPLETED', questKey: 'NOT_DONE' }, intro: 'Never.' },
      { when: { kind: 'BRANCH_CHOSEN', questKey: 'B', branchKey: 'LEFT' }, intro: 'Left intro.' },
      { when: { kind: 'QUEST_COMPLETED', questKey: 'A' }, intro: 'Later intro.', completed: 'A completed.' },
    ];
    expect(resolveStoryCopy({ ...story, variants }, facts({ completed: ['A'], branches: { B: 'LEFT' } }))).toEqual({
      ...story, intro: 'Left intro.', completed: 'A completed.',
    });
  });

  it('lists the quests a catalog’s lines depend on', () => {
    expect(storyFactQuestKeys(undefined)).toEqual([]);
    expect(storyFactQuestKeys({ SOURCE: source })).toEqual([]);
    const target = quest('TARGET', { story: { ...story, variants: [
      { when: { kind: 'BRANCH_CHOSEN', questKey: 'SOURCE', branchKey: 'LEFT' }, intro: 'x' },
      { when: { kind: 'SCENE_RESPONSE', questKey: 'SOURCE', sceneKey: 'choice', responseKey: 'yes' }, ready: 'y' },
    ] } });
    expect(storyFactQuestKeys({ SOURCE: source, TARGET: target })).toEqual(['SOURCE']);
  });

  it('accepts variants that name real outcomes', () => {
    const target = quest('TARGET', { story: { ...story, variants: [
      { when: { kind: 'BRANCH_CHOSEN', questKey: 'SOURCE', branchKey: 'LEFT' }, intro: 'Left.' },
      { when: { kind: 'SCENE_RESPONSE', questKey: 'SOURCE', sceneKey: 'choice', responseKey: 'yes' }, completed: 'Yes.' },
      { when: { kind: 'QUEST_COMPLETED', questKey: 'SOURCE' }, actionHint: 'Done.' },
    ] } });
    expect(questDefinitionProblems({ SOURCE: source, TARGET: target })).toEqual([]);
  });

  it('rejects variants that name nothing real, replace nothing, or replace something they may not', () => {
    const catalog = { SOURCE: source };
    const problems = (variants: unknown[]) => storyVariantProblems(quest('TARGET', { story: { ...story, variants: variants as QuestStoryVariant[] } }), catalog);
    expect(problems([{ when: { kind: 'QUEST_COMPLETED', questKey: 'GHOST' }, intro: 'x' }])).toEqual(['variant 1: names unknown quest GHOST']);
    expect(problems([{ when: { kind: 'BRANCH_CHOSEN', questKey: 'SOURCE', branchKey: 'RIGHT' }, intro: 'x' }])).toEqual(['variant 1: unknown branch SOURCE/RIGHT']);
    expect(problems([{ when: { kind: 'SCENE_RESPONSE', questKey: 'SOURCE', sceneKey: 'other', responseKey: 'yes' }, intro: 'x' }])).toEqual(['variant 1: unknown scene SOURCE/other']);
    expect(problems([{ when: { kind: 'SCENE_RESPONSE', questKey: 'SOURCE', sceneKey: 'choice', responseKey: 'no' }, intro: 'x' }])).toEqual(['variant 1: unknown response SOURCE/choice/no']);
    expect(problems([{ when: { kind: 'QUEST_COMPLETED', questKey: 'SOURCE' } }])).toEqual(['variant 1: replaces no line']);
    expect(problems([{ when: { kind: 'QUEST_COMPLETED', questKey: 'SOURCE' }, chapter: 'Nope' }])).toEqual(['variant 1: cannot replace chapter']);
    expect(problems([{ when: { kind: 'QUEST_COMPLETED', questKey: 'SOURCE' }, intro: ' ' }])).toEqual(['variant 1: intro is empty']);
    expect(problems([{ when: { kind: 'SOMETHING', questKey: 'SOURCE' }, intro: 'x' }])).toEqual(['variant 1: unknown condition SOMETHING']);
  });
});
