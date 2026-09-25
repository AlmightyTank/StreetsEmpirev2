import type { PrismaClient } from '@prisma/client';
import type { FavorDefinition, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export interface FavorInventoryEntry {
  key: string;
  quantity: number;
  totalGranted: number;
  lastSourceQuestKey: string | null;
  definition: FavorDefinition;
}

export const FavorInventoryService = {
  definition(ruleset: Ruleset, key: string): FavorDefinition {
    const definition = ruleset.favors?.[key];
    if (!definition) throw AppError.conflict('QUEST_REWARD_INVALID', `Unknown favor: ${key}.`);
    return definition;
  },

  async list(
    db: Db | PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
  ): Promise<FavorInventoryEntry[]> {
    const rows = await db.playerFavor.findMany({
      where: { roundPlayerId, quantity: { gt: 0 } },
      orderBy: [{ updatedAt: 'desc' }, { key: 'asc' }],
    });

    return rows.flatMap((row) => {
      const definition = ruleset.favors?.[row.key];
      if (!definition) return [];
      return [{
        key: row.key,
        quantity: row.quantity,
        totalGranted: row.totalGranted,
        lastSourceQuestKey: row.lastSourceQuestKey,
        definition,
      }];
    });
  },

  async grant(
    db: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    key: string,
    quantity: number,
    sourceQuestKey: string,
  ): Promise<FavorDefinition> {
    const definition = this.definition(ruleset, key);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw AppError.conflict('QUEST_REWARD_INVALID', 'Favor rewards require a positive whole quantity.');
    }

    await db.playerFavor.upsert({
      where: { roundPlayerId_key: { roundPlayerId, key } },
      create: {
        roundPlayerId,
        key,
        quantity,
        totalGranted: quantity,
        lastSourceQuestKey: sourceQuestKey,
      },
      update: {
        quantity: { increment: quantity },
        totalGranted: { increment: quantity },
        lastSourceQuestKey: sourceQuestKey,
      },
    });

    return definition;
  },
};
