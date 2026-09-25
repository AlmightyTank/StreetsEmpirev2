import type { PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type {
  PublicAlliancePageDto,
  PublicAllianceRankingDto,
  PublicAlliancesDto,
  PublicCitiesDto,
  PublicCityPageDto,
  PublicHallOfFameDto,
  PublicNewsArticleDto,
  PublicNewsFeedDto,
  PublicPlayerPageDto,
  PublicRankingEntryDto,
  PublicRankingsDto,
  PublicSearchDto,
  PublicSearchResultDto,
  PublicStatsDto,
  PublicStatusDto,
  PublicTurfDto,
  PublicTurfEventDto,
} from '@streets/shared';
import { toRoundDto } from '../game/dto.js';
import { RoundService } from './round.service.js';
import { PublicSiteService } from './public-site.service.js';
import { profileTitleForKey } from './profile-titles.js';

const rankingRows = <T extends { netWorthCents: bigint; publicPimpId: number }>(rows: T[]) => {
  let previousWorth: bigint | null = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const rank = previousWorth !== null && row.netWorthCents === previousWorth ? previousRank : index + 1;
    previousWorth = row.netWorthCents;
    previousRank = rank;
    return { row, rank };
  });
};

const titleCase = (value: string): string =>
  value.toLowerCase().split(/[_-]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

const roundDto = async (prisma: PrismaClient, round: Round | null) =>
  round ? toRoundDto(round, await RoundService.playerCount(prisma, round.id)) : null;

async function current(prisma: PrismaClient) {
  const round = await RoundService.getCurrent(prisma);
  return { round, ruleset: round ? loadRulesetForRound(round) : null };
}

function publicRanking(
  row: {
    publicPimpId: number;
    displayName: string;
    netWorthCents: bigint;
    city: { slug: string; name: string };
    alliance: { name: string; tag: string } | null;
  },
  rank: number,
): PublicRankingEntryDto {
  return {
    rank,
    publicPimpId: row.publicPimpId,
    displayName: row.displayName,
    netWorthCents: Number(row.netWorthCents),
    city: row.city,
    alliance: row.alliance,
  };
}

async function recentTurfCaptures(
  prisma: PrismaClient,
  roundId: string,
  take = 20,
): Promise<PublicTurfEventDto[]> {
  const rows = await prisma.turfPush.findMany({
    where: {
      roundId,
      status: 'LANDED',
      captured: true,
      settledAt: { not: null },
      attacker: { account: { isActive: true } },
    },
    orderBy: { settledAt: 'desc' },
    take,
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
  });

  return rows.flatMap((row) => row.settledAt ? [{
    kind: 'TURF_CAPTURE' as const,
    occurredAt: row.settledAt.toISOString(),
    player: {
      publicPimpId: row.attacker.publicPimpId,
      displayName: row.attacker.displayName,
    },
    alliance: row.attacker.alliance,
    city: row.turf.city,
    district: row.turf.district,
  }] : []);
}

export const PublicDirectoryService = {
  async rankings(prisma: PrismaClient, limit = 100): Promise<PublicRankingsDto> {
    const { round } = await current(prisma);
    if (!round) return { generatedAt: new Date().toISOString(), round: null, rankings: [] };

    const rows = await prisma.roundPlayer.findMany({
      where: { roundId: round.id, account: { isActive: true } },
      orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
      take: Math.max(1, Math.min(limit, 250)),
      select: {
        publicPimpId: true,
        displayName: true,
        netWorthCents: true,
        dailyStartingNationalRank: true,
        city: { select: { slug: true, name: true } },
        alliance: { select: { name: true, tag: true } },
      },
    });

    return {
      generatedAt: new Date().toISOString(),
      round: await roundDto(prisma, round),
      rankings: rankingRows(rows).map(({ row, rank }) => ({
        ...publicRanking(row, rank),
        movement: row.dailyStartingNationalRank === null ? null : row.dailyStartingNationalRank - rank,
      })),
    };
  },

  async player(prisma: PrismaClient, publicPimpId: number): Promise<PublicPlayerPageDto | null> {
    const { round } = await current(prisma);
    if (!round) return null;

    const player = await prisma.roundPlayer.findFirst({
      where: { roundId: round.id, publicPimpId, account: { isActive: true } },
      select: {
        accountId: true,
        publicPimpId: true,
        displayName: true,
        netWorthCents: true,
        nationalRank: true,
        localRank: true,
        dailyStartingNationalRank: true,
        dailyStartingLocalRank: true,
        createdAt: true,
        lastActiveAt: true,
        city: { select: { slug: true, name: true } },
        alliance: { select: { name: true, tag: true } },
        account: {
          select: {
            profile: {
              select: { activeTitleKey: true, profileAccent: true },
            },
          },
        },
      },
    });
    if (!player) return null;

    const [nationalAhead, localAhead, history] = await Promise.all([
      prisma.roundPlayer.count({
        where: { roundId: round.id, account: { isActive: true }, netWorthCents: { gt: player.netWorthCents } },
      }),
      prisma.roundPlayer.count({
        where: { roundId: round.id, city: { slug: player.city.slug }, account: { isActive: true }, netWorthCents: { gt: player.netWorthCents } },
      }),
      prisma.roundPlayer.findMany({
        where: {
          accountId: player.accountId,
          roundId: { not: round.id },
          round: { status: { in: ['ENDED', 'ARCHIVED'] } },
        },
        orderBy: { round: { endsAt: 'desc' } },
        select: {
          publicPimpId: true,
          displayName: true,
          netWorthCents: true,
          localRank: true,
          nationalRank: true,
          city: { select: { slug: true, name: true } },
          alliance: { select: { name: true, tag: true } },
          round: { select: { slug: true, name: true, startsAt: true, endsAt: true } },
        },
      }),
    ]);

    const national = nationalAhead + 1;
    const local = localAhead + 1;
    const rankedHistory = history.filter((row) => row.nationalRank !== null);
    const bestNationalRank = rankedHistory.reduce<number | null>(
      (best, row) => best === null ? row.nationalRank : Math.min(best, row.nationalRank!),
      null,
    );

    return {
      round: toRoundDto(round, await RoundService.playerCount(prisma, round.id)),
      player: {
        publicPimpId: player.publicPimpId,
        displayName: player.displayName,
        netWorthCents: Number(player.netWorthCents),
        city: player.city,
        alliance: player.alliance,
        rank: {
          national,
          local,
          nationalMovement: player.dailyStartingNationalRank === null ? null : player.dailyStartingNationalRank - national,
          localMovement: player.dailyStartingLocalRank === null ? null : player.dailyStartingLocalRank - local,
        },
        cosmetics: {
          title: player.account.profile?.activeTitleKey
            ? profileTitleForKey(player.account.profile.activeTitleKey)
            : null,
          accent: player.account.profile?.profileAccent ?? 'default',
        },
        joinedAt: player.createdAt.toISOString(),
        lastActiveAt: player.lastActiveAt.toISOString(),
      },
      career: {
        roundsPlayed: rankedHistory.length,
        roundWins: rankedHistory.filter((row) => row.nationalRank === 1).length,
        topTenFinishes: rankedHistory.filter((row) => row.nationalRank! <= 10).length,
        bestNationalRank,
        totalFinalNetWorthCents: rankedHistory.reduce((sum, row) => sum + Number(row.netWorthCents), 0),
        seasons: rankedHistory.map((row) => ({
          round: {
            slug: row.round.slug,
            name: row.round.name,
            startsAt: row.round.startsAt.toISOString(),
            endedAt: row.round.endsAt.toISOString(),
          },
          publicPimpId: row.publicPimpId,
          displayName: row.displayName,
          city: row.city,
          alliance: row.alliance,
          finalNetWorthCents: Number(row.netWorthCents),
          localRank: row.localRank,
          nationalRank: row.nationalRank,
        })),
      },
    };
  },

  async alliances(prisma: PrismaClient): Promise<PublicAlliancesDto> {
    const { round } = await current(prisma);
    if (!round) return { generatedAt: new Date().toISOString(), round: null, alliances: [] };

    const [alliances, members, turf] = await Promise.all([
      prisma.alliance.findMany({
        where: { roundId: round.id, disbandedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, tag: true },
      }),
      prisma.roundPlayer.findMany({
        where: { roundId: round.id, allianceId: { not: null }, account: { isActive: true } },
        select: { allianceId: true, netWorthCents: true },
      }),
      prisma.turf.findMany({
        where: { roundId: round.id, holderId: { not: null } },
        select: { holder: { select: { allianceId: true } } },
      }),
    ]);

    const totals = new Map<string, { worth: bigint; members: number; turf: number }>(
      alliances.map((row) => [row.id, { worth: 0n, members: 0, turf: 0 }]),
    );
    for (const member of members) {
      if (!member.allianceId) continue;
      const total = totals.get(member.allianceId);
      if (!total) continue;
      total.worth += member.netWorthCents;
      total.members += 1;
    }
    for (const block of turf) {
      const allianceId = block.holder?.allianceId;
      if (!allianceId) continue;
      const total = totals.get(allianceId);
      if (total) total.turf += 1;
    }

    const ordered = alliances
      .map((alliance) => ({ alliance, total: totals.get(alliance.id)! }))
      .sort((a, b) => a.total.worth === b.total.worth ? a.alliance.tag.localeCompare(b.alliance.tag) : a.total.worth > b.total.worth ? -1 : 1);

    let previousWorth: bigint | null = null;
    let previousRank = 0;
    const publicRows: PublicAllianceRankingDto[] = ordered.map(({ alliance, total }, index) => {
      const rank = previousWorth !== null && total.worth === previousWorth ? previousRank : index + 1;
      previousWorth = total.worth;
      previousRank = rank;
      return {
        rank,
        name: alliance.name,
        tag: alliance.tag,
        combinedNetWorthCents: Number(total.worth),
        memberCount: total.members,
        turfBlocks: total.turf,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      round: await roundDto(prisma, round),
      alliances: publicRows,
    };
  },

  async alliance(prisma: PrismaClient, tag: string): Promise<PublicAlliancePageDto | null> {
    const { round } = await current(prisma);
    if (!round) return null;

    const alliance = await prisma.alliance.findFirst({
      where: { roundId: round.id, tagNormalized: tag.trim().toLowerCase(), disbandedAt: null },
      select: { id: true, name: true, tag: true, leaderId: true, createdAt: true },
    });
    if (!alliance) return null;

    const [all, members, turfBlocks, rankingData] = await Promise.all([
      prisma.roundPlayer.findMany({
        where: { roundId: round.id, account: { isActive: true } },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        select: { id: true, netWorthCents: true, publicPimpId: true },
      }),
      prisma.roundPlayer.findMany({
        where: { roundId: round.id, allianceId: alliance.id, account: { isActive: true } },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        select: {
          id: true,
          publicPimpId: true,
          displayName: true,
          netWorthCents: true,
          city: { select: { slug: true, name: true } },
        },
      }),
      prisma.turf.count({ where: { roundId: round.id, holder: { allianceId: alliance.id } } }),
      PublicDirectoryService.alliances(prisma),
    ]);

    const rankByPlayer = new Map(rankingRows(all).map(({ row, rank }) => [row.id, rank]));
    const standing = rankingData.alliances.find((row) => row.tag.toLowerCase() === alliance.tag.toLowerCase());
    if (!standing) return null;

    const leader = members.find((member) => member.id === alliance.leaderId);
    return {
      ...standing,
      turfBlocks,
      leader: leader ? { publicPimpId: leader.publicPimpId, displayName: leader.displayName } : null,
      members: members.map((member) => ({
        publicPimpId: member.publicPimpId,
        displayName: member.displayName,
        nationalRank: rankByPlayer.get(member.id) ?? 1,
        netWorthCents: Number(member.netWorthCents),
        city: member.city,
        isLeader: member.id === alliance.leaderId,
      })),
      foundedAt: alliance.createdAt.toISOString(),
    };
  },

  async cities(prisma: PrismaClient): Promise<PublicCitiesDto> {
    const { round, ruleset } = await current(prisma);
    if (!round || !ruleset) return { generatedAt: new Date().toISOString(), round: null, cities: [] };

    const [dbCities, players, turf] = await Promise.all([
      prisma.city.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }),
      prisma.roundPlayer.findMany({
        where: { roundId: round.id, account: { isActive: true } },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        select: {
          publicPimpId: true,
          displayName: true,
          netWorthCents: true,
          city: { select: { slug: true, name: true } },
          alliance: { select: { name: true, tag: true } },
        },
      }),
      prisma.turf.findMany({ where: { roundId: round.id }, select: { city: { select: { slug: true } }, holderId: true } }),
    ]);

    const available = ruleset.cities
      ? Object.entries(ruleset.cities).map(([slug, rules]) => ({ slug, name: rules.name }))
      : dbCities;

    return {
      generatedAt: new Date().toISOString(),
      round: await roundDto(prisma, round),
      cities: available.map((city) => {
        const cityPlayers = players.filter((player) => player.city.slug === city.slug);
        const cityTurf = turf.filter((block) => block.city.slug === city.slug);
        const rule = ruleset.cities?.[city.slug];
        return {
          slug: city.slug,
          name: rule?.name ?? city.name,
          trait: rule?.trait ?? null,
          blurb: rule?.blurb ?? null,
          talk: rule ? [...rule.talk] : [],
          playerCount: cityPlayers.length,
          economyNetWorthCents: cityPlayers.reduce((sum, row) => sum + Number(row.netWorthCents), 0),
          turfBlocksHeld: cityTurf.filter((row) => row.holderId !== null).length,
          turfBlocksTotal: cityTurf.length,
          topPlayers: rankingRows(cityPlayers.slice(0, 3)).map(({ row, rank }) => publicRanking(row, rank)),
        };
      }),
    };
  },

  async city(prisma: PrismaClient, slug: string): Promise<PublicCityPageDto | null> {
    const { round, ruleset } = await current(prisma);
    if (!round || !ruleset) return null;
    const cities = await PublicDirectoryService.cities(prisma);
    const summary = cities.cities.find((city) => city.slug === slug);
    if (!summary) return null;

    const blocks = await prisma.turf.findMany({
      where: { roundId: round.id, city: { slug } },
      orderBy: { district: 'asc' },
      select: {
        district: true,
        heldSince: true,
        holder: {
          select: {
            publicPimpId: true,
            displayName: true,
            alliance: { select: { name: true, tag: true } },
          },
        },
      },
    });
    const cityRule = ruleset.cities?.[slug];
    const districtRules = cityRule?.districts as Record<string, { name: string; blurb?: string }> | undefined;

    return {
      ...summary,
      districts: blocks.map((block) => ({
        key: block.district,
        name: districtRules?.[block.district]?.name ?? titleCase(block.district),
        blurb: districtRules?.[block.district]?.blurb ?? null,
        holder: block.holder ? {
          publicPimpId: block.holder.publicPimpId,
          displayName: block.holder.displayName,
          alliance: block.holder.alliance,
          heldSince: block.heldSince?.toISOString() ?? null,
        } : null,
      })),
    };
  },

  async turf(prisma: PrismaClient): Promise<PublicTurfDto> {
    const { round, ruleset } = await current(prisma);
    if (!round || !ruleset) {
      return { generatedAt: new Date().toISOString(), round: null, enabled: false, blocks: [], recentCaptures: [] };
    }

    const blocks = await prisma.turf.findMany({
      where: { roundId: round.id },
      orderBy: [{ city: { sortOrder: 'asc' } }, { district: 'asc' }],
      select: {
        district: true,
        heldSince: true,
        city: { select: { slug: true, name: true } },
        holder: {
          select: {
            publicPimpId: true,
            displayName: true,
            alliance: { select: { name: true, tag: true } },
          },
        },
      },
    });

    return {
      generatedAt: new Date().toISOString(),
      round: await roundDto(prisma, round),
      enabled: Boolean(ruleset.turf),
      blocks: blocks.map((block) => {
        const cityRule = ruleset.cities?.[block.city.slug];
        const districtRules = cityRule?.districts as Record<string, { name: string }> | undefined;
        return {
          city: block.city,
          district: block.district,
          districtName: districtRules?.[block.district]?.name ?? titleCase(block.district),
          holder: block.holder,
          heldSince: block.heldSince?.toISOString() ?? null,
        };
      }),
      recentCaptures: await recentTurfCaptures(prisma, round.id, 20),
    };
  },

  async hallOfFame(prisma: PrismaClient): Promise<PublicHallOfFameDto> {
    const rounds = await prisma.round.findMany({
      where: { status: { in: ['ENDED', 'ARCHIVED'] } },
      orderBy: [{ endsAt: 'desc' }, { startsAt: 'desc' }],
      take: 50,
      select: { id: true, slug: true, name: true, endsAt: true },
    });
    const roundIds = rounds.map((round) => round.id);
    if (!roundIds.length) return { generatedAt: new Date().toISOString(), champions: [], career: [] };

    const [winners, finishers] = await Promise.all([
      prisma.roundPlayer.findMany({
        where: { roundId: { in: roundIds }, nationalRank: 1, account: { isActive: true } },
        select: {
          roundId: true,
          publicPimpId: true,
          displayName: true,
          netWorthCents: true,
          localRank: true,
          nationalRank: true,
          city: { select: { slug: true, name: true } },
          alliance: { select: { name: true, tag: true } },
        },
      }),
      prisma.roundPlayer.findMany({
        where: { roundId: { in: roundIds }, nationalRank: { not: null }, account: { isActive: true } },
        orderBy: { round: { endsAt: 'desc' } },
        select: {
          accountId: true,
          displayName: true,
          nationalRank: true,
          netWorthCents: true,
        },
      }),
    ]);

    const career = new Map<string, { displayName: string; wins: number; topTenFinishes: number; roundsPlayed: number; total: number }>();
    for (const row of finishers) {
      const item = career.get(row.accountId) ?? { displayName: row.displayName, wins: 0, topTenFinishes: 0, roundsPlayed: 0, total: 0 };
      item.roundsPlayed += 1;
      item.total += Number(row.netWorthCents);
      if (row.nationalRank === 1) item.wins += 1;
      if (row.nationalRank! <= 10) item.topTenFinishes += 1;
      career.set(row.accountId, item);
    }

    return {
      generatedAt: new Date().toISOString(),
      champions: rounds.map((round) => ({
        round: { slug: round.slug, name: round.name, endedAt: round.endsAt.toISOString() },
        winners: winners.filter((row) => row.roundId === round.id).map((row) => ({
          nationalRank: row.nationalRank!,
          localRank: row.localRank,
          publicPimpId: row.publicPimpId,
          displayName: row.displayName,
          netWorthCents: Number(row.netWorthCents),
          city: row.city,
          alliance: row.alliance,
        })),
      })),
      career: [...career.values()]
        .sort((a, b) => b.wins - a.wins || b.topTenFinishes - a.topTenFinishes || b.total - a.total)
        .slice(0, 50)
        .map((row) => ({
          displayName: row.displayName,
          wins: row.wins,
          topTenFinishes: row.topTenFinishes,
          roundsPlayed: row.roundsPlayed,
          totalFinalNetWorthCents: row.total,
        })),
    };
  },

  async stats(prisma: PrismaClient): Promise<PublicStatsDto> {
    const endedRounds = await prisma.round.findMany({
      where: { status: { in: ['ENDED', 'ARCHIVED'] } },
      select: { id: true },
    });
    const roundIds = endedRounds.map((round) => round.id);
    const playerRefs = roundIds.length ? await prisma.roundPlayer.findMany({
      where: { roundId: { in: roundIds } },
      select: { id: true },
    }) : [];
    const playerIds = playerRefs.map((row) => row.id);

    const [currentGame, playerAgg, battles, runs, turfBattles, turfCaptures] = await Promise.all([
      PublicSiteService.currentGame(prisma),
      roundIds.length ? prisma.roundPlayer.aggregate({
        where: { roundId: { in: roundIds } },
        _count: { _all: true },
        _sum: { netWorthCents: true },
      }) : Promise.resolve({ _count: { _all: 0 }, _sum: { netWorthCents: null } }),
      playerIds.length ? prisma.raidBattle.count({ where: { attackerId: { in: playerIds }, voidedAt: null } }) : Promise.resolve(0),
      playerIds.length ? prisma.run.count({ where: { roundPlayerId: { in: playerIds }, status: 'RETURNED' } }) : Promise.resolve(0),
      roundIds.length ? prisma.turfPush.count({ where: { roundId: { in: roundIds }, status: 'LANDED' } }) : Promise.resolve(0),
      roundIds.length ? prisma.turfPush.count({ where: { roundId: { in: roundIds }, status: 'LANDED', captured: true } }) : Promise.resolve(0),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      current: currentGame?.stats ?? null,
      allTime: {
        completedGames: roundIds.length,
        playerSeasons: playerAgg._count._all,
        finalEconomyNetWorthCents: Number(playerAgg._sum.netWorthCents ?? 0n),
        combatBattles: battles,
        travelRuns: runs,
        turfBattles,
        turfCaptures,
      },
    };
  },

  async news(prisma: PrismaClient, limit = 50): Promise<PublicNewsFeedDto> {
    const rows = await prisma.gameNews.findMany({
      where: { publishedAt: { lte: new Date() } },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      take: Math.max(1, Math.min(limit, 100)),
      select: {
        id: true,
        title: true,
        body: true,
        isPinned: true,
        publishedAt: true,
        createdBy: { select: { username: true } },
        round: { select: { slug: true, name: true } },
      },
    });
    return {
      generatedAt: new Date().toISOString(),
      news: rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        isPinned: row.isPinned,
        publishedAt: row.publishedAt.toISOString(),
        authorName: row.createdBy?.username ?? null,
        round: row.round,
      })),
    };
  },

  async newsArticle(prisma: PrismaClient, id: string): Promise<PublicNewsArticleDto | null> {
    const row = await prisma.gameNews.findFirst({
      where: { id, publishedAt: { lte: new Date() } },
      select: {
        id: true,
        title: true,
        body: true,
        isPinned: true,
        publishedAt: true,
        createdBy: { select: { username: true } },
        round: { select: { slug: true, name: true } },
      },
    });
    return row ? {
      id: row.id,
      title: row.title,
      body: row.body,
      isPinned: row.isPinned,
      publishedAt: row.publishedAt.toISOString(),
      authorName: row.createdBy?.username ?? null,
      round: row.round,
    } : null;
  },

  async search(prisma: PrismaClient, rawQuery: string): Promise<PublicSearchDto> {
    const query = rawQuery.trim().slice(0, 80);
    if (query.length < 2) return { query, results: [] };
    const { round } = await current(prisma);

    const [players, alliances, games, news, cities] = await Promise.all([
      round ? prisma.roundPlayer.findMany({
        where: { roundId: round.id, account: { isActive: true }, displayName: { contains: query, mode: 'insensitive' } },
        take: 5,
        orderBy: { netWorthCents: 'desc' },
        select: { publicPimpId: true, displayName: true, city: { select: { name: true } } },
      }) : [],
      round ? prisma.alliance.findMany({
        where: {
          roundId: round.id,
          disbandedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { tag: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { name: true, tag: true },
      }) : [],
      prisma.round.findMany({
        where: {
          status: { in: ['ENDED', 'ARCHIVED'] },
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 5,
        orderBy: { endsAt: 'desc' },
        select: { name: true, slug: true, endsAt: true },
      }),
      prisma.gameNews.findMany({
        where: { publishedAt: { lte: new Date() }, title: { contains: query, mode: 'insensitive' } },
        take: 5,
        orderBy: { publishedAt: 'desc' },
        select: { id: true, title: true, publishedAt: true },
      }),
      prisma.city.findMany({
        where: { isEnabled: true, name: { contains: query, mode: 'insensitive' } },
        take: 5,
        select: { slug: true, name: true },
      }),
    ]);

    const results: PublicSearchResultDto[] = [
      ...players.map((row) => ({ kind: 'player' as const, title: row.displayName, subtitle: `#${row.publicPimpId} · ${row.city.name}`, href: `/players/${row.publicPimpId}` })),
      ...alliances.map((row) => ({ kind: 'alliance' as const, title: `[${row.tag}] ${row.name}`, subtitle: 'Current alliance', href: `/alliances/${encodeURIComponent(row.tag)}` })),
      ...games.map((row) => ({ kind: 'game' as const, title: row.name, subtitle: `Ended ${row.endsAt.toISOString().slice(0, 10)}`, href: `/games/${row.slug}` })),
      ...news.map((row) => ({ kind: 'news' as const, title: row.title, subtitle: row.publishedAt.toISOString().slice(0, 10), href: `/news/${row.id}` })),
      ...cities.map((row) => ({ kind: 'city' as const, title: row.name, subtitle: 'City', href: `/cities/${row.slug}` })),
    ];

    return { query, results: results.slice(0, 20) };
  },

  async status(prisma: PrismaClient): Promise<PublicStatusDto> {
    await prisma.$queryRaw`SELECT 1`;
    const { round } = await current(prisma);
    return {
      generatedAt: new Date().toISOString(),
      api: 'operational',
      database: 'operational',
      currentRound: round ? { name: round.name, status: round.status } : null,
    };
  },
};
