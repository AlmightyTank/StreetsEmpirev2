import type { PrismaClient } from '@prisma/client';
import { experienceLevelFor, playerExperienceDto, type PlayerExperienceDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

type LevelCosmetic = {
  level: number;
  key: string;
  title: string;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
};

const LEVEL_COSMETICS: readonly LevelCosmetic[] = [
  { level: 5, key: 'player-level-5-title', title: 'On the Rise', description: 'Reached player level 5.', rarity: 'common' },
  { level: 10, key: 'player-level-10-title', title: 'Known Face', description: 'Reached player level 10.', rarity: 'uncommon' },
  { level: 20, key: 'player-level-20-title', title: 'Street Veteran', description: 'Reached player level 20.', rarity: 'rare' },
  { level: 30, key: 'player-level-30-title', title: 'City Fixture', description: 'Reached player level 30.', rarity: 'epic' },
  { level: 50, key: 'player-level-50-title', title: 'Living Legend', description: 'Reached player level 50.', rarity: 'legendary' },
];

export const PlayerExperienceService = {
  /** Lifetime progress. It is stored on Account and survives every round reset. */
  async view(db: Db | PrismaClient, accountId: string): Promise<PlayerExperienceDto> {
    const account = await db.account.findUnique({ where: { id: accountId }, select: { experiencePoints: true } });
    return playerExperienceDto(account?.experiencePoints ?? 0);
  },

  /**
   * Award once per completed game event. Call inside the same transaction as
   * the action or quest payout so a failed action cannot leave XP behind.
   */
  async award(
    tx: Db,
    input: { roundPlayerId: string; sourceKey: string; source: string; amount: number; awardedAt: Date },
  ): Promise<{ awardedXp: number; totalXp: number; level: number; unlocked: LevelCosmetic[] }> {
    const amount = Math.max(0, Math.floor(input.amount));
    if (amount <= 0) return { awardedXp: 0, totalXp: 0, level: 1, unlocked: [] };

    const player = await tx.roundPlayer.findUnique({
      where: { id: input.roundPlayerId },
      select: { accountId: true },
    });
    if (!player) return { awardedXp: 0, totalXp: 0, level: 1, unlocked: [] };

    const inserted = await tx.playerExperienceEvent.createMany({
      data: [{
        accountId: player.accountId,
        sourceKey: input.sourceKey,
        source: input.source,
        amount,
        awardedAt: input.awardedAt,
      }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      const current = await tx.account.findUnique({ where: { id: player.accountId }, select: { experiencePoints: true } });
      const totalXp = current?.experiencePoints ?? 0;
      return { awardedXp: 0, totalXp, level: experienceLevelFor(totalXp), unlocked: [] };
    }

    const updated = await tx.account.update({
      where: { id: player.accountId },
      data: { experiencePoints: { increment: amount } },
      select: { experiencePoints: true },
    });
    const totalXp = updated.experiencePoints;
    const previousLevel = experienceLevelFor(totalXp - amount);
    const level = experienceLevelFor(totalXp);
    const unlocked = LEVEL_COSMETICS.filter((cosmetic) => cosmetic.level > previousLevel && cosmetic.level <= level);

    for (const cosmetic of unlocked) {
      await tx.accountCosmeticUnlock.upsert({
        where: { accountId_key: { accountId: player.accountId, key: cosmetic.key } },
        create: {
          accountId: player.accountId,
          key: cosmetic.key,
          kind: 'TITLE_BADGE',
          title: cosmetic.title,
          description: cosmetic.description,
          rarity: cosmetic.rarity,
          styleKey: null,
          sourceQuestKey: 'PLAYER_EXPERIENCE_LEVEL',
          sourceRulesetId: 'account-progression',
          sourceRulesetVersion: '1',
          awardedAt: input.awardedAt,
        },
        update: {},
      });
    }

    return { awardedXp: amount, totalXp, level, unlocked };
  },
};
