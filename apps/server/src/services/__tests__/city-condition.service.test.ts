import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classicOgV18J } from '@streets/rulesets';
import { CityConditionService } from '../city-condition.service.js';

const startsAt = new Date('2026-10-01T00:00:00.000Z');
const endsAt = new Date('2026-10-01T01:00:00.000Z');

function makeDb(options: { pausedAt?: Date | null; pausedMinutesTotal?: number } = {}) {
  const occurrences: any[] = [];
  const definitions = new Map<string, string>();
  const round = {
    id: 'round-1', startsAt, endsAt,
    pausedAt: options.pausedAt ?? null,
    pausedMinutesTotal: options.pausedMinutesTotal ?? 0,
  };
  const definitionFor = (config: any) => classicOgV18J.cityConditions?.find((item) => item.key === config.conditionKey);
  return {
    occurrences,
    gameEventDefinition: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const key = where.rulesetId_rulesetVersion_key.key;
        const id = definitions.get(key) ?? `definition-${definitions.size + 1}`;
        definitions.set(key, id);
        return { id };
      }),
    },
    gameEventOccurrence: {
      upsert: vi.fn(async ({ where, create }: any) => {
        let row = occurrences.find((candidate) => candidate.definitionId === where.definitionId_occurrenceKey.definitionId && candidate.occurrenceKey === where.definitionId_occurrenceKey.occurrenceKey);
        if (!row) {
          row = { id: `occurrence-${occurrences.length + 1}`, ...create };
          occurrences.push(row);
        }
        return { id: row.id, status: row.status, createdAt: row.createdAt };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return occurrences
          .filter((row) => !where?.roundId || row.roundId === where.roundId)
          .filter((row) => !where?.scopeKey || row.scopeKey === where.scopeKey)
          .filter((row) => !where?.status?.in || where.status.in.includes(row.status))
          .filter((row) => !where?.status || typeof where.status !== 'string' || where.status === row.status)
          .map((row) => ({
            ...row,
            definition: {
              key: `CITY:${row.config.conditionKey}`,
              title: definitionFor(row.config)?.title ?? row.config.conditionKey,
              description: definitionFor(row.config)?.description ?? '',
            },
          }));
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = occurrences.find((candidate) => candidate.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = occurrences.find((candidate) => candidate.id === where.id && candidate.status === where.status);
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      }),
    },
    gameEventHistory: { createMany: vi.fn(async () => ({ count: 1 })) },
    roundPlayer: {
      findUnique: vi.fn(async () => ({ cityId: 'city-1', round })),
    },
  } as any;
}

describe('1.8.5-F city conditions', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('schedules first-class city conditions with visible windows and lifecycle history', async () => {
    const db = makeDb();
    const now = new Date(startsAt.getTime() + 13 * 60_000);
    const conditions = await CityConditionService.page(db, 'player-1', classicOgV18J, now);

    expect(conditions.find((row) => row.key === 'neighborhood-festival')).toMatchObject({
      status: 'ACTIVE',
      title: 'Neighborhood festival',
      districts: ['CASINO', 'NIGHTCLUB', 'LOW_RENT'],
      actions: ['SCOUT'],
      startsAt: expect.any(String),
      endsAt: expect.any(String),
    });
    expect(conditions.filter((row) => row.status === 'UPCOMING')).toHaveLength(2);
    expect(db.gameEventDefinition.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ type: 'CITY_CONDITION', scope: 'CITY', sourceKind: 'CITY_CONDITION' }),
    }));
    expect(db.gameEventHistory.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ action: 'ACTIVATED', dedupeKey: expect.stringContaining('activated') })],
      skipDuplicates: true,
    }));
  });

  it('freezes scheduled conditions during round pauses', async () => {
    const pausedAt = new Date(startsAt.getTime() + 8 * 60_000);
    const db = makeDb({ pausedAt });
    const now = new Date(startsAt.getTime() + 45 * 60_000);
    const conditions = await CityConditionService.page(db, 'player-1', classicOgV18J, now);

    expect(conditions.find((row) => row.key === 'neighborhood-festival')?.status).toBe('UPCOMING');
  });

  it('caps overlapping condition bonuses and only applies matching district/action effects', async () => {
    const db = makeDb();
    db.gameEventOccurrence.findMany = vi.fn(async ({ where }: any) => {
      if (where?.status === 'ACTIVE') return [10, 10].map((recruitPercent, index) => ({
        config: { districts: ['CASINO'], actions: ['SCOUT'], effects: { recruitPercent } },
        id: `active-${index}`,
      }));
      return [];
    });
    const now = new Date(startsAt.getTime() + 22 * 60_000);
    const matching = await CityConditionService.bonuses(db, {
      round: { id: 'round-1', startsAt, endsAt, pausedAt: null, pausedMinutesTotal: 0 },
      cityId: 'city-1', ruleset: classicOgV18J, action: 'SCOUT', district: 'CASINO', now,
    });
    const otherDistrict = await CityConditionService.bonuses(db, {
      round: { id: 'round-1', startsAt, endsAt, pausedAt: null, pausedMinutesTotal: 0 },
      cityId: 'city-1', ruleset: classicOgV18J, action: 'SCOUT', district: 'LOW_RENT', now,
    });

    expect(matching.recruitPercent).toBe(15);
    expect(otherDistrict.recruitPercent).toBe(0);
  });

  it('activates a citywide follow-up once, scoped to the parent event and round city', async () => {
    const db = makeDb();
    const input = {
      round: { id: 'round-1', startsAt, endsAt: new Date(startsAt.getTime() + 24 * 60 * 60_000), pausedAt: null, pausedMinutesTotal: 0 },
      cityId: 'city-1', ruleset: classicOgV18J, parentType: 'COMMUNITY' as const,
      parentKey: 'EVENT_MONEY_IN_MOTION', now: new Date(startsAt.getTime() + 30 * 60_000),
    };
    await CityConditionService.activateFollowUpsForEvent(db, input);
    await CityConditionService.activateFollowUpsForEvent(db, input);

    const followUps = db.occurrences.filter((row: any) => row.occurrenceKey.includes('EVENT_MONEY_IN_MOTION'));
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({ roundId: 'round-1', scopeKey: 'city-1', status: 'ACTIVE' });
    expect(followUps[0].endsAt.getTime() - followUps[0].startsAt.getTime()).toBe(360 * 60_000);
  });
});
