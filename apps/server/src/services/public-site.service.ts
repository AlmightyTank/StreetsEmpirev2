import type { PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type {
  PublicAllianceSeasonStandingDto,
  PublicCompletedGameStatsDto,
  PublicCurrentGameDto,
  PublicGameArchiveEntryDto,
  PublicGameDetailDto,
  PublicGamesArchiveDto,
  PublicOverviewDto,
  PublicRankingEntryDto,
  PublicSeasonStandingDto,
  PublicTurfEventDto,
} from '@streets/shared';
import { toRoundDto } from '../game/dto.js';
import { RoundService } from './round.service.js';

const TOP_RANKINGS = 5;
const RECENT_EVENTS = 6;
const RECENT_NEWS = 3;
const ARCHIVE_LIMIT = 50;

type HistoricalPlayerRow = {
  publicPimpId: number;
  displayName: string;
  netWorthCents: bigint;
  nationalRank: number | null;
  localRank: number | null;
  city: { slug: string; name: string };
  alliance: { name: string; tag: string } | null;
};

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

function historicalStanding(row: HistoricalPlayerRow): PublicSeasonStandingDto | null {
  if (row.nationalRank === null) return null;
  return {
    nationalRank: row.nationalRank,
    localRank: row.localRank,
    publicPimpId: row.publicPimpId,
    displayName: row.displayName,
    netWorthCents: Number(row.netWorthCents),
    city: row.city,
    alliance: row.alliance,
  };
}

async function historicalStats(
  prisma: PrismaClient,
  round: Round,
): Promise<PublicCompletedGameStatsDto> {
  const ruleset = loadRulesetForRound(round);

  const [
    players,
    alliances,
    economy,
    combatBattles,
    driveBys,
    travelRuns,
    turfBattles,
    turfCaptures,
    turfBlocksHeldAtEnd,
    playerCities,
  ] = await Promise.all([
    prisma.roundPlayer.count({ where: { roundId: round.id } }),
    prisma.alliance.count({
      where: {
        roundId: round.id,
        disbandedAt: null,
        members: { some: { account: { isActive: true } } },
      },
    }),
    prisma.roundPlayer.aggregate({
      where: { roundId: round.id },
      _sum: { netWorthCents: true },
    }),
    prisma.raidBattle.count({
      where: { attacker: { roundId: round.id }, voidedAt: null },
    }),
    prisma.raidBattle.count({
      where: { attacker: { roundId: round.id }, kind: 'DRIVE_BY', voidedAt: null },
    }),
    prisma.run.count({
      where: { roundPlayer: { roundId: round.id }, status: 'RETURNED' },
    }),
    prisma.turfPush.count({
      where: { roundId: round.id, status: 'LANDED' },
    }),
    prisma.turfPush.count({
      where: { roundId: round.id, status: 'LANDED', captured: true },
    }),
    prisma.turf.count({
      where: { roundId: round.id, holderId: { not: null } },
    }),
    prisma.roundPlayer.findMany({
      where: { roundId: round.id },
      distinct: ['cityId'],
      select: { cityId: true },
    }),
  ]);

  return {
    players,
    alliances,
    cities: ruleset.cities ? Object.keys(ruleset.cities).length : playerCities.length,
    economyNetWorthCents: Number(economy._sum.netWorthCents ?? 0n),
    combatBattles,
    driveBys,
    travelRuns,
    turfBattles,
    turfCaptures,
    turfBlocksHeldAtEnd,
  };
}

async function championRows(
  prisma: PrismaClient,
  roundId: string,
): Promise<PublicSeasonStandingDto[]> {
  const rows = await prisma.roundPlayer.findMany({
    where: {
      roundId,
      nationalRank: 1,
      account: { isActive: true },
    },
    orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
    select: {
      publicPimpId: true,
      displayName: true,
      netWorthCents: true,
      nationalRank: true,
      localRank: true,
      city: { select: { slug: true, name: true } },
      alliance: { select: { name: true, tag: true } },
    },
  });

  return rows.flatMap((row) => {
    const standing = historicalStanding(row);
    return standing ? [standing] : [];
  });
}

function allianceStandings(rows: HistoricalPlayerRow[]): PublicAllianceSeasonStandingDto[] {
  const byTag = new Map<string, {
    name: string;
    tag: string;
    combinedNetWorthCents: bigint;
    memberCount: number;
  }>();

  for (const row of rows) {
    if (!row.alliance) continue;
    const current = byTag.get(row.alliance.tag) ?? {
      name: row.alliance.name,
      tag: row.alliance.tag,
      combinedNetWorthCents: 0n,
      memberCount: 0,
    };
    current.combinedNetWorthCents += row.netWorthCents;
    current.memberCount += 1;
    byTag.set(row.alliance.tag, current);
  }

  const ordered = [...byTag.values()].sort((a, b) => {
    if (a.combinedNetWorthCents === b.combinedNetWorthCents) return a.tag.localeCompare(b.tag);
    return a.combinedNetWorthCents > b.combinedNetWorthCents ? -1 : 1;
  });

  let previousWorth: bigint | null = null;
  let previousRank = 0;

  return ordered.map((row, index) => {
    const rank = previousWorth !== null && row.combinedNetWorthCents === previousWorth
      ? previousRank
      : index + 1;
    previousWorth = row.combinedNetWorthCents;
    previousRank = rank;
    return {
      rank,
      name: row.name,
      tag: row.tag,
      combinedNetWorthCents: Number(row.combinedNetWorthCents),
      memberCount: row.memberCount,
    };
  });
}

function cityResults(rows: HistoricalPlayerRow[]): PublicGameDetailDto['cityResults'] {
  const grouped = new Map<string, {
    city: { slug: string; name: string };
    playerCount: number;
    economyNetWorthCents: bigint;
    champions: PublicSeasonStandingDto[];
  }>();

  for (const row of rows) {
    const current = grouped.get(row.city.slug) ?? {
      city: row.city,
      playerCount: 0,
      economyNetWorthCents: 0n,
      champions: [],
    };
    current.playerCount += 1;
    current.economyNetWorthCents += row.netWorthCents;
    const standing = historicalStanding(row);
    if (standing && row.localRank === 1) current.champions.push(standing);
    grouped.set(row.city.slug, current);
  }

  return [...grouped.values()]
    .sort((a, b) => a.city.name.localeCompare(b.city.name))
    .map((row) => ({
      city: row.city,
      playerCount: row.playerCount,
      economyNetWorthCents: Number(row.economyNetWorthCents),
      champions: row.champions.sort((a, b) => a.publicPimpId - b.publicPimpId),
    }));
}

async function archiveEntry(
  prisma: PrismaClient,
  round: Round,
): Promise<PublicGameArchiveEntryDto> {
  const ruleset = loadRulesetForRound(round);
  const [champions, stats] = await Promise.all([
    championRows(prisma, round.id),
    historicalStats(prisma, round),
  ]);

  return {
    id: round.id,
    slug: round.slug,
    name: round.name,
    status: round.status as 'ENDED' | 'ARCHIVED',
    ruleset: {
      id: ruleset.meta.id,
      version: ruleset.meta.version,
      name: ruleset.meta.name,
    },
    startsAt: round.startsAt.toISOString(),
    endedAt: round.endsAt.toISOString(),
    playerCount: stats.players,
    champions,
    stats,
  };
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
        cities: ruleset.cities ? Object.keys(ruleset.cities).length : cityCount,
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

  async games(prisma: PrismaClient): Promise<PublicGamesArchiveDto> {
    // Resolve/close the current round first so a season that just expired is
    // immediately eligible for the archive query below.
    const current = await RoundService.getCurrent(prisma);
    const rounds = await prisma.round.findMany({
      where: { status: { in: ['ENDED', 'ARCHIVED'] } },
      orderBy: [{ endsAt: 'desc' }, { startsAt: 'desc' }],
      take: ARCHIVE_LIMIT,
    });

    const currentRound = current
      ? toRoundDto(current, await RoundService.playerCount(prisma, current.id))
      : null;

    if (!rounds.length) {
      return {
        generatedAt: new Date().toISOString(),
        currentRound,
        games: [],
      };
    }

    const roundIds = rounds.map((round) => round.id);
    const playerRefs = await prisma.roundPlayer.findMany({
      where: { roundId: { in: roundIds } },
      select: { id: true, roundId: true },
    });
    const playerIds = playerRefs.map((player) => player.id);
    const roundByPlayer = new Map(playerRefs.map((player) => [player.id, player.roundId]));

    const [
      playerAgg,
      allianceAgg,
      turfAgg,
      heldAgg,
      championRowsAll,
      battleAgg,
      runAgg,
    ] = await Promise.all([
      prisma.roundPlayer.groupBy({
        by: ['roundId'],
        where: { roundId: { in: roundIds } },
        _count: { _all: true },
        _sum: { netWorthCents: true },
      }),
      prisma.alliance.groupBy({
        by: ['roundId'],
        where: { roundId: { in: roundIds }, disbandedAt: null },
        _count: { _all: true },
      }),
      prisma.turfPush.groupBy({
        by: ['roundId', 'captured'],
        where: { roundId: { in: roundIds }, status: 'LANDED' },
        _count: { _all: true },
      }),
      prisma.turf.groupBy({
        by: ['roundId'],
        where: { roundId: { in: roundIds }, holderId: { not: null } },
        _count: { _all: true },
      }),
      prisma.roundPlayer.findMany({
        where: {
          roundId: { in: roundIds },
          nationalRank: 1,
          account: { isActive: true },
        },
        orderBy: [{ roundId: 'asc' }, { netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        select: {
          roundId: true,
          publicPimpId: true,
          displayName: true,
          netWorthCents: true,
          nationalRank: true,
          localRank: true,
          city: { select: { slug: true, name: true } },
          alliance: { select: { name: true, tag: true } },
        },
      }),
      playerIds.length
        ? prisma.raidBattle.groupBy({
            by: ['attackerId', 'kind'],
            where: { attackerId: { in: playerIds }, voidedAt: null },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      playerIds.length
        ? prisma.run.groupBy({
            by: ['roundPlayerId'],
            where: { roundPlayerId: { in: playerIds }, status: 'RETURNED' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const playersByRound = new Map(playerAgg.map((row) => [row.roundId, row]));
    const alliancesByRound = new Map(allianceAgg.map((row) => [row.roundId, row._count._all]));
    const heldByRound = new Map(heldAgg.map((row) => [row.roundId, row._count._all]));

    const turfByRound = new Map<string, { battles: number; captures: number }>();
    for (const row of turfAgg) {
      const currentTurf = turfByRound.get(row.roundId) ?? { battles: 0, captures: 0 };
      currentTurf.battles += row._count._all;
      if (row.captured) currentTurf.captures += row._count._all;
      turfByRound.set(row.roundId, currentTurf);
    }

    const combatByRound = new Map<string, { battles: number; driveBys: number }>();
    for (const row of battleAgg) {
      const roundId = roundByPlayer.get(row.attackerId);
      if (!roundId) continue;
      const currentCombat = combatByRound.get(roundId) ?? { battles: 0, driveBys: 0 };
      currentCombat.battles += row._count._all;
      if (row.kind === 'DRIVE_BY') currentCombat.driveBys += row._count._all;
      combatByRound.set(roundId, currentCombat);
    }

    const runsByRound = new Map<string, number>();
    for (const row of runAgg) {
      const roundId = roundByPlayer.get(row.roundPlayerId);
      if (!roundId) continue;
      runsByRound.set(roundId, (runsByRound.get(roundId) ?? 0) + row._count._all);
    }

    const championsByRound = new Map<string, PublicSeasonStandingDto[]>();
    for (const row of championRowsAll) {
      const standing = historicalStanding(row);
      if (!standing) continue;
      championsByRound.set(row.roundId, [...(championsByRound.get(row.roundId) ?? []), standing]);
    }

    const games: PublicGameArchiveEntryDto[] = rounds.map((round) => {
      const ruleset = loadRulesetForRound(round);
      const player = playersByRound.get(round.id);
      const turf = turfByRound.get(round.id) ?? { battles: 0, captures: 0 };
      const combat = combatByRound.get(round.id) ?? { battles: 0, driveBys: 0 };
      const stats: PublicCompletedGameStatsDto = {
        players: player?._count._all ?? 0,
        alliances: alliancesByRound.get(round.id) ?? 0,
        cities: ruleset.cities ? Object.keys(ruleset.cities).length : 0,
        economyNetWorthCents: Number(player?._sum.netWorthCents ?? 0n),
        combatBattles: combat.battles,
        driveBys: combat.driveBys,
        travelRuns: runsByRound.get(round.id) ?? 0,
        turfBattles: turf.battles,
        turfCaptures: turf.captures,
        turfBlocksHeldAtEnd: heldByRound.get(round.id) ?? 0,
      };

      return {
        id: round.id,
        slug: round.slug,
        name: round.name,
        status: round.status as 'ENDED' | 'ARCHIVED',
        ruleset: {
          id: ruleset.meta.id,
          version: ruleset.meta.version,
          name: ruleset.meta.name,
        },
        startsAt: round.startsAt.toISOString(),
        endedAt: round.endsAt.toISOString(),
        playerCount: stats.players,
        champions: championsByRound.get(round.id) ?? [],
        stats,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      currentRound,
      games,
    };
  },

  async completedGame(prisma: PrismaClient, gameId: string): Promise<PublicGameDetailDto | null> {
    const round = await prisma.round.findFirst({
      where: {
        status: { in: ['ENDED', 'ARCHIVED'] },
        OR: [{ id: gameId }, { slug: gameId }],
      },
    });
    if (!round) return null;

    const playerRows = await prisma.roundPlayer.findMany({
      where: {
        roundId: round.id,
        account: { isActive: true },
      },
      orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
      select: {
        publicPimpId: true,
        displayName: true,
        netWorthCents: true,
        nationalRank: true,
        localRank: true,
        city: { select: { slug: true, name: true } },
        alliance: { select: { name: true, tag: true } },
      },
    });

    const base = await archiveEntry(prisma, round);
    const standings = playerRows.flatMap((row) => {
      const standing = historicalStanding(row);
      return standing ? [standing] : [];
    });

    return {
      ...base,
      champions: standings.filter((row) => row.nationalRank === 1),
      podium: standings.filter((row) => row.nationalRank <= 3),
      standings,
      allianceStandings: allianceStandings(playerRows),
      cityResults: cityResults(playerRows),
    };
  },
};
