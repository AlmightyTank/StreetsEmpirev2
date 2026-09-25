import { describe, expect, it } from 'vitest';
import { classicOgV07I } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { FavorInventoryService } from '../favor-inventory.service.js';

describe('FavorInventoryService', () => {
  it('stacks repeated grants while preserving total granted and latest source', async () => {
    const rows = new Map<string, {
      key: string;
      quantity: number;
      totalGranted: number;
      lastSourceQuestKey: string | null;
      updatedAt: Date;
    }>();

    const db = {
      playerFavor: {
        upsert: async ({ where, create, update }: any) => {
          const id = `${where.roundPlayerId_key.roundPlayerId}:${where.roundPlayerId_key.key}`;
          const existing = rows.get(id);
          if (!existing) {
            const row = {
              key: create.key,
              quantity: create.quantity,
              totalGranted: create.totalGranted,
              lastSourceQuestKey: create.lastSourceQuestKey,
              updatedAt: new Date('2026-09-22T10:00:00Z'),
            };
            rows.set(id, row);
            return row;
          }
          existing.quantity += update.quantity.increment;
          existing.totalGranted += update.totalGranted.increment;
          existing.lastSourceQuestKey = update.lastSourceQuestKey;
          existing.updatedAt = new Date('2026-09-22T10:01:00Z');
          return existing;
        },
        findMany: async ({ where }: any) =>
          [...rows.entries()]
            .filter(([id, row]) => id.startsWith(`${where.roundPlayerId}:`) && row.quantity > 0)
            .map(([, row]) => row),
      },
    } as unknown as Db;

    await FavorInventoryService.grant(db, 'player-1', classicOgV07I, 'MAMA_ADVICE', 1, 'MAMA_RECRUITMENT_DRIVE');
    await FavorInventoryService.grant(db, 'player-1', classicOgV07I, 'MAMA_ADVICE', 2, 'MAMA_NIGHT_SHIFT');

    const inventory = await FavorInventoryService.list(db, 'player-1', classicOgV07I);
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      key: 'MAMA_ADVICE',
      quantity: 3,
      totalGranted: 3,
      lastSourceQuestKey: 'MAMA_NIGHT_SHIFT',
    });
    expect(inventory[0]!.definition.name).toBe("Mama's Advice");
  });

  it('rejects unknown favor keys before writing inventory', async () => {
    const db = {
      playerFavor: {
        upsert: async () => {
          throw new Error('should not write');
        },
      },
    } as unknown as Db;

    await expect(FavorInventoryService.grant(
      db,
      'player-1',
      classicOgV07I,
      'NOT_A_FAVOR',
      1,
      'TEST_JOB',
    )).rejects.toMatchObject({ code: 'QUEST_REWARD_INVALID' });
  });

  it('rejects zero, negative and fractional favor quantities', async () => {
    const db = {} as Db;
    for (const quantity of [0, -1, 1.5]) {
      await expect(FavorInventoryService.grant(
        db,
        'player-1',
        classicOgV07I,
        'MAMA_ADVICE',
        quantity,
        'TEST_JOB',
      )).rejects.toMatchObject({ code: 'QUEST_REWARD_INVALID' });
    }
  });

  it('hides orphaned rows that are not defined by the pinned ruleset', async () => {
    const db = {
      playerFavor: {
        findMany: async () => [
          {
            key: 'MAMA_ADVICE',
            quantity: 1,
            totalGranted: 1,
            lastSourceQuestKey: 'MAMA_RECRUITMENT_DRIVE',
            updatedAt: new Date(),
          },
          {
            key: 'OLD_REMOVED_FAVOR',
            quantity: 3,
            totalGranted: 3,
            lastSourceQuestKey: null,
            updatedAt: new Date(),
          },
        ],
      },
    } as unknown as Db;

    const inventory = await FavorInventoryService.list(db, 'player-1', classicOgV07I);
    expect(inventory.map((entry) => entry.key)).toEqual(['MAMA_ADVICE']);
  });
});
