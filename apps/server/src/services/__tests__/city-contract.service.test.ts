import { describe, expect, it } from 'vitest';
import { advanceQuestObjective, classicOgV07R } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  CITY_CONTRACT_PAYOUT_MULTIPLIER,
  CITY_CONTRACT_SLOTS,
  cityContractObjectives,
  cityContractOffers,
  cityContractRewards,
  cityContractState,
  cityContractWindow,
  isDynamicCityContractDefinition,
  syncCityContractAttempts,
} from '../city-contract.service.js';

describe('CityContractService', () => {
  it('uses fixed 12-hour UTC windows', () => {
    expect(cityContractWindow(new Date('2026-09-22T11:59:59.000Z'))).toEqual({
      startsAt: new Date('2026-09-22T00:00:00.000Z'),
      endsAt: new Date('2026-09-22T12:00:00.000Z'),
    });
    expect(cityContractWindow(new Date('2026-09-22T12:00:00.000Z'))).toEqual({
      startsAt: new Date('2026-09-22T12:00:00.000Z'),
      endsAt: new Date('2026-09-23T00:00:00.000Z'),
    });
  });

  it('generates two deterministic live-market offers with bounded targets and 35% bonuses', () => {
    const window = cityContractWindow(new Date('2026-09-22T15:00:00.000Z'));
    const first = cityContractOffers(classicOgV07R, 'round-seed', window);
    const second = cityContractOffers(classicOgV07R, 'round-seed', window);

    expect(first).toHaveLength(CITY_CONTRACT_SLOTS);
    expect(second).toEqual(first);
    expect(new Set(first.map((offer) => offer.city + ':' + offer.product)).size).toBe(CITY_CONTRACT_SLOTS);

    for (const offer of first) {
      expect([250, 500, 750]).toContain(offer.target);
      expect(offer.payoutMultiplier).toBe(CITY_CONTRACT_PAYOUT_MULTIPLIER);
      expect(offer.expectedSaleCents).toBeLessThan(offer.expectedUnitCents * offer.target);
      expect(offer.bonusCents).toBe(Math.round(offer.expectedSaleCents * 0.35));
      expect(offer.windowStart).toBe(window.startsAt.toISOString());
      expect(offer.windowEnd).toBe(window.endsAt.toISOString());
    }
  });

  it('resolves the generated objective to the exact city/product sale', () => {
    const offer = cityContractOffers(
      classicOgV07R,
      'round-seed',
      cityContractWindow(new Date('2026-09-22T15:00:00.000Z')),
    )[0]!;
    const stored = { cityContract: offer };
    const objective = cityContractObjectives(stored)![0]!;

    expect(advanceQuestObjective(objective, {
      type: 'RUN_TRADE',
      payload: {
        city: offer.city,
        product: offer.product,
        direction: 'sell',
        venue: 'market',
        quantity: 100,
      },
    }).amount).toBe(100);

    expect(advanceQuestObjective(objective, {
      type: 'RUN_TRADE',
      payload: {
        city: offer.city,
        product: offer.product,
        direction: 'buy',
        venue: 'market',
        quantity: 100,
      },
    }).amount).toBe(0);

    expect(advanceQuestObjective(objective, {
      type: 'RUN_TRADE',
      payload: {
        city: offer.city === 'detroit' ? 'atlanta' : 'detroit',
        product: offer.product,
        direction: 'sell',
        venue: 'market',
        quantity: 100,
      },
    }).amount).toBe(0);

    expect(cityContractRewards(stored)).toEqual([{ kind: 'CASH', amount: offer.bonusCents }]);
  });

  it('materializes two slots and rolls each template to a new attempt after reset', async () => {
    const templates = Object.values(classicOgV07R.questDefinitions ?? {})
      .filter(isDynamicCityContractDefinition)
      .sort((left, right) => {
        const leftSlot = 'slot' in left.availability ? Number(left.availability.slot ?? 0) : 0;
        const rightSlot = 'slot' in right.availability ? Number(right.availability.slot ?? 0) : 0;
        return leftSlot - rightSlot;
      });
    const definitions = templates.map((definition, index) => ({
      id: 'city-definition-' + index,
      key: definition.key,
    }));

    type Row = {
      id: string;
      questDefinitionId: string;
      attempt: number;
      status: string;
      expiresAt: Date | null;
      isTracked: boolean;
      rewardState: unknown;
      questDefinition?: { id: string; key: string };
    };
    const rows: Row[] = [];
    let id = 0;

    const db = {
      roundPlayer: {
        findUnique: async () => ({ roundId: 'round-seed' }),
      },
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
        findMany: async () => rows.map((row) => ({
          ...row,
          questDefinition: definitions.find((definition) => definition.id === row.questDefinitionId),
        })),
        create: async ({ data }: any) => {
          const row: Row = {
            id: 'city-attempt-' + (++id),
            questDefinitionId: data.questDefinitionId,
            attempt: data.attempt,
            status: data.status,
            expiresAt: data.expiresAt,
            isTracked: false,
            rewardState: data.rewardState,
          };
          rows.push(row);
          return { ...row };
        },
      },
    } as unknown as Db;

    const firstNow = new Date('2026-09-22T15:00:00.000Z');
    await syncCityContractAttempts(db, 'player-1', classicOgV07R, firstNow);

    expect(rows).toHaveLength(CITY_CONTRACT_SLOTS);
    expect(rows.every((row) => row.attempt === 1)).toBe(true);
    expect(rows.every((row) => cityContractState(row.rewardState)?.windowStart === '2026-09-22T12:00:00.000Z')).toBe(true);

    rows[0]!.status = 'COMPLETED';
    const nextNow = new Date('2026-09-23T03:00:00.000Z');
    await syncCityContractAttempts(db, 'player-1', classicOgV07R, nextNow);

    expect(rows).toHaveLength(CITY_CONTRACT_SLOTS * 2);
    for (const definition of definitions) {
      const attempts = rows
        .filter((row) => row.questDefinitionId === definition.id)
        .sort((left, right) => left.attempt - right.attempt);
      expect(attempts.map((row) => row.attempt)).toEqual([1, 2]);
      expect(cityContractState(attempts[1]!.rewardState)?.windowStart).toBe('2026-09-23T00:00:00.000Z');
      expect(attempts[1]!.status).toBe('AVAILABLE');
    }
  });
});
