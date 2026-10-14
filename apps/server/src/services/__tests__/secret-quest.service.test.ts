import { describe, expect, it, vi } from 'vitest';
import { classicOgV07P, classicOgV18R } from '@streets/rulesets';
import type { Ruleset } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { activityMatchesSecretTrigger, syncSecretQuestAttempts } from '../secret-quest.service.js';

describe('secret quest activity triggers', () => {
  it('reveals after repeated filtered activity', () => {
    const trigger = {
      kind: 'ACTIVITY_COUNT',
      eventTypes: ['RAID_ATTACK'],
      where: { won: false },
      target: 3,
    } as const;

    expect(activityMatchesSecretTrigger(trigger, [
      { type: 'RAID_ATTACK', payload: { won: false } },
      { type: 'RAID_ATTACK', payload: { won: true } },
      { type: 'RAID_ATTACK', payload: { won: false } },
    ])).toBe(false);

    expect(activityMatchesSecretTrigger(trigger, [
      { type: 'RAID_ATTACK', payload: { won: false } },
      { type: 'RAID_ATTACK', payload: { won: false } },
      { type: 'RAID_ATTACK', payload: { won: false } },
    ])).toBe(true);
  });

  it('detects one returned run carrying at least the configured total cargo', () => {
    const trigger = {
      kind: 'ACTIVITY_OBJECT_SUM_AT_LEAST',
      eventTypes: ['RUN_RETURNED'],
      field: 'cargoBack',
      target: 500,
    } as const;

    expect(activityMatchesSecretTrigger(trigger, [{
      type: 'RUN_RETURNED',
      payload: { cargoBack: { CRACK: 200, WEED: 299 } },
    }])).toBe(false);

    expect(activityMatchesSecretTrigger(trigger, [{
      type: 'RUN_RETURNED',
      payload: { cargoBack: { CRACK: 200, WEED: 300, METH: 25 } },
    }])).toBe(true);
  });

  it('keeps secrets unmaterialized until their server trigger is satisfied', async () => {
    const definitions = Object.values(classicOgV07P.questDefinitions ?? {})
      .filter((definition) => definition.type === 'SECRET')
      .map((definition, index) => ({ id: 'secret-' + index, key: definition.key }));
    const rows: Array<{ questDefinitionId: string; status: string }> = [];
    let heat = 79;

    const db = {
      questDefinition: { findMany: async () => definitions },
      playerQuest: {
        findMany: async () => rows.map((row) => ({ ...row })),
        create: async ({ data }: { data: { questDefinitionId: string; status: string } }) => {
          const row = { questDefinitionId: data.questDefinitionId, status: data.status };
          rows.push(row);
          return row;
        },
      },
      roundPlayer: {
        findUnique: async () => ({
          heat,
          whores: 10,
          netWorthCents: 0n,
        }),
      },
      turf: { count: async () => 0 },
      playerActivity: { findMany: async () => [] },
    } as unknown as Db;

    expect(await syncSecretQuestAttempts(db, 'player-1', classicOgV07P)).toEqual([]);
    expect(rows).toHaveLength(0);

    heat = 80;
    expect(await syncSecretQuestAttempts(db, 'player-1', classicOgV07P)).toEqual(['SECRET_RED_LINE']);
    expect(rows).toEqual([{
      questDefinitionId: definitions.find((definition) => definition.key === 'SECRET_RED_LINE')!.id,
      status: 'AVAILABLE',
    }]);

    expect(await syncSecretQuestAttempts(db, 'player-1', classicOgV07P)).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('matches an arrest without treating other road incidents as arrests', () => {
    const trigger = {
      kind: 'ACTIVITY_COUNT',
      eventTypes: ['RUN_INCIDENT'],
      where: { kind: 'ARREST' },
      target: 1,
    } as const;
    expect(activityMatchesSecretTrigger(trigger, [{ type: 'RUN_INCIDENT', payload: { kind: 'BUST' } }])).toBe(false);
    expect(activityMatchesSecretTrigger(trigger, [{ type: 'RUN_INCIDENT', payload: { kind: 'ARREST' } }])).toBe(true);
  });

  it('reveals a Slice E comedy secret from aliased randomEncounter activity once', async () => {
    const definitions = Object.values(classicOgV18R.questDefinitions ?? {})
      .filter((definition) => definition.type === 'SECRET' && definition.availability.secretContent?.family === 'COMEDY')
      .map((definition, index) => ({ id: 'comedy-secret-' + index, key: definition.key }));
    const rows: Array<{ questDefinitionId: string; status: string }> = [];

    const db = {
      questDefinition: { findMany: async () => definitions },
      playerQuest: {
        findMany: async () => rows.map((row) => ({ ...row })),
        create: async ({ data }: { data: { questDefinitionId: string; status: string } }) => {
          const row = { questDefinitionId: data.questDefinitionId, status: data.status };
          rows.push(row);
          return row;
        },
      },
      roundPlayer: { findUnique: async () => ({ heat: 0, whores: 10, netWorthCents: 0n }) },
      turf: { count: async () => 0 },
      playerActivity: {
        findMany: async ({ where }: { where: { type: { in: string[] } } }) => {
          if (!where.type.in.includes('STORE_BUY')) return [];
          return [{ type: 'STORE_BUY', payload: { randomEncounter: { key: 'store-regional-management' } } }];
        },
      },
    } as unknown as Db;

    expect(await syncSecretQuestAttempts(db, 'player-1', classicOgV18R)).toEqual(['SECRET_REGIONAL_MANAGEMENT']);
    expect(rows).toEqual([{
      questDefinitionId: definitions.find((definition) => definition.key === 'SECRET_REGIONAL_MANAGEMENT')!.id,
      status: 'AVAILABLE',
    }]);
    expect(await syncSecretQuestAttempts(db, 'player-1', classicOgV18R)).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('ignores unknown activity event types instead of throwing', async () => {
    const ruleset = {
      meta: { id: 'test-ruleset', version: '1' },
      questDefinitions: {
        SECRET_BOGUS: {
          key: 'SECRET_BOGUS',
          type: 'SECRET',
          availability: {
            secretTrigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['NO_SUCH_ACTIVITY_TYPE'], target: 1 },
          },
        },
      },
    } as unknown as Ruleset;
    const findMany = vi.fn(async () => []);
    const db = {
      questDefinition: { findMany: async () => [{ id: 'def-1', key: 'SECRET_BOGUS' }] },
      playerQuest: {
        findMany: async () => [],
        create: async () => { throw new Error('should not reveal'); },
      },
      roundPlayer: { findUnique: async () => ({ heat: 0, whores: 0, netWorthCents: 0n }) },
      turf: { count: async () => 0 },
      playerActivity: { findMany },
    } as unknown as Db;

    await expect(syncSecretQuestAttempts(db, 'player-1', ruleset)).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
