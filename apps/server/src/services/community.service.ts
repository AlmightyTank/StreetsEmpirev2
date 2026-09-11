import type { City, PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type {
  PublicAwardDto,
  PublicLegacyDto,
  PublicPlayerProfileDto,
  RankingEntryDto,
  RankingsDto,
} from '@streets/shared';
import { toCityDto } from '../game/dto.js';
import { AppError } from '../utils/errors.js';

interface RankingRow {
  id: string;
  accountId: string;
  publicPimpId: number;
  displayName: string;
  netWorthCents: bigint;
  city: City;
  localRank: number | null;
  nationalRank: number | null;
  localRankSinceAt: Date;
  nationalRankSinceAt: Date;
  dailyStartingLocalRank: number | null;
  dailyStartingNationalRank: number | null;
  shotgunUnlocked: boolean;
  tek9Unlocked: boolean;
  ak47Unlocked: boolean;
}

interface PublicContext {
  legacy: PublicLegacyDto;
  raidAttackWins: number;
  raidDefenseWins: number;
  reconRuns: number;
}

const emptyLegacy = (): PublicLegacyDto => ({
  roundsPlayed: 0,
  roundWins: 0,
  bestNationalRank: null,
  totalFinalNetWorthCents: 0,
});

function movement(startingRank: number | null, currentRank: number): number | null {
  if (startingRank === null) return null;
  return startingRank - currentRank;
}

function rankHeldSince(row: RankingRow, rank: number, scope: 'local' | 'national', now: Date): Date {
  const storedRank = scope === 'local' ? row.localRank : row.nationalRank;
  const storedSince = scope === 'local' ? row.localRankSinceAt : row.nationalRankSinceAt;
  return storedRank === rank ? storedSince : now;
}

function awardsFor(row: RankingRow, rank: { local: number; national: number }, context: PublicContext): PublicAwardDto[] {
  const awards: PublicAwardDto[] = [];
  const add = (key: string, title: string, description: string) => awards.push({ key, title, description });

  if (rank.national === 1) add('national-number-one', 'National #1', 'Currently holds the top national rank.');
  if (rank.local === 1) add('city-boss', 'City Boss', `Currently holds the top spot in ${row.city.name}.`);
  if (context.legacy.roundWins > 0) add('past-winner', 'Past Winner', 'Finished a previous round at #1.');
  if (context.raidAttackWins > 0) add('first-blood', 'First Blood', 'Won at least one raid as the attacker.');
  if (context.raidDefenseWins > 0) add('held-the-line', 'Held the Line', 'Won at least one automatic defense.');
  if (context.reconRuns > 0) add('street-intel', 'Street Intel', 'Has paid for recon this round.');
  if (row.ak47Unlocked) add('heavy-metal', 'Heavy Metal', 'Unlocked AK-47 access through trader reputation.');
  else if (row.tek9Unlocked) add('tek-runner', 'Tek Runner', 'Unlocked Tek-9 access through trader reputation.');
  else if (row.shotgunUnlocked) add('shotgun-trust', 'Shotgun Trust', 'Unlocked shotgun access through trader reputation.');
  if (Number(row.netWorthCents) >= 100_000_000) add('millionaire', 'Millionaire', 'Built a seven-figure public net worth.');

  return awards;
}

async function loadPublicContexts(
  prisma: PrismaClient,
  currentRoundId: string,
  rows: Array<Pick<RankingRow, 'id' | 'accountId'>>,
): Promise<Map<string, PublicContext>> {
  const contexts = new Map<string, PublicContext>();
  const ids = [...new Set(rows.map((row) => row.id))];
  const accountIds = [...new Set(rows.map((row) => row.accountId))];
  for (const id of ids) contexts.set(id, { legacy: emptyLegacy(), raidAttackWins: 0, raidDefenseWins: 0, reconRuns: 0 });
  if (!ids.length) return contexts;

  const [pastRows, battles, reconGroups] = await Promise.all([
    prisma.roundPlayer.findMany({
      where: { accountId: { in: accountIds }, roundId: { not: currentRoundId }, round: { status: { in: ['ENDED', 'ARCHIVED'] } } },
      select: { accountId: true, nationalRank: true, netWorthCents: true },
    }),
    prisma.raidBattle.findMany({
      where: { OR: [{ attackerId: { in: ids } }, { defenderId: { in: ids } }] },
      select: { attackerId: true, defenderId: true, attackerReport: true, defenderReport: true },
    }),
    prisma.playerActivity.groupBy({
      by: ['roundPlayerId'],
      where: { roundPlayerId: { in: ids }, type: 'COMBAT_RECON' },
      _count: { _all: true },
    }),
  ]);

  const legacyByAccount = new Map<string, PublicLegacyDto>();
  for (const row of pastRows) {
    const legacy = legacyByAccount.get(row.accountId) ?? emptyLegacy();
    legacy.roundsPlayed += 1;
    legacy.totalFinalNetWorthCents += Number(row.netWorthCents);
    if (row.nationalRank !== null) {
      legacy.bestNationalRank = legacy.bestNationalRank === null ? row.nationalRank : Math.min(legacy.bestNationalRank, row.nationalRank);
      if (row.nationalRank === 1) legacy.roundWins += 1;
    }
    legacyByAccount.set(row.accountId, legacy);
  }

  const idToAccount = new Map(rows.map((row) => [row.id, row.accountId]));
  for (const [id, accountId] of idToAccount) {
    const context = contexts.get(id)!;
    context.legacy = legacyByAccount.get(accountId) ?? emptyLegacy();
  }

  for (const battle of battles) {
    if (contexts.has(battle.attackerId) && (battle.attackerReport as { won?: boolean }).won === true) {
      contexts.get(battle.attackerId)!.raidAttackWins += 1;
    }
    if (contexts.has(battle.defenderId) && (battle.defenderReport as { won?: boolean }).won === true) {
      contexts.get(battle.defenderId)!.raidDefenseWins += 1;
    }
  }

  for (const group of reconGroups) {
    contexts.get(group.roundPlayerId)!.reconRuns = group._count._all;
  }

  return contexts;
}

async function syncVisibleRankTenure(
  prisma: PrismaClient,
  rows: RankingRow[],
  ranked: RankingEntryDto[],
  scope: 'local' | 'national',
  now: Date,
): Promise<void> {
  const updates = rows.flatMap((row, index) => {
    const rank = ranked[index]?.rank;
    if (!rank) return [];
    const storedRank = scope === 'local' ? row.localRank : row.nationalRank;
    if (storedRank === rank) return [];
    return prisma.roundPlayer.update({
      where: { id: row.id },
      data: scope === 'local'
        ? { localRank: rank, localRankSinceAt: now }
        : { nationalRank: rank, nationalRankSinceAt: now },
    });
  });
  await Promise.all(updates);
}

/** Assign competition ranks: 1, 2, 2, 4. Rows must already be worth-descending. */
export function rankRows(
  rows: RankingRow[],
  mePublicPimpId: number,
  contexts: Map<string, PublicContext> = new Map(),
  scope: 'local' | 'national' = 'national',
  now = new Date(),
): RankingEntryDto[] {
  let previousWorth: bigint | null = null;
  let rank = 0;

  return rows.map((row, index) => {
    if (previousWorth === null || row.netWorthCents !== previousWorth) {
      rank = index + 1;
      previousWorth = row.netWorthCents;
    }

    const isYou = row.publicPimpId === mePublicPimpId;
    const context = contexts.get(row.id) ?? { legacy: emptyLegacy(), raidAttackWins: 0, raidDefenseWins: 0, reconRuns: 0 };
    const rankPair = {
      local: scope === 'local' ? rank : row.localRank ?? rank,
      national: scope === 'national' ? rank : row.nationalRank ?? rank,
    };

    return {
      rank,
      publicPimpId: row.publicPimpId,
      displayName: row.displayName,
      city: toCityDto(row.city),
      netWorthCents: Number(row.netWorthCents),
      rankHeldSinceAt: rankHeldSince(row, rank, scope, now).toISOString(),
      rankMovement: movement(scope === 'local' ? row.dailyStartingLocalRank : row.dailyStartingNationalRank, rank),
      legacy: context.legacy,
      awards: awardsFor(row, rankPair, context).slice(0, 3),
      isYou,
      intelRequired: false,
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
    _ruleset: Ruleset,
  ): Promise<RankingsDto> {
    const now = new Date();
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

    const allRows = [...nationalRows, ...localRows].filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index);
    const contexts = await loadPublicContexts(prisma, player.roundId, allRows);
    const national = rankRows(nationalRows, player.publicPimpId, contexts, 'national', now);
    const local = rankRows(localRows, player.publicPimpId, contexts, 'local', now);
    await Promise.all([
      syncVisibleRankTenure(prisma, nationalRows, national, 'national', now),
      syncVisibleRankTenure(prisma, localRows, local, 'local', now),
    ]);

    return {
      national,
      local,
      localCity: toCityDto(player.city),
      me: {
        publicPimpId: player.publicPimpId,
        localRank: local.find((row) => row.isYou)?.rank ?? player.localRank ?? 1,
        nationalRank: national.find((row) => row.isYou)?.rank ?? player.nationalRank ?? 1,
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

    const localRank = localAhead + 1;
    const nationalRank = nationalAhead + 1;
    const now = new Date();
    const isYou = player.publicPimpId === viewerPublicPimpId;
    const privacy = ruleset.communityPrivacy;
    const hideCrew = Boolean(privacy?.hideOpponentCrew && !isYou);
    const hideWeapons = Boolean(privacy?.hideOpponentWeapons && !isYou);
    const weapons = player.pistols + player.shotguns + player.tek9s + player.ak47s;
    const context = (await loadPublicContexts(prisma, roundId, [player])).get(player.id) ?? { legacy: emptyLegacy(), raidAttackWins: 0, raidDefenseWins: 0, reconRuns: 0 };

    return {
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      city: toCityDto(player.city),
      netWorthCents: Number(player.netWorthCents),
      rank: {
        local: localRank,
        national: nationalRank,
        localHeldSinceAt: rankHeldSince(player, localRank, 'local', now).toISOString(),
        nationalHeldSinceAt: rankHeldSince(player, nationalRank, 'national', now).toISOString(),
        localMovement: movement(player.dailyStartingLocalRank, localRank),
        nationalMovement: movement(player.dailyStartingNationalRank, nationalRank),
      },
      legacy: context.legacy,
      awards: awardsFor(player, { local: localRank, national: nationalRank }, context),
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
      intelRequired: hideCrew || hideWeapons,
      joinedAt: player.createdAt.toISOString(),
      lastActiveAt: player.lastActiveAt.toISOString(),
      isYou,
    };
  },
};
