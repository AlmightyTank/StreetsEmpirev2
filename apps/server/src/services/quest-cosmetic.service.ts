import type { PrismaClient } from '@prisma/client';
import type { QuestCosmeticDefinition, Ruleset } from '@streets/rulesets';
import type { PublicAwardDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

function definition(ruleset: Ruleset, key: string): QuestCosmeticDefinition {
  const cosmetic = ruleset.cosmetics?.[key];
  if (!cosmetic) {
    throw AppError.conflict('QUEST_COSMETIC_UNKNOWN', 'That quest cosmetic is not available in this ruleset.');
  }
  return cosmetic;
}

export const QuestCosmeticService = {
  async award(
    db: Db,
    accountId: string,
    ruleset: Ruleset,
    key: string,
    sourceQuestKey: string,
    awardedAt = new Date(),
  ): Promise<QuestCosmeticDefinition> {
    const cosmetic = definition(ruleset, key);
    await db.accountCosmeticUnlock.upsert({
      where: { accountId_key: { accountId, key } },
      create: {
        accountId,
        key,
        kind: cosmetic.kind,
        title: cosmetic.name,
        description: cosmetic.description,
        rarity: cosmetic.rarity,
        sourceQuestKey,
        sourceRulesetId: ruleset.meta.id,
        sourceRulesetVersion: ruleset.meta.version,
        awardedAt,
      },
      update: {},
    });
    return cosmetic;
  },

  async awardsForAccount(
    db: Db | PrismaClient,
    accountId: string,
  ): Promise<PublicAwardDto[]> {
    const rows = await db.accountCosmeticUnlock.findMany({
      where: { accountId, kind: 'TITLE_BADGE' },
      orderBy: [{ awardedAt: 'asc' }, { key: 'asc' }],
    });

    return rows.map((row) => ({
      key: row.key,
      title: row.title,
      description: row.description,
      category: 'quest',
      rarity: row.rarity as PublicAwardDto['rarity'],
      unlocked: true,
      earnedAt: row.awardedAt.toISOString(),
      progress: {
        current: 1,
        target: 1,
        label: 'quest cosmetic',
      },
    }));
  },
};
