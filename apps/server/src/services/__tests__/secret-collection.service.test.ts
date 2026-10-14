import { describe, expect, it } from 'vitest';
import type { Ruleset } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { SecretCollectionService } from '../secret-collection.service.js';
import { activityMatchesSecretTrigger, secretSourceEncounterKey } from '../secret-quest.service.js';

function testRuleset(): Ruleset {
  const secret = (key: string, family: string, extraAvailability: Record<string, unknown> = {}) => ({
    key,
    title: `Title ${key}`,
    description: `Description ${key}.`,
    contactKey: 'VIC',
    type: 'SECRET',
    category: 'STREET',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [
      { id: 'clue_a', kind: 'EVENT_COUNT', description: 'Find clue A.', target: 2, params: { eventTypes: ['SCOUT'] } },
      { id: 'clue_b', kind: 'EVENT_COUNT', description: 'Find clue B.', target: 1, params: { eventTypes: ['SCOUT'] } },
    ],
    bonusObjectives: [],
    rewards: [{ kind: 'CASH', amount: 1_000_000 }],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: {
        kind: 'ACTIVITY_COUNT',
        eventTypes: ['SCOUT'],
        where: { 'encounter.key': 'scout-colorful-van' },
        target: 1,
      },
      secretContent: { family, discoveryTier: 'HIDDEN', clueMilestones: ['clue_a'] },
      ...extraAvailability,
    },
  });
  return {
    meta: { id: 'test-ruleset', version: 'slice-c.1', name: 'Slice C Test Ruleset' },
    contacts: { VIC: { key: 'VIC', name: 'Vic', shortName: 'Vic', role: 'Fixer', description: 'Fixer.' } },
    questDefinitions: {
      SECRET_ONE: secret('SECRET_ONE', 'BLACKWOOD'),
      SECRET_TWO: secret('SECRET_TWO', 'BLACKWOOD'),
      SECRET_OTHER: secret('SECRET_OTHER', 'GUILD'),
    },
  } as unknown as Ruleset;
}

interface MockState {
  questRows: Array<{
    questDefinitionId: string;
    status: string;
    objectiveProgress: unknown;
    claimedAt: Date | null;
    createdAt: Date;
    questDefinition: { key: string; rulesetId: string; rulesetVersion: string };
  }>;
  unlocks: Array<{
    key: string;
    title: string;
    description: string;
    rarity: string;
    sourceQuestKey: string;
    awardedAt: Date;
  }>;
}

function mockDb(state: MockState): Db {
  return {
    questDefinition: {
      findMany: async () => [
        { id: 'def-one', key: 'SECRET_ONE' },
        { id: 'def-two', key: 'SECRET_TWO' },
        { id: 'def-other', key: 'SECRET_OTHER' },
      ],
    },
    playerQuest: { findMany: async () => state.questRows.map((row) => ({ ...row })) },
    accountCosmeticUnlock: { findMany: async () => state.unlocks.map((row) => ({ ...row })) },
  } as unknown as Db;
}

describe('slice C secret collection', () => {
  it('shows nothing unrevealed: no rows, no keys, no families', async () => {
    const collection = await SecretCollectionService.forPlayer(
      mockDb({ questRows: [], unlocks: [] }),
      'player-1',
      'account-1',
      testRuleset(),
    );
    expect(collection).toEqual({ inProgress: [], trophies: [], families: [] });
  });

  it('projects a revealed secret with clue milestones, source encounter, and rewards', async () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const collection = await SecretCollectionService.forPlayer(
      mockDb({
        questRows: [{
          questDefinitionId: 'def-one',
          status: 'ACTIVE',
          objectiveProgress: { clue_a: { current: 2, target: 2, completed: true } },
          claimedAt: null,
          createdAt: at,
          questDefinition: { key: 'SECRET_ONE', rulesetId: 'test-ruleset', rulesetVersion: 'slice-c.1' },
        }],
        unlocks: [],
      }),
      'player-1',
      'account-1',
      testRuleset(),
    );
    expect(collection.inProgress).toHaveLength(1);
    const secret = collection.inProgress[0]!;
    expect(secret.questKey).toBe('SECRET_ONE');
    expect(secret.contactName).toBe('Vic');
    expect(secret.family).toBe('BLACKWOOD');
    expect(secret.sourceEncounterKey).toBe('scout-colorful-van');
    expect(secret.clues).toEqual([{
      id: 'clue_a',
      description: 'Find clue A.',
      current: 2,
      target: 2,
      completed: true,
    }]);
    expect(secret.cluesFound).toBe(1);
    expect(secret.cluesTotal).toBe(1);
    expect(secret.completed).toBe(false);
    expect(secret.claimed).toBe(false);
    expect(secret.rewardLabels).toHaveLength(1);
    // BLACKWOOD has 2 enabled secrets, 1 found -> 1 undiscovered; GUILD stays hidden.
    expect(collection.families).toEqual([{ family: 'BLACKWOOD', found: 1, undiscovered: 1, trophies: 0 }]);
  });

  it('keeps permanent trophies across rounds but resets in-progress stories', async () => {
    const awardedAt = new Date('2026-09-01T00:00:00Z');
    const state: MockState = {
      questRows: [{
        questDefinitionId: 'def-one',
        status: 'COMPLETED',
        objectiveProgress: { clue_a: { current: 2, target: 2, completed: true } },
        claimedAt: awardedAt,
        createdAt: awardedAt,
        questDefinition: { key: 'SECRET_ONE', rulesetId: 'test-ruleset', rulesetVersion: 'slice-c.1' },
      }],
      unlocks: [
        { key: 'BLACKWOOD_FRAME', title: 'Blackwood Frame', description: 'Frame.', rarity: 'rare', sourceQuestKey: 'SECRET_ONE', awardedAt },
        { key: 'RANDOM_HAT', title: 'Random Hat', description: 'Hat.', rarity: 'common', sourceQuestKey: 'NOT_A_SECRET', awardedAt },
      ],
    };
    const roundOne = await SecretCollectionService.forPlayer(mockDb(state), 'player-round-1', 'account-1', testRuleset());
    expect(roundOne.inProgress).toHaveLength(1);
    expect(roundOne.inProgress[0]!.claimed).toBe(true);
    expect(roundOne.trophies).toEqual([{
      key: 'BLACKWOOD_FRAME',
      title: 'Blackwood Frame',
      description: 'Frame.',
      rarity: 'rare',
      sourceQuestKey: 'SECRET_ONE',
      family: 'BLACKWOOD',
      earnedAt: awardedAt.toISOString(),
    }]);
    expect(roundOne.families).toEqual([{ family: 'BLACKWOOD', found: 1, undiscovered: 1, trophies: 1 }]);

    // New round, same account: fresh RoundPlayer has no quest rows, trophies persist.
    const roundTwo = await SecretCollectionService.forPlayer(
      mockDb({ questRows: [], unlocks: state.unlocks }),
      'player-round-2',
      'account-1',
      testRuleset(),
    );
    expect(roundTwo.inProgress).toEqual([]);
    expect(roundTwo.trophies).toEqual(roundOne.trophies);
    expect(roundTwo.families).toEqual([]);
  });

  it('ignores rows pinned to other ruleset versions', async () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const collection = await SecretCollectionService.forPlayer(
      mockDb({
        questRows: [{
          questDefinitionId: 'def-one',
          status: 'ACTIVE',
          objectiveProgress: {},
          claimedAt: null,
          createdAt: at,
          questDefinition: { key: 'SECRET_ONE', rulesetId: 'test-ruleset', rulesetVersion: 'older' },
        }],
        unlocks: [],
      }),
      'player-1',
      'account-1',
      testRuleset(),
    );
    expect(collection.inProgress).toEqual([]);
  });

  it('matches encounter keys across both payload nestings', () => {
    const viaEncounter = { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT'], where: { 'encounter.key': 'scout-colorful-van' }, target: 1 } as const;
    const viaRandom = { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT'], where: { 'randomEncounter.key': 'scout-colorful-van' }, target: 1 } as const;
    const scoutPayload = (payload: object) => [{ type: 'SCOUT', payload: payload as never }];
    expect(activityMatchesSecretTrigger(viaEncounter, scoutPayload({ encounter: { key: 'scout-colorful-van' } }))).toBe(true);
    expect(activityMatchesSecretTrigger(viaEncounter, scoutPayload({ randomEncounter: { key: 'scout-colorful-van' } }))).toBe(true);
    expect(activityMatchesSecretTrigger(viaRandom, scoutPayload({ encounter: { key: 'scout-colorful-van' } }))).toBe(true);
    expect(activityMatchesSecretTrigger(viaEncounter, scoutPayload({ encounter: { key: 'other' } }))).toBe(false);

    const ruleset = testRuleset();
    expect(secretSourceEncounterKey(ruleset.questDefinitions?.SECRET_ONE!)).toBe('scout-colorful-van');
  });
});
