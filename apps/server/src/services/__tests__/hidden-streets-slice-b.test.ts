import { describe, expect, it } from 'vitest';
import { classicOgV18P } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { activityMatchesSecretTrigger, syncSecretQuestAttempts } from '../secret-quest.service.js';

const VAN_TRIGGER = {
  kind: 'ACTIVITY_COUNT',
  eventTypes: ['SCOUT'],
  where: { 'encounter.key': 'scout-colorful-van' },
  target: 1,
} as const;

function vanScoutPayload() {
  return {
    turns: 10,
    encounter: {
      key: 'scout-colorful-van',
      title: 'The Colorful Van',
      text: 'Paw prints toward the estate.',
      tone: 'neutral',
      effects: {},
    },
  };
}

function mockDb(activities: Array<{ type: string; payload: unknown }>): {
  db: Db;
  rows: Array<{ questDefinitionId: string; status: string }>;
} {
  const rows: Array<{ questDefinitionId: string; status: string }> = [];
  const db = {
    questDefinition: {
      findMany: async () => [{ id: 'def-blackwood', key: 'SECRET_BLACKWOOD_GATE' }],
    },
    playerQuest: {
      findMany: async () => rows.map((row) => ({ ...row })),
      create: async ({ data }: { data: { questDefinitionId: string; status: string } }) => {
        const row = { questDefinitionId: data.questDefinitionId, status: data.status };
        rows.push(row);
        return row;
      },
    },
    roundPlayer: {
      findUnique: async () => ({ heat: 0, whores: 0, netWorthCents: 0n }),
    },
    turf: { count: async () => 0 },
    playerActivity: { findMany: async () => activities },
  } as unknown as Db;
  return { db, rows };
}

describe('hidden streets slice B discovery', () => {
  it('matches a scout that offered the van and ignores other scouts', () => {
    expect(activityMatchesSecretTrigger(VAN_TRIGGER, [
      { type: 'SCOUT', payload: vanScoutPayload() },
    ])).toBe(true);
    expect(activityMatchesSecretTrigger(VAN_TRIGGER, [
      { type: 'SCOUT', payload: { turns: 10 } },
    ])).toBe(false);
    expect(activityMatchesSecretTrigger(VAN_TRIGGER, [
      { type: 'SCOUT', payload: { turns: 10, encounter: { key: 'scout-street-tip' } } },
    ])).toBe(false);
  });

  it('reveals Blackwood Gate once after meeting the van', async () => {
    const { db, rows } = mockDb([{ type: 'SCOUT', payload: vanScoutPayload() }]);
    expect(await syncSecretQuestAttempts(db, 'player-1', classicOgV18P)).toEqual(['SECRET_BLACKWOOD_GATE']);
    expect(rows).toEqual([{ questDefinitionId: 'def-blackwood', status: 'AVAILABLE' }]);
    expect(await syncSecretQuestAttempts(db, 'player-1', classicOgV18P)).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('keeps the gate shut without the van clue', async () => {
    const { db, rows } = mockDb([{ type: 'SCOUT', payload: { turns: 10 } }]);
    expect(await syncSecretQuestAttempts(db, 'player-1', classicOgV18P)).toEqual([]);
    expect(rows).toHaveLength(0);
  });
});
