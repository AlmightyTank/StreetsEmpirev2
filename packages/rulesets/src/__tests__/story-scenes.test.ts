import { describe, expect, it } from 'vitest';
import { questDefinitionProblems, storySceneProblems } from '../quest-definitions.js';
import type { QuestDefinition, QuestObjectiveDefinition, QuestStorySceneDefinition } from '../types.js';

const sceneObjective = (id: string, sceneKey: string, questKey = 'ML_TEST'): QuestObjectiveDefinition => ({
  id, kind: 'EVENT_COUNT', description: 'Play the scene.', target: 1,
  params: { eventTypes: ['QUEST_STORY_SCENE'], where: { questKey, sceneKey } },
});

const receipt: QuestStorySceneDefinition = {
  key: 'night_receipt',
  title: 'The receipt',
  prose: 'One line has been rubbed almost through the paper.',
  responses: [
    { key: 'return_unopened', label: 'Return it unopened', outcome: 'Mama nods and keeps the envelope.' },
    { key: 'read_the_line', label: 'Read the erased line', outcome: 'You can make out four letters.' },
  ],
};

function quest(overrides: Partial<QuestDefinition> = {}, scenes: readonly QuestStorySceneDefinition[] = [receipt]): QuestDefinition {
  return {
    key: 'ML_TEST',
    title: 'Test',
    description: 'A scene test.',
    contactKey: 'MAMA_KING',
    type: 'STORY',
    category: 'STREET',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [sceneObjective('handled', 'night_receipt')],
    bonusObjectives: [],
    rewards: [{ kind: 'CASH', amount: 1_000 }],
    story: {
      chapter: 'Chapter 1', intro: 'Rain.', inProgress: 'Still raining.', ready: 'Done.', completed: 'Closed.',
      actionHint: 'Read the receipt.', scenes,
    },
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
    ...overrides,
  };
}

describe('story scenes', () => {
  it('accepts a story job with a scene and no lesson text', () => {
    expect(questDefinitionProblems({ ML_TEST: quest() })).toEqual([]);
  });

  it('accepts a scene that opens after an ordinary objective', () => {
    const sale: QuestObjectiveDefinition = {
      id: 'pip_sale', kind: 'EVENT_COUNT', description: 'Sell to Pip.', target: 1,
      params: { eventTypes: ['STORE_SELL'], where: { storeKey: 'PIP' } },
    };
    expect(storySceneProblems(quest(
      { objectives: [sale, sceneObjective('handled', 'night_receipt')] },
      [{ ...receipt, after: ['pip_sale'] }],
    ))).toEqual([]);
  });

  it('rejects malformed scenes and responses', () => {
    const problems = storySceneProblems(quest({}, [{
      key: 'Bad Key', title: ' ', prose: '', responses: [
        { key: 'same', label: 'A', outcome: 'a' },
        { key: 'same', label: '', outcome: '' },
      ],
    }]));
    expect(problems).toEqual(expect.arrayContaining([
      'scene Bad Key: key must be lower_snake_case',
      'scene Bad Key: title is required',
      'scene Bad Key: prose is required',
      'scene Bad Key: duplicate response same',
      'scene Bad Key/same: label is required',
      'scene Bad Key/same: outcome is required',
    ]));
    expect(storySceneProblems(quest({}, [{ ...receipt, responses: [] }]))).toContain('scene night_receipt: at least one response is required');
    expect(storySceneProblems(quest({}, [receipt, receipt]))).toContain('scene night_receipt: duplicate key');
  });

  it('requires every scene objective to name a real scene on its own quest', () => {
    expect(storySceneProblems(quest({ objectives: [sceneObjective('handled', 'missing')] })))
      .toEqual(expect.arrayContaining(['objective handled: names unknown scene missing', 'scene night_receipt: no objective counts it']));
    expect(storySceneProblems(quest({ objectives: [sceneObjective('handled', 'night_receipt', 'OTHER_QUEST')] })))
      .toContain('objective handled: a scene objective must filter on questKey ML_TEST');
    expect(storySceneProblems(quest({ objectives: [{ ...sceneObjective('handled', 'night_receipt'), target: 2 }] })))
      .toContain('objective handled: a scene objective must be EVENT_COUNT with target 1');
    const mixed = sceneObjective('handled', 'night_receipt');
    expect(storySceneProblems(quest({ objectives: [{ ...mixed, params: { ...mixed.params, eventTypes: ['QUEST_STORY_SCENE', 'SCOUT'] } }] })))
      .toContain('objective handled: a scene objective counts only QUEST_STORY_SCENE');
  });

  it('rejects scenes that wait on unknown objectives or on each other', () => {
    expect(storySceneProblems(quest({}, [{ ...receipt, after: ['nope'] }])))
      .toContain('scene night_receipt: after names unknown required objective nope');
    const second: QuestStorySceneDefinition = { ...receipt, key: 'second', after: ['handled'] };
    const looped = storySceneProblems(quest(
      { objectives: [sceneObjective('handled', 'night_receipt'), sceneObjective('second_done', 'second')] },
      [{ ...receipt, after: ['second_done'] }, second],
    ));
    expect(looped.filter((problem) => problem.endsWith('after forms a cycle and can never open')).length).toBeGreaterThan(0);
  });

  it('is wired into the catalog check', () => {
    expect(questDefinitionProblems({ ML_TEST: quest({ objectives: [sceneObjective('handled', 'missing')] }) }))
      .toContain('ML_TEST: objective handled: names unknown scene missing');
  });
});
