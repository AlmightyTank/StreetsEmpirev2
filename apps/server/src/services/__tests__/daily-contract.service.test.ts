import { describe, expect, it } from 'vitest';
import { classicOgV07N } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  DAILY_CONTRACT_SLOTS,
  dailyContractWindow,
  selectedDailyContractKeys,
  syncDailyContractAttempts,
} from '../daily-contract.service.js';

describe('DailyContractService rotation', () => {
  it('uses the same UTC reset boundary as rankings', () => {
    const ruleset = {
      ...classicOgV07N,
      rankings: { ...classicOgV07N.rankings, dailyResetHourUtc: 12 },
    };
    expect(dailyContractWindow(new Date('2026-09-22T11:59:59.000Z'), ruleset)).toEqual({
      startsAt: new Date('2026-09-21T12:00:00.000Z'),
      endsAt: new Date('2026-09-22T12:00:00.000Z'),
    });
    expect(dailyContractWindow(new Date('2026-09-22T12:00:00.000Z'), ruleset)).toEqual({
      startsAt: new Date('2026-09-22T12:00:00.000Z'),
      endsAt: new Date('2026-09-23T12:00:00.000Z'),
    });
  });

  it('selects exactly three deterministic offers per window', () => {
    const now = new Date('2026-09-22T15:00:00.000Z');
    const first = selectedDailyContractKeys(classicOgV07N, now);
    const second = selectedDailyContractKeys(classicOgV07N, now);
    expect(first).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(new Set(first).size).toBe(DAILY_CONTRACT_SLOTS);
    expect(second).toEqual(first);
  });

  it('fills all slots from enabled definitions when a selected contract is disabled', () => {
    const now = new Date('2026-09-22T15:00:00.000Z');
    const original = selectedDailyContractKeys(classicOgV07N, now);
    const enabled: ReadonlySet<string> = new Set(
      Object.values(classicOgV07N.questDefinitions ?? {})
        .filter((definition) => definition.type === 'DAILY' && definition.key !== original[0])
        .map((definition) => definition.key),
    );
    const selected = selectedDailyContractKeys(classicOgV07N, now, enabled);
    expect(selected).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(selected).not.toContain(original[0]);
    expect(selected.every((key) => enabled.has(key))).toBe(true);
  });

  it('rotates the board after the next reset', () => {
    const before = selectedDailyContractKeys(classicOgV07N, new Date('2026-09-22T15:00:00.000Z'));
    const after = selectedDailyContractKeys(classicOgV07N, new Date('2026-09-23T15:00:00.000Z'));
    expect(after).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(after).not.toEqual(before);
  });
  it('materializes only the selected board and increments attempts when a contract returns', async () => {
    const definitions = Object.values(classicOgV07N.questDefinitions ?? {})
      .filter((definition) => definition.type === 'DAILY')
      .map((definition, index) => ({ id: 'definition-' + index, key: definition.key }));

    type Row = {
      id: string;
      questDefinitionId: string;
      attempt: number;
      status: string;
      expiresAt: Date | null;
      isTracked: boolean;
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
              row.status !== 'COMPLETED'
              && where.questDefinitionId.in.includes(row.questDefinitionId)
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
        findMany: async () => rows.map((row) => ({ ...row })),
        create: async ({ data }: any) => {
          const row: Row = {
            id: 'attempt-' + (++id),
            questDefinitionId: data.questDefinitionId,
            attempt: data.attempt,
            status: data.status,
            expiresAt: data.expiresAt,
            isTracked: false,
          };
          rows.push(row);
          return { ...row };
        },
      },
    } as unknown as Db;

    const firstNow = new Date('2026-09-22T15:00:00.000Z');
    const firstKeys = selectedDailyContractKeys(classicOgV07N, firstNow);
    await syncDailyContractAttempts(db, 'player-1', classicOgV07N, firstNow);

    expect(rows).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(rows.map((row) => definitions.find((definition) => definition.id === row.questDefinitionId)?.key).sort())
      .toEqual([...firstKeys].sort());
    expect(rows.every((row) => row.attempt === 1)).toBe(true);

    const returningKey = firstKeys[0]!;
    rows.find((row) => definitions.find((definition) => definition.id === row.questDefinitionId)?.key === returningKey)!.status = 'COMPLETED';

    let laterNow: Date | null = null;
    for (let day = 1; day <= 30; day += 1) {
      const candidate = new Date(firstNow.getTime() + day * 24 * 60 * 60 * 1000);
      if (selectedDailyContractKeys(classicOgV07N, candidate).includes(returningKey)) {
        laterNow = candidate;
        break;
      }
    }
    expect(laterNow).not.toBeNull();

    await syncDailyContractAttempts(db, 'player-1', classicOgV07N, laterNow!);

    const returningDefinition = definitions.find((definition) => definition.key === returningKey)!;
    const attempts = rows
      .filter((row) => row.questDefinitionId === returningDefinition.id)
      .sort((left, right) => left.attempt - right.attempt);
    expect(attempts.map((row) => row.attempt)).toEqual([1, 2]);
    expect(attempts[0]!.status).toBe('COMPLETED');
    expect(attempts[1]!.status).toBe('AVAILABLE');
  });

});
