import type { PrismaClient } from '@prisma/client';
import { experienceLevelFor, experienceTitlesBetween, playerExperienceDto, type ExperienceLevelReward, type PlayerExperienceDto, type PlayerExperienceEventDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { CrownEarnService } from './crown-earn.service.js';
import { DoubleXpWeekendService } from './double-xp-weekend.service.js';

export const PlayerExperienceService = {
  /** Recent account-wide XP awards, newest first. */
  async recentEvents(db: Db | PrismaClient, accountId: string, limit = 25): Promise<PlayerExperienceEventDto[]> {
    const rows = await db.playerExperienceEvent.findMany({
      where: { accountId },
      orderBy: [{ awardedAt: 'desc' }, { id: 'desc' }],
      take: Math.max(1, Math.min(100, Math.floor(limit))),
      select: { id: true, source: true, amount: true, awardedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      amount: row.amount,
      awardedAt: row.awardedAt.toISOString(),
    }));
  },

  /** Account level per account, for the level chip beside player names. Missing accounts read as level 1. */
  async levels(db: Db | PrismaClient, accountIds: string[]): Promise<Map<string, number>> {
    const ids = [...new Set(accountIds)];
    const out = new Map(ids.map((id) => [id, 1]));
    if (!ids.length) return out;
    const rows = await db.account.findMany({ where: { id: { in: ids } }, select: { id: true, experiencePoints: true } });
    for (const row of rows) out.set(row.id, experienceLevelFor(row.experiencePoints));
    return out;
  },

  /** Lifetime progress. It is stored on Account and survives every round reset. */
  async view(db: Db | PrismaClient, accountId: string): Promise<PlayerExperienceDto> {
    const [account, finished] = await Promise.all([
      db.account.findUnique({ where: { id: accountId }, select: { experiencePoints: true } }),
      db.roundPlayer.findFirst({ where: { accountId, round: { status: { in: ['ENDED', 'ARCHIVED'] } } }, select: { id: true } }),
    ]);
    return { ...playerExperienceDto(account?.experiencePoints ?? 0), veteran: Boolean(finished) };
  },

  /**
   * Award once per completed game event. Call inside the same transaction as
   * the action or quest payout so a failed action cannot leave XP behind.
   */
  async award(
    tx: Db,
    input: { roundPlayerId: string; sourceKey: string; source: string; amount: number; awardedAt: Date },
  ): Promise<{ awardedXp: number; totalXp: number; level: number; unlocked: ExperienceLevelReward[] }> {
    const baseAmount = Math.max(0, Math.floor(input.amount));
    const amount = baseAmount * (await DoubleXpWeekendService.isActive(tx, input.awardedAt) ? 2 : 1);
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
    const unlocked = experienceTitlesBetween(previousLevel, level);

    if (level > previousLevel) {
      // Every title up to the new level, so accounts that levelled before a title existed catch up.
      await tx.accountCosmeticUnlock.createMany({
        data: experienceTitlesBetween(0, level).map((cosmetic) => ({
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
        })),
        skipDuplicates: true,
      });
      // Crowns for every milestone up to the new level; already-paid ones are skipped.
      await CrownEarnService.onLevelReached(tx, player.accountId, level);
    }

    return { awardedXp: amount, totalXp, level, unlocked };
  },
};
