import { describe, expect, it } from 'vitest';
import type { Ruleset } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { isSecretContentEnabled, secretRewardKeys, syncSecretQuestAttempts } from '../secret-quest.service.js';

function testRuleset(): Ruleset {
  return {
    meta: { id: 'test-ruleset', version: 'slice-a.1', name: 'Slice A Test Ruleset' },
    questDefinitions: {
      SECRET_SLICE_A_DEMO: {
        key: 'SECRET_SLICE_A_DEMO',
        title: 'Slice A Demo',
        description: 'Test-defined secret.',
        contactKey: null,
        type: 'SECRET',
        category: 'STREET',
        difficulty: 'STREET_JOB',
        prerequisites: [],
        objectives: [
          { id: 'clue_a', kind: 'EVENT_COUNT', description: 'Find it.', target: 1, params: { eventTypes: ['SCOUT'] } },
        ],
        bonusObjectives: [],
        rewards: [{ kind: 'COSMETIC_UNLOCK', key: 'TEST_FRAME' }],
        followUpKeys: [],
        repeatability: 'ONCE',
        expiresAfterMinutes: null,
        availability: {
          hidden: true,
          secretTrigger: { kind: 'STATE_AT_LEAST', field: 'heat', target: 80 },
          secretContent: { family: 'TEST_FAMILY', discoveryTier: 'HIDDEN', clueMilestones: ['clue_a'] },
        },
      },
      SECRET_DISABLED: {
        key: 'SECRET_DISABLED',
        title: 'Disabled',
        description: 'Never reveals.',
        contactKey: null,
        type: 'SECRET',
        category: 'STREET',
        difficulty: 'STREET_JOB',
        prerequisites: [],
        objectives: [
          { id: 'clue_a', kind: 'EVENT_COUNT', description: 'Find it.', target: 1, params: { eventTypes: ['SCOUT'] } },
        ],
        bonusObjectives: [],
        rewards: [],
        followUpKeys: [],
        repeatability: 'ONCE',
        expiresAfterMinutes: null,
        availability: {
          hidden: true,
          secretTrigger: { kind: 'STATE_AT_LEAST', field: 'heat', target: 1 },
          secretContent: { family: 'TEST_FAMILY', discoveryTier: 'HIDDEN', disabled: true },
        },
      },
      SECRET_TEST_ONLY: {
        key: 'SECRET_TEST_ONLY',
        title: 'Test only',
        description: 'Beta gate.',
        contactKey: null,
        type: 'SECRET',
        category: 'STREET',
        difficulty: 'STREET_JOB',
        prerequisites: [],
        objectives: [
          { id: 'clue_a', kind: 'EVENT_COUNT', description: 'Find it.', target: 1, params: { eventTypes: ['SCOUT'] } },
        ],
        bonusObjectives: [],
        rewards: [],
        followUpKeys: [],
        repeatability: 'ONCE',
        expiresAfterMinutes: null,
        availability: {
          hidden: true,
          secretTrigger: { kind: 'STATE_AT_LEAST', field: 'heat', target: 1 },
          secretContent: { family: 'TEST_FAMILY', discoveryTier: 'LEGENDARY', testOnly: true },
        },
      },
    },
  } as unknown as Ruleset;
}

function mockDb(opts?: { heat?: number; failFirstCreate?: boolean; seenWhere?: unknown[] }): {
  db: Db;
  rows: Array<{ questDefinitionId: string; status: string }>;
} {
  const rows: Array<{ questDefinitionId: string; status: string }> = [];
  const definitions = [
    { id: 'def-demo', key: 'SECRET_SLICE_A_DEMO' },
    { id: 'def-disabled', key: 'SECRET_DISABLED' },
    { id: 'def-testonly', key: 'SECRET_TEST_ONLY' },
  ];
  let createCalls = 0;
  const db = {
    questDefinition: {
      findMany: async (args?: unknown) => {
        opts?.seenWhere?.push(args);
        return definitions;
      },
    },
    playerQuest: {
      findMany: async () => rows.map((row) => ({ ...row })),
      create: async ({ data }: { data: { questDefinitionId: string; status: string } }) => {
        createCalls += 1;
        if (opts?.failFirstCreate && createCalls === 1) {
          // Winner's write landed; this caller lost the race on the unique constraint.
          rows.push({ questDefinitionId: data.questDefinitionId, status: data.status });
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { questDefinitionId: data.questDefinitionId, status: data.status };
        rows.push(row);
        return row;
      },
    },
    roundPlayer: {
      findUnique: async () => ({ heat: opts?.heat ?? 80, whores: 10, netWorthCents: 0n }),
    },
    turf: { count: async () => 0 },
    playerActivity: { findMany: async () => [] },
  } as unknown as Db;
  return { db, rows };
}

describe('slice A secret discovery foundation', () => {
  it('discovers a test-defined secret once through the existing quest contract', async () => {
    const ruleset = testRuleset();
    const { db, rows } = mockDb({ heat: 10 });
    // Unrevealed: trigger not met, no row written (spoiler privacy).
    expect(await syncSecretQuestAttempts(db, 'player-1', ruleset)).toEqual([]);
    expect(rows).toHaveLength(0);

    const hot = mockDb({ heat: 80 });
    // Disabled + test-only gates apply: only the demo reveals without testMode.
    expect(await syncSecretQuestAttempts(hot.db, 'player-1', ruleset)).toEqual(['SECRET_SLICE_A_DEMO']);
    expect(hot.rows).toEqual([{ questDefinitionId: 'def-demo', status: 'AVAILABLE' }]);
  });

  it('respects disable and test-mode controls', async () => {
    const ruleset = testRuleset();
    const demo = ruleset.questDefinitions?.SECRET_SLICE_A_DEMO!;
    const disabled = ruleset.questDefinitions?.SECRET_DISABLED!;
    const testOnly = ruleset.questDefinitions?.SECRET_TEST_ONLY!;
    expect(isSecretContentEnabled(demo)).toBe(true);
    expect(isSecretContentEnabled(disabled)).toBe(false);
    expect(isSecretContentEnabled(testOnly)).toBe(false);
    expect(isSecretContentEnabled(testOnly, { testMode: true })).toBe(true);

    const { db } = mockDb({ heat: 80 });
    expect(await syncSecretQuestAttempts(db, 'player-1', ruleset, { testMode: true })).toEqual(
      expect.arrayContaining(['SECRET_SLICE_A_DEMO', 'SECRET_TEST_ONLY']),
    );
    expect(await syncSecretQuestAttempts(db, 'player-1', ruleset, { testMode: true })).not.toContain('SECRET_DISABLED');
  });

  it('survives a concurrent reveal race without duplicate awards', async () => {
    const ruleset = testRuleset();
    const { db, rows } = mockDb({ heat: 80, failFirstCreate: true });
    // First create hits the PlayerQuest unique constraint (P2002); sync absorbs it.
    await expect(syncSecretQuestAttempts(db, 'player-1', ruleset)).resolves.toContain('SECRET_SLICE_A_DEMO');
    // Second sync sees the row and stays quiet: discovered once, recorded once.
    expect(await syncSecretQuestAttempts(db, 'player-1', ruleset)).toEqual([]);
    expect(rows.filter((row) => row.questDefinitionId === 'def-demo')).toHaveLength(1);
  });

  it('pins discovery to the active ruleset version', async () => {
    const ruleset = testRuleset();
    const seenWhere: unknown[] = [];
    const { db } = mockDb({ heat: 80, seenWhere });
    await syncSecretQuestAttempts(db, 'player-1', ruleset);
    const where = (seenWhere[0] as { where: { rulesetId: string; rulesetVersion: string } }).where;
    expect(where.rulesetId).toBe('test-ruleset');
    expect(where.rulesetVersion).toBe('slice-a.1');
  });

  it('exposes reward keys for contract auditing', () => {
    const ruleset = testRuleset();
    expect(secretRewardKeys(ruleset.questDefinitions?.SECRET_SLICE_A_DEMO!)).toEqual(['TEST_FRAME']);
    expect(secretRewardKeys(ruleset.questDefinitions?.SECRET_DISABLED!)).toEqual([]);
  });
});
