import { describe, expect, it } from 'vitest';
import { classicOgV07O } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  WEEKLY_CONTRACT_SLOTS,
  selectedWeeklyContractKeys,
  syncWeeklyContractAttempts,
  turfHoldHoursForSegments,
  weeklyContractWindow,
} from '../weekly-contract.service.js';

describe('WeeklyContractService rotation', () => {
  it('rolls Monday at the same UTC reset hour as the daily board', () => {
    const ruleset = {
      ...classicOgV07O,
      rankings: { ...classicOgV07O.rankings, dailyResetHourUtc: 12 },
    };
    expect(weeklyContractWindow(new Date('2026-09-28T11:59:59.000Z'), ruleset)).toEqual({
      startsAt: new Date('2026-09-21T12:00:00.000Z'),
      endsAt: new Date('2026-09-28T12:00:00.000Z'),
    });
    expect(weeklyContractWindow(new Date('2026-09-28T12:00:00.000Z'), ruleset)).toEqual({
      startsAt: new Date('2026-09-28T12:00:00.000Z'),
      endsAt: new Date('2026-10-05T12:00:00.000Z'),
    });
  });

  it('selects two deterministic offers from different categories', () => {
    const now = new Date('2026-09-22T15:00:00.000Z');
    const first = selectedWeeklyContractKeys(classicOgV07O, now);
    const second = selectedWeeklyContractKeys(classicOgV07O, now);
    expect(first).toHaveLength(WEEKLY_CONTRACT_SLOTS);
    expect(second).toEqual(first);

    const categories = first.map((key) =>
      Object.values(classicOgV07O.questDefinitions ?? {}).find((definition) => definition.key === key)?.category
    );
    expect(new Set(categories).size).toBe(WEEKLY_CONTRACT_SLOTS);
  });

  it('fills weekly slots from enabled definitions when a selected contract is disabled', () => {
    const now = new Date('2026-09-22T15:00:00.000Z');
    const original = selectedWeeklyContractKeys(classicOgV07O, now);
    const enabled: ReadonlySet<string> = new Set(
      Object.values(classicOgV07O.questDefinitions ?? {})
        .filter((definition) => definition.type === 'WEEKLY' && definition.key !== original[0])
        .map((definition) => definition.key),
    );
    const selected = selectedWeeklyContractKeys(classicOgV07O, now, enabled);
    expect(selected).toHaveLength(WEEKLY_CONTRACT_SLOTS);
    expect(selected).not.toContain(original[0]);
    expect(selected.every((key) => enabled.has(key))).toBe(true);
  });

  it('rotates after the next weekly boundary', () => {
    const before = selectedWeeklyContractKeys(classicOgV07O, new Date('2026-09-22T15:00:00.000Z'));
    const after = selectedWeeklyContractKeys(classicOgV07O, new Date('2026-09-29T15:00:00.000Z'));
    expect(after).toHaveLength(WEEKLY_CONTRACT_SLOTS);
    expect(after).not.toEqual(before);
  });

  it('increments attempts when a weekly contract returns in a later rotation', async () => {
    const definitions = Object.values(classicOgV07O.questDefinitions ?? {})
      .filter((definition) => definition.type === 'WEEKLY')
      .map((definition, index) => ({ id: 'weekly-definition-' + index, key: definition.key }));

    type Row = {
      id: string;
      questDefinitionId: string;
      attempt: number;
      status: string;
      expiresAt: Date | null;
      isTracked: boolean;
      acceptedAt: Date | null;
      objectiveProgress: Record<string, unknown>;
    };
    const rows: Row[] = [];
    let id = 0;

    const db = {
      questDefinition: {
        findMany: async () => definitions,
      },
      playerQuest: {
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of rows) {
            if (
              where.questDefinitionId.in.includes(row.questDefinitionId)
              && where.status.in.includes(row.status)
              && row.expiresAt
              && row.expiresAt.getTime() <= where.expiresAt.lte.getTime()
            ) {
              row.status = data.status;
              row.isTracked = data.isTracked;
              count += 1;
            }
          }
          return { count };
        },
        findMany: async ({ where }: any) => rows
          .filter((row) =>
            where.questDefinitionId.in.includes(row.questDefinitionId)
            && (!where.status || where.status.in.includes(row.status))
          )
          .map((row) => ({ ...row })),
        create: async ({ data }: any) => {
          const row: Row = {
            id: 'weekly-attempt-' + (++id),
            questDefinitionId: data.questDefinitionId,
            attempt: data.attempt,
            status: data.status,
            expiresAt: data.expiresAt,
            isTracked: false,
            acceptedAt: null,
            objectiveProgress: {},
          };
          rows.push(row);
          return { ...row };
        },
      },
      turfHoldSegment: {
        findMany: async () => [],
      },
    } as unknown as Db;

    const firstNow = new Date('2026-09-22T15:00:00.000Z');
    const firstKeys = selectedWeeklyContractKeys(classicOgV07O, firstNow);
    await syncWeeklyContractAttempts(db, 'player-1', classicOgV07O, firstNow);
    expect(rows).toHaveLength(WEEKLY_CONTRACT_SLOTS);

    const returningKey = firstKeys[0]!;
    const returningDefinition = definitions.find((definition) => definition.key === returningKey)!;
    const firstAttempt = rows.find((row) => row.questDefinitionId === returningDefinition.id)!;
    firstAttempt.status = 'COMPLETED';

    let laterNow: Date | null = null;
    for (let week = 1; week <= 20; week += 1) {
      const candidate = new Date(firstNow.getTime() + week * 7 * 24 * 60 * 60 * 1000);
      if (selectedWeeklyContractKeys(classicOgV07O, candidate).includes(returningKey)) {
        laterNow = candidate;
        break;
      }
    }
    expect(laterNow).not.toBeNull();

    await syncWeeklyContractAttempts(db, 'player-1', classicOgV07O, laterNow!);

    const attempts = rows
      .filter((row) => row.questDefinitionId === returningDefinition.id)
      .sort((left, right) => left.attempt - right.attempt);
    expect(attempts.map((row) => row.attempt)).toEqual([1, 2]);
    expect(attempts[0]!.status).toBe('COMPLETED');
    expect(attempts[1]!.status).toBe('AVAILABLE');
  });

  it('counts overlapping turf holds as combined whole hours', () => {
    const start = new Date('2026-09-21T12:00:00.000Z');
    const end = new Date('2026-09-24T12:00:00.000Z');
    expect(turfHoldHoursForSegments([
      { startedAt: new Date('2026-09-21T00:00:00.000Z'), endedAt: new Date('2026-09-22T12:00:00.000Z') },
      { startedAt: new Date('2026-09-22T00:00:00.000Z'), endedAt: new Date('2026-09-23T12:30:00.000Z') },
      { startedAt: new Date('2026-09-24T00:00:00.000Z'), endedAt: null },
    ], start, end)).toBe(72);
  });
});
