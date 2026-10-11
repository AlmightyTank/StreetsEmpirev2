import type { PrismaClient } from '@prisma/client';
import { SUPPORTER_COSMETICS, SUPPORTER_SOURCE, SUPPORTER_SOURCE_VERSION } from '@streets/rulesets';
import type { Db } from '../utils/db.js';

/**
 * Supporter rewards are permanent account cosmetic unlocks. Granting is
 * idempotent and nothing here ever revokes them: a player keeps what they
 * were given after they stop supporting. Today an admin grants them; a
 * checkout hook can call `grant` the same way later.
 */
export const SupporterService = {
  /** Writes every supporter reward the account does not have yet and returns the keys it added. */
  async grant(db: Db, accountId: string, at = new Date()): Promise<string[]> {
    const keys = Object.keys(SUPPORTER_COSMETICS);
    const existing = await db.accountCosmeticUnlock.findMany({
      where: { accountId, key: { in: keys } },
      select: { key: true },
    });
    const have = new Set(existing.map((row) => row.key));
    const added: string[] = [];
    for (const cosmetic of Object.values(SUPPORTER_COSMETICS)) {
      if (have.has(cosmetic.key)) continue;
      await db.accountCosmeticUnlock.create({
        data: {
          accountId,
          key: cosmetic.key,
          kind: cosmetic.kind,
          title: cosmetic.name,
          description: cosmetic.description,
          rarity: cosmetic.rarity,
          styleKey: cosmetic.styleKey,
          sourceQuestKey: SUPPORTER_SOURCE,
          sourceRulesetId: SUPPORTER_SOURCE,
          sourceRulesetVersion: SUPPORTER_SOURCE_VERSION,
          awardedAt: at,
        },
      });
      added.push(cosmetic.key);
    }
    return added;
  },

  /** When the account was first given supporter rewards, or null if it never was. */
  async since(db: Db | PrismaClient, accountId: string): Promise<Date | null> {
    const first = await db.accountCosmeticUnlock.findFirst({
      where: { accountId, sourceQuestKey: SUPPORTER_SOURCE },
      orderBy: { awardedAt: 'asc' },
      select: { awardedAt: true },
    });
    return first?.awardedAt ?? null;
  },
};
