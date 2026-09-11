import type { City, PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
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
export function rankRows(rows: RankingRow[], mePublicPimpId: number, hideOpponentNetWorth = false): RankingEntryDto[] {
  let previousWorth: bigint | null = null;
  let rank = 0;

  return rows.map((row, index) => {
    if (previousWorth === null || row.netWorthCents !== previousWorth) {
      rank = index + 1;
      previousWorth = row.netWorthCents;
    }

    const isYou = row.publicPimpId === mePublicPimpId;
    return {
      rank,
      publicPimpId: row.publicPimpId,
      displayName: row.displayName,
      city: toCityDto(row.city),
      netWorthCents: hideOpponentNetWorth && !isYou ? null : Number(row.netWorthCents),
      isYou,
      intelRequired: hideOpponentNetWorth && !isYou,
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
    ruleset: Ruleset,
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

    const hideOpponentNetWorth = ruleset.communityPrivacy?.hideOpponentNetWorth ?? false;

    return {
      national: rankRows(nationalRows, player.publicPimpId, hideOpponentNetWorth),
      local: rankRows(localRows, player.publicPimpId, hideOpponentNetWorth),
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
    ruleset: Ruleset,
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

    const isYou = player.publicPimpId === viewerPublicPimpId;
    const privacy = ruleset.communityPrivacy;
    const hideNetWorth = Boolean(privacy?.hideOpponentNetWorth && !isYou);
    const hideCrew = Boolean(privacy?.hideOpponentCrew && !isYou);
    const hideWeapons = Boolean(privacy?.hideOpponentWeapons && !isYou);
    const weapons = player.pistols + player.shotguns + player.tek9s + player.ak47s;

    return {
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      city: toCityDto(player.city),
      netWorthCents: hideNetWorth ? null : Number(player.netWorthCents),
      rank: {
        local: localAhead + 1,
        national: nationalAhead + 1,
      },
      crew: hideCrew ? null : {
        whores: player.whores,
        thugs: player.thugs,
      },
      weapons: hideWeapons ? null : {
        pistols: player.pistols,
        shotguns: player.shotguns,
        tek9s: player.tek9s,
        ak47s: player.ak47s,
        total: weapons,
      },
      lowRiders: hideCrew ? null : player.lowRiders,
      intelRequired: hideNetWorth || hideCrew || hideWeapons,
      joinedAt: player.createdAt.toISOString(),
      lastActiveAt: player.lastActiveAt.toISOString(),
      isYou,
    };
  },
};
