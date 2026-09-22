import { describe, expect, it } from 'vitest';
import { defineQuestCatalog, questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition } from '../types.js';

const firstNightOut: QuestDefinition = {
  key: 'FIRST_NIGHT_OUT',
  title: 'First Night Out',
  description: 'Scout the streets and learn how the city pays.',
  contactKey: 'MAMA_KING',
  type: 'STORY',
  category: 'STREET',
  difficulty: 'STREET_JOB',
  prerequisites: [],
  objectives: [
    { id: 'scout_turns', kind: 'SPEND_TURNS', description: 'Scout for 12 turns.', target: 12 },
  ],
  bonusObjectives: [],
  rewards: [{ kind: 'CASH', amount: 250000 }],
  followUpKeys: ['FRESH_FACES'],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
};

describe('quest definition foundation', () => {
  it('accepts a well-formed catalog', () => {
    expect(() => defineQuestCatalog({ FIRST_NIGHT_OUT: firstNightOut })).not.toThrow();
    expect(questDefinitionProblems({ FIRST_NIGHT_OUT: firstNightOut })).toEqual([]);
  });

  it('rejects duplicate objective ids and invalid timers', () => {
    const broken: QuestDefinition = {
      ...firstNightOut,
      objectives: [
        ...firstNightOut.objectives,
        { id: 'scout_turns', kind: 'RECRUIT', description: 'Recruit someone.', target: 1 },
      ],
      expiresAfterMinutes: 0,
    };

    expect(questDefinitionProblems({ FIRST_NIGHT_OUT: broken })).toEqual([
      'FIRST_NIGHT_OUT: duplicate objective id scout_turns',
      'FIRST_NIGHT_OUT: expiresAfterMinutes must be a positive integer or null',
    ]);
  });

  it('rejects catalog-key drift and self-looping follow-ups', () => {
    const broken: QuestDefinition = {
      ...firstNightOut,
      key: 'WRONG_KEY',
      followUpKeys: ['WRONG_KEY'],
    };

    expect(questDefinitionProblems({ FIRST_NIGHT_OUT: broken })).toEqual([
      'FIRST_NIGHT_OUT: definition key is WRONG_KEY',
      'FIRST_NIGHT_OUT: quest cannot follow up to itself',
    ]);
  });
});
