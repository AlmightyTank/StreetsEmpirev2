import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type {
  PublicCurrentGameDto,
  PublicOverviewDto,
  PublicRankingEntryDto,
  PublicTurfEventDto,
} from '@streets/shared';
import { toRoundDto } from '../game/dto.js';
import { RoundService } from './round.service.js';

const TOP_RANKINGS = 5;
const RECENT_EVENTS = 6;
const RECENT_NEWS = 3;

function rankedRows(
  rows: Array<{
    publicPimpId: number;
    displayName: string;
    netWorthCents: bigint;
    city: { slug: string; name: string };
    alliance: { name: string; tag: string } | null;
  }>,
): PublicRankingEntryDto[] {
  let previousWorth: bigint | null = null;
  let previousRank = 0;

  return rows.map((row, index) => {
    const rank = previousWorth !== null && row.netWorthCents === previousWorth
      ? previousRank
      : index + 1;
    previousWorth = row.netWorthCents;
    previousRank = rank;

    return {
      rank,
      publicPimpId: row.publicPimpId,
      displayName: row.displayName,
      netWorthCents: Number(row.netWorthCents),
      city: row.city,
      alliance: row.alliance,
    };
  });
}

export const PublicSiteService = {
  async currentGame(prisma: PrismaClient): Promise<PublicCurrentGameDto | null> {
    const round = await RoundService.getCurrent(prisma);
    if (!round) return null;

    const ruleset = loadRulesetForRound(round);

    const [
      playerCount,
      allianceCount,
      cityCount,
      turfBlocksHeld,
      turfBattles,
      economy,
      rankingRows,
      eventRows,
      newsRows,
    ] = await Promise.all([
      RoundService.playerCount(prisma, round.id),
      prisma.alliance.count({
        where: { roundId: round.id, disbandedAt: null },
      }),
      prisma.city.count({ where: { isEnabled: true } }),
      prisma.turf.count({
        where: { roundId: round.id, holderId: { not: null } },
      }),
      prisma.turfPush.count({
        where: { roundId: round.id, status: 'LANDED' },
      }),
      prisma.roundPlayer.aggregate({
        where: { roundId: round.id, account: { isActive: true } },
        _sum: { netWorthCents: true },
      }),
      prisma.roundPlayer.findMany({
        where: { roundId: round.id, account: { isActive: true } },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        take: TOP_RANKINGS,
        select: {
          publicPimpId: true,
          displayName: true,
          netWorthCents: true,
          city: { select: { slug: true, name: true } },
          alliance: { select: { name: true, tag: true } },
        },
      }),
      prisma.turfPush.findMany({
        where: {
          roundId: round.id,
          status: 'LANDED',
          captured: true,
          settledAt: { not: null },
          attacker: { account: { isActive: true } },
        },
        orderBy: { settledAt: 'desc' },
        take: RECENT_EVENTS,
        select: {
          settledAt: true,
          attacker: {
            select: {
              publicPimpId: true,
              displayName: true,
              alliance: { select: { name: true, tag: true } },
            },
          },
          turf: {
            select: {
              district: true,
              city: { select: { slug: true, name: true } },
            },
          },
        },
      }),
      prisma.gameNews.findMany({
        where: {
          publishedAt: { lte: new Date() },
          OR: [{ roundId: null }, { roundId: round.id }],
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        take: RECENT_NEWS,
        select: {
          id: true,
          title: true,
          isPinned: true,
          publishedAt: true,
        },
      }),
    ]);

    const recentEvents: PublicTurfEventDto[] = eventRows.flatMap((row) => {
      if (!row.settledAt) return [];
      return [{
        kind: 'TURF_CAPTURE' as const,
        occurredAt: row.settledAt.toISOString(),
        player: {
          publicPimpId: row.attacker.publicPimpId,
          displayName: row.attacker.displayName,
        },
        alliance: row.attacker.alliance,
        city: row.turf.city,
        district: row.turf.district,
      }];
    });

    return {
      round: toRoundDto(round, playerCount),
      ruleset: {
        id: ruleset.meta.id,
        version: ruleset.meta.version,
        name: ruleset.meta.name,
      },
      stats: {
        players: playerCount,
        alliances: allianceCount,
        cities: cityCount,
        turfBlocksHeld,
        turfBattles,
        economyNetWorthCents: Number(economy._sum.netWorthCents ?? 0n),
      },
      topRankings: rankedRows(rankingRows),
      recentEvents,
      recentNews: newsRows.map((row) => ({
        id: row.id,
        title: row.title,
        isPinned: row.isPinned,
        publishedAt: row.publishedAt.toISOString(),
      })),
    };
  },

  async overview(prisma: PrismaClient): Promise<PublicOverviewDto> {
    const [currentGame, completedGames, activeAccounts] = await Promise.all([
      PublicSiteService.currentGame(prisma),
      prisma.round.count({
        where: { status: { in: ['ENDED', 'ARCHIVED'] } },
      }),
      prisma.account.count({ where: { isActive: true } }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      currentGame,
      allTime: {
        completedGames,
        activeAccounts,
      },
    };
  },
};
