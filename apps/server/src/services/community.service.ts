import type { City, PrismaClient } from '@prisma/client';
import type {
  PublicPlayerProfileDto,
  RankingEntryDto,
  RankingsDto,
} from '@streets/shared';
import { toCityDto } from '../game/dto.js';
import { AppError } from '../utils/errors.js';

interface RankingRow {
  publicPimpId: number;
  displayName: string;
  netWorthCents: bigint;
  city: City;
}

/** Assign competition ranks: 1, 2, 2, 4. Rows must already be worth-descending. */
export function rankRows(rows: RankingRow[], mePublicPimpId: number): RankingEntryDto[] {
  let previousWorth: bigint | null = null;
  let rank = 0;

  return rows.map((row, index) => {
    if (previousWorth === null || row.netWorthCents !== previousWorth) {
      rank = index + 1;
      previousWorth = row.netWorthCents;
    }

    return {
      rank,
      publicPimpId: row.publicPimpId,
      displayName: row.displayName,
      city: toCityDto(row.city),
      netWorthCents: Number(row.netWorthCents),
      isYou: row.publicPimpId === mePublicPimpId,
    };
  });
}

export const CommunityService = {
  async rankings(
    prisma: PrismaClient,
    player: {
      roundId: string;
      cityId: string;
      publicPimpId: number;
      localRank: number | null;
      nationalRank: number | null;
      city: City;
    },
    topCount: number,
  ): Promise<RankingsDto> {
    const [nationalRows, localRows] = await Promise.all([
      prisma.roundPlayer.findMany({
        where: { roundId: player.roundId },
        include: { city: true },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        take: topCount,
      }),
      prisma.roundPlayer.findMany({
        where: { roundId: player.roundId, cityId: player.cityId },
        include: { city: true },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        take: topCount,
      }),
    ]);

    return {
      national: rankRows(nationalRows, player.publicPimpId),
      local: rankRows(localRows, player.publicPimpId),
      localCity: toCityDto(player.city),
      me: {
        publicPimpId: player.publicPimpId,
        localRank: player.localRank ?? 1,
        nationalRank: player.nationalRank ?? 1,
      },
    };
  },

  async profile(
    prisma: PrismaClient,
    roundId: string,
    publicPimpId: number,
    viewerPublicPimpId: number,
  ): Promise<PublicPlayerProfileDto> {
    const player = await prisma.roundPlayer.findUnique({
      where: { roundId_publicPimpId: { roundId, publicPimpId } },
      include: { city: true },
    });

    if (!player) {
      throw AppError.notFound('PLAYER_NOT_FOUND', 'That pimp is not in this round.');
    }

    const [nationalAhead, localAhead] = await Promise.all([
      prisma.roundPlayer.count({
        where: { roundId, netWorthCents: { gt: player.netWorthCents } },
      }),
      prisma.roundPlayer.count({
        where: {
          roundId,
          cityId: player.cityId,
          netWorthCents: { gt: player.netWorthCents },
        },
      }),
    ]);

    const weapons = player.pistols + player.shotguns + player.tek9s + player.ak47s;

    return {
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      city: toCityDto(player.city),
      netWorthCents: Number(player.netWorthCents),
      rank: {
        local: localAhead + 1,
        national: nationalAhead + 1,
      },
      crew: {
        whores: player.whores,
        thugs: player.thugs,
      },
      weapons: {
        pistols: player.pistols,
        shotguns: player.shotguns,
        tek9s: player.tek9s,
        ak47s: player.ak47s,
        total: weapons,
      },
      lowRiders: player.lowRiders,
      joinedAt: player.createdAt.toISOString(),
      lastActiveAt: player.lastActiveAt.toISOString(),
      isYou: player.publicPimpId === viewerPublicPimpId,
    };
  },
};
