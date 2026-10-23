import type { PrismaClient, Round } from '@prisma/client';
import { MENTORING, SEASON_FINISH_EXPERIENCE, STREET_SIGN_FONT_PACKS, experienceLevelFor, experienceTitlesBetween, seasonFinishExperience, playerExperienceDto, type ExperienceLevelReward, type PlayerExperienceDto, type PlayerExperienceEventDto, type XpLeaderboardDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { CrownEarnService } from './crown-earn.service.js';
import { MentoringService } from './mentoring.service.js';
import { RoundService } from './round.service.js';
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

  /**
   * Season close: XP for finishing, with bonuses for a national top 10, podium
   * and the win. Only players who earned SEASON_FINISH_EXPERIENCE.minRoundXp
   * during the round count, so an idle sign-up gets nothing. Once per account
   * and round. Runs in the round close transaction after the final standings.
   */
  async awardSeasonFinish(tx: Db, round: Pick<Round, 'id' | 'startsAt'>, at: Date): Promise<number> {
    const players = await tx.roundPlayer.findMany({
      where: { roundId: round.id, account: { isActive: true } },
      select: { id: true, accountId: true, nationalRank: true },
    });
    if (!players.length) return 0;
    const earned = await tx.playerExperienceEvent.groupBy({
      by: ['accountId'],
      where: { accountId: { in: players.map((player) => player.accountId) }, awardedAt: { gte: round.startsAt, lte: at } },
      _sum: { amount: true },
    });
    const played = new Set(earned.filter((row) => (row._sum.amount ?? 0) >= SEASON_FINISH_EXPERIENCE.minRoundXp).map((row) => row.accountId));
    let awarded = 0;
    for (const player of players) {
      if (!played.has(player.accountId)) continue;
      const result = await PlayerExperienceService.award(tx, {
        roundPlayerId: player.id,
        sourceKey: `season-finish:${round.id}`,
        source: 'SEASON_FINISH',
        amount: seasonFinishExperience(player.nationalRank),
        awardedAt: at,
      });
      if (result.awardedXp > 0) awarded += 1;
    }
    return awarded;
  },

  /** Endgame board: account XP earned in one UTC calendar year, active accounts only. */
  async yearlyLeaderboard(prisma: PrismaClient, year: number, viewerAccountId: string | null, limit = 50): Promise<XpLeaderboardDto> {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    const rows = await prisma.$queryRaw<{ accountId: string; xp: bigint }[]>`
      SELECT e."accountId", SUM(e."amount")::bigint AS xp
      FROM "PlayerExperienceEvent" e JOIN "Account" a ON a."id" = e."accountId"
      WHERE a."isActive" AND e."awardedAt" >= ${from} AND e."awardedAt" < ${to}
      GROUP BY e."accountId"
      ORDER BY xp DESC, e."accountId" ASC
      LIMIT ${limit}`;
    const ids = rows.map((row) => row.accountId);
    const [players, levels, current] = await Promise.all([
      prisma.roundPlayer.findMany({
        where: { accountId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        distinct: ['accountId'],
        select: { accountId: true, displayName: true, publicPimpId: true, roundId: true },
      }),
      PlayerExperienceService.levels(prisma, ids),
      RoundService.getCurrent(prisma),
    ]);
    const byAccount = new Map(players.map((row) => [row.accountId, row]));
    const accounts = new Map((await prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })).map((row) => [row.id, row.username]));

    let me: XpLeaderboardDto['me'] = null;
    if (viewerAccountId) {
      const mine = await prisma.$queryRaw<{ xp: bigint | null }[]>`
        SELECT SUM("amount")::bigint AS xp FROM "PlayerExperienceEvent"
        WHERE "accountId" = ${viewerAccountId} AND "awardedAt" >= ${from} AND "awardedAt" < ${to}`;
      const xp = Number(mine[0]?.xp ?? 0);
      if (xp > 0) {
        const ahead = await prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count FROM (
            SELECT e."accountId" FROM "PlayerExperienceEvent" e JOIN "Account" a ON a."id" = e."accountId"
            WHERE a."isActive" AND e."awardedAt" >= ${from} AND e."awardedAt" < ${to}
            GROUP BY e."accountId" HAVING SUM(e."amount") > ${xp}
          ) ahead`;
        me = { rank: Number(ahead[0]?.count ?? 0) + 1, xp };
      }
    }

    return {
      year,
      me,
      entries: rows.map((row, index) => {
        const player = byAccount.get(row.accountId);
        return {
          rank: index + 1,
          displayName: player?.displayName ?? accounts.get(row.accountId) ?? 'Unknown',
          publicPimpId: player && current && player.roundId === current.id ? player.publicPimpId : null,
          xp: Number(row.xp),
          level: levels.get(row.accountId) ?? 1,
          isYou: row.accountId === viewerAccountId,
        };
      }),
    };
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
    input: ({ roundPlayerId: string; accountId?: never } | { accountId: string; roundPlayerId?: never }) & { sourceKey: string; source: string; amount: number; awardedAt: Date },
  ): Promise<{ awardedXp: number; totalXp: number; level: number; unlocked: ExperienceLevelReward[] }> {
    const baseAmount = Math.max(0, Math.floor(input.amount));
    const amount = baseAmount * (await DoubleXpWeekendService.isActive(tx, input.awardedAt) ? 2 : 1);
    if (amount <= 0) return { awardedXp: 0, totalXp: 0, level: 1, unlocked: [] };

    const player = input.accountId
      ? { accountId: input.accountId }
      : await tx.roundPlayer.findUnique({ where: { id: input.roundPlayerId }, select: { accountId: true } });
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
      // Permanent account cosmetics; replay the catalogue to the reached level
      // so existing accounts receive packs whose milestones they already passed.
      await tx.accountCosmeticUnlock.createMany({
        data: STREET_SIGN_FONT_PACKS.filter((pack) => pack.level <= level).map((pack) => ({
          accountId: player.accountId,
          key: pack.key,
          kind: 'STREET_SIGN_FONT_PACK',
          title: pack.label,
          description: pack.description,
          rarity: pack.level >= 20 ? 'rare' : 'uncommon',
          styleKey: null,
          sourceQuestKey: 'PLAYER_EXPERIENCE_SIGN_FONT_PACK',
          sourceRulesetId: 'account-progression',
          sourceRulesetVersion: '1',
          awardedAt: input.awardedAt,
        })),
        skipDuplicates: true,
      });
      // Crowns for every milestone up to the new level; already-paid ones are skipped.
      await CrownEarnService.onLevelReached(tx, player.accountId, level);
      // Mentoring: the mentor earns XP for each milestone level this account just reached.
      const mentoring = await MentoringService.milestonesFor(tx, player.accountId, previousLevel, level);
      for (const milestone of mentoring?.milestones ?? []) {
        await PlayerExperienceService.award(tx, {
          accountId: mentoring!.mentorAccountId,
          sourceKey: `mentor:${player.accountId}:${milestone}`,
          source: 'MENTOR',
          amount: MENTORING.mentorXp,
          awardedAt: input.awardedAt,
        });
      }
    }

    return { awardedXp: amount, totalXp, level, unlocked };
  },
};
