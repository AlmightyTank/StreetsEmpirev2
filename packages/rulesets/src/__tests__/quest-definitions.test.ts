import { describe, expect, it } from 'vitest';
import { defineQuestCatalog, questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition } from '../types.js';

const freshFaces: QuestDefinition = {
  key: 'FRESH_FACES',
  title: 'Fresh Faces',
  description: 'Grow the crew.',
  contactKey: 'MAMA_KING',
  type: 'STORY',
  category: 'STREET',
  difficulty: 'STREET_JOB',
  prerequisites: [],
  objectives: [
    { id: 'crew_size', kind: 'RECRUIT_CREW', description: 'Build your crew.', target: 5, params: { eventTypes: ['SCOUT'], crew: 'ANY' } },
  ],
  bonusObjectives: [],
  rewards: [],
  followUpKeys: [],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
};

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
    { id: 'scout_turns', kind: 'SPEND_TURNS', description: 'Scout for 12 turns.', target: 12, params: { eventTypes: ['SCOUT'] } },
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
    const catalog = { FIRST_NIGHT_OUT: firstNightOut, FRESH_FACES: freshFaces };
    expect(() => defineQuestCatalog(catalog)).not.toThrow();
    expect(questDefinitionProblems(catalog)).toEqual([]);
  });

  it('rejects duplicate objective ids and invalid timers', () => {
    const broken: QuestDefinition = {
      ...firstNightOut,
      objectives: [
        ...firstNightOut.objectives,
        { id: 'scout_turns', kind: 'RECRUIT_CREW', description: 'Recruit someone.', target: 1, params: { eventTypes: ['SCOUT'] } },
      ],
      expiresAfterMinutes: 0,
    };

    expect(questDefinitionProblems({ FIRST_NIGHT_OUT: broken, FRESH_FACES: freshFaces })).toEqual([
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
      'FIRST_NIGHT_OUT: unknown follow-up WRONG_KEY',
    ]);
  });

  it('rejects unknown follow-ups', () => {
    const broken: QuestDefinition = {
      ...firstNightOut,
      followUpKeys: ['FRESH_FACES_TYPO'],
    };

    expect(questDefinitionProblems({ FIRST_NIGHT_OUT: broken })).toEqual([
      'FIRST_NIGHT_OUT: unknown follow-up FRESH_FACES_TYPO',
    ]);
  });

  it('rejects blank prerequisite and reward kinds', () => {
    const broken = {
      ...freshFaces,
      prerequisites: [{ kind: '' }],
      rewards: [{ kind: '' }],
    } as unknown as QuestDefinition;

    expect(questDefinitionProblems({ FRESH_FACES: broken })).toEqual([
      'FRESH_FACES: prerequisite kind is required',
      'FRESH_FACES: reward kind is required',
    ]);
  });

  it('rejects malformed Phase B objective configuration', () => {
    const broken = {
      ...freshFaces,
      objectives: [
        { id: 'sum', kind: 'EVENT_SUM', description: 'Move product.', target: 10, params: { eventTypes: [] } },
        { id: 'crew', kind: 'RECRUIT_CREW', description: 'Recruit.', target: 5, params: { eventTypes: ['SCOUT'], crew: 'CARS' } },
      ],
    } as unknown as QuestDefinition;

    expect(questDefinitionProblems({ FRESH_FACES: broken })).toEqual([
      'FRESH_FACES/sum: eventTypes must be a non-empty string array',
      'FRESH_FACES/sum: EVENT_SUM requires a field',
      'FRESH_FACES/crew: crew must be ANY, WHORES or THUGS',
    ]);
  });


  it('requires explicit event scopes for event-driven objectives', () => {
    const broken = {
      ...freshFaces,
      objectives: [
        { id: 'count', kind: 'EVENT_COUNT', description: 'Do one thing.', target: 1 },
        { id: 'turns', kind: 'SPEND_TURNS', description: 'Spend turns.', target: 5 },
        { id: 'cash', kind: 'EARN_CASH', description: 'Earn cash.', target: 500 },
      ],
    } as unknown as QuestDefinition;

    expect(questDefinitionProblems({ FRESH_FACES: broken })).toEqual([
      'FRESH_FACES/count: EVENT_COUNT requires eventTypes',
      'FRESH_FACES/turns: SPEND_TURNS requires eventTypes',
      'FRESH_FACES/cash: EARN_CASH requires eventTypes',
    ]);
  });

  it('rejects malformed C-G prerequisites and rewards', () => {
    const broken = {
      ...freshFaces,
      prerequisites: [
        { kind: 'QUEST_COMPLETED', params: { questKey: 'DOES_NOT_EXIST' } },
        { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: '', points: 0 } },
      ],
      rewards: [
        { kind: 'CASH', amount: 0 },
        { kind: 'CONTACT_REP', amount: 5 },
        { kind: 'WEAPON_ACCESS', key: 'MINIGUN' },
      ],
    } as unknown as QuestDefinition;

    expect(questDefinitionProblems({ FRESH_FACES: broken })).toEqual([
      'FRESH_FACES: unknown prerequisite quest DOES_NOT_EXIST',
      'FRESH_FACES: CONTACT_REP_AT_LEAST requires contactKey',
      'FRESH_FACES: CONTACT_REP_AT_LEAST requires positive points',
      'FRESH_FACES: CASH reward requires a positive amount',
      'FRESH_FACES: CONTACT_REP reward requires a key',
      'FRESH_FACES: WEAPON_ACCESS reward requires SHOTGUN, TEK9 or AK47',
    ]);
  });

});
