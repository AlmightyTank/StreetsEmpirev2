import { describe, expect, it } from 'vitest';
import { questDefinitionProblems, secretContentProblems, secretTriggerProblems } from '../quest-definitions.js';
import type { QuestDefinition } from '../types.js';

function secretBase(): QuestDefinition {
  return {
    key: 'SECRET_TEST_SLICE_A',
    title: 'Slice A Test Secret',
    description: 'Test-defined secret for the Slice A foundation contract.',
    contactKey: null,
    type: 'SECRET',
    category: 'STREET',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [
      { id: 'clue_a', kind: 'EVENT_COUNT', description: 'Find clue A.', target: 1, params: { eventTypes: ['SCOUT'] } },
    ],
    bonusObjectives: [],
    rewards: [],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: { kind: 'STATE_AT_LEAST', field: 'heat', target: 80 },
    },
  };
}

describe('slice A secret trigger contract', () => {
  it('accepts every supported trigger kind', () => {
    expect(secretTriggerProblems({ kind: 'STATE_AT_LEAST', field: 'heat', target: 80 })).toEqual([]);
    expect(secretTriggerProblems({ kind: 'TURF_COUNT_AT_LEAST', target: 3 })).toEqual([]);
    expect(secretTriggerProblems({ kind: 'ACTIVITY_COUNT', eventTypes: ['RAID_ATTACK'], target: 3 })).toEqual([]);
    expect(secretTriggerProblems({
      kind: 'ACTIVITY_OBJECT_SUM_AT_LEAST',
      eventTypes: ['RUN_RETURNED'],
      field: 'cargoBack',
      target: 500,
    })).toEqual([]);
  });

  it('rejects unknown kinds, bad targets, and missing per-kind fields', () => {
    expect(secretTriggerProblems({ kind: 'DREAMS', target: 1 })[0]).toMatch(/kind must be/);
    expect(secretTriggerProblems({ kind: 'STATE_AT_LEAST', field: 'heat', target: 0 })[0]).toMatch(/target/);
    expect(secretTriggerProblems({ kind: 'STATE_AT_LEAST', field: 'cash', target: 1 })[0]).toMatch(/field/);
    expect(secretTriggerProblems({ kind: 'TURF_COUNT_AT_LEAST', target: 1.5 })[0]).toMatch(/whole number/);
    expect(secretTriggerProblems({ kind: 'ACTIVITY_COUNT', target: 2 })[0]).toMatch(/eventTypes/);
    expect(secretTriggerProblems({
      kind: 'ACTIVITY_OBJECT_SUM_AT_LEAST',
      eventTypes: ['RUN_RETURNED'],
      target: 5,
    })[0]).toMatch(/field/);
  });
});

describe('slice A secret content descriptor', () => {
  it('is optional but validated when present', () => {
    const quest = secretBase();
    expect(secretContentProblems(undefined, quest)).toEqual([]);
    expect(secretContentProblems(
      { family: 'TEST_FAMILY', discoveryTier: 'HIDDEN', clueMilestones: ['clue_a'], rarityWeight: 2, cooldownMinutes: 60 },
      quest,
    )).toEqual([]);
  });

  it('rejects bad family, tier, milestones, rarity, cooldown, districts, and flags', () => {
    const quest = secretBase();
    expect(secretContentProblems({ discoveryTier: 'HIDDEN' }, quest)).toEqual([
      'SECRET secretContent requires family',
    ]);
    expect(secretContentProblems({ family: 'F', discoveryTier: 'MYTHIC' }, quest)).toEqual([
      'SECRET secretContent discoveryTier must be OBVIOUS|HIDDEN|LEGENDARY',
    ]);
    expect(secretContentProblems(
      { family: 'F', discoveryTier: 'HIDDEN', clueMilestones: ['nope'] },
      quest,
    )).toEqual(['SECRET secretContent unknown clue milestone nope']);
    expect(secretContentProblems(
      { family: 'F', discoveryTier: 'HIDDEN', rarityWeight: 0 },
      quest,
    )).toEqual(['SECRET secretContent rarityWeight must be greater than zero']);
    expect(secretContentProblems(
      { family: 'F', discoveryTier: 'HIDDEN', cooldownMinutes: -1 },
      quest,
    )).toEqual(['SECRET secretContent cooldownMinutes must be a non-negative integer or null']);
    expect(secretContentProblems(
      { family: 'F', discoveryTier: 'HIDDEN', districts: ['NOWHERE'] },
      quest,
    )[0]).toMatch(/districts/);
    expect(secretContentProblems(
      { family: 'F', discoveryTier: 'HIDDEN', testOnly: 'yes' },
      quest,
    )).toEqual(['SECRET secretContent testOnly must be a boolean']);
  });

  it('wires into the catalog validator with key prefixes', () => {
    const broken: QuestDefinition = {
      ...secretBase(),
      availability: { hidden: true, secretTrigger: { kind: 'STATE_AT_LEAST', field: 'heat', target: 0 } },
    };
    expect(questDefinitionProblems({ SECRET_TEST_SLICE_A: broken })).toEqual([
      'SECRET_TEST_SLICE_A: SECRET secretTrigger target must be greater than zero',
    ]);
  });
});
