import type { City, PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type {
  PublicAchievementCategory,
  PublicAchievementRarity,
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
  createdAt: Date;
}

interface PublicContext {
  legacy: PublicLegacyDto;
  raidAttacks: number;
  raidAttackWins: number;
  raidDefenses: number;
  firstRaidAt: Date | null;
  raidDefenseWins: number;
  firstDefenseAt: Date | null;
  reconRuns: number;
  questsCompleted: number;
  firstRaidWinAt: Date | null;
  firstDefenseWinAt: Date | null;
  firstReconAt: Date | null;
  firstQuestAt: Date | null;
}

const emptyLegacy = (): PublicLegacyDto => ({
  roundsPlayed: 0,
  roundWins: 0,
  bestNationalRank: null,
  totalFinalNetWorthCents: 0,
});

const emptyContext = (): PublicContext => ({
  legacy: emptyLegacy(),
  raidAttacks: 0,
  raidAttackWins: 0,
  raidDefenses: 0,
  firstRaidAt: null,
  raidDefenseWins: 0,
  firstDefenseAt: null,
  reconRuns: 0,
  questsCompleted: 0,
  firstRaidWinAt: null,
  firstDefenseWinAt: null,
  firstReconAt: null,
  firstQuestAt: null,
});

function earliest(a: Date | null, b: Date): Date {
  return a && a.getTime() < b.getTime() ? a : b;
}

function movement(startingRank: number | null, currentRank: number): number | null {
  if (startingRank === null) return null;
  return startingRank - currentRank;
}

function rankHeldSince(row: RankingRow, rank: number, scope: 'local' | 'national', now: Date): Date {
  const storedRank = scope === 'local' ? row.localRank : row.nationalRank;
  const storedSince = scope === 'local' ? row.localRankSinceAt : row.nationalRankSinceAt;
  return storedRank === rank ? storedSince : now;
}

function progress(current: number, target: number, label: string): PublicAwardDto['progress'] {
  return { current: Math.max(0, current), target, label };
}

function achievement(input: {
  key: string;
  title: string;
  description: string;
  category: PublicAchievementCategory;
  rarity: PublicAchievementRarity;
  current: number;
  target: number;
  progressLabel: string;
  earnedAt?: Date | null;
}): PublicAwardDto {
  const unlocked = input.current >= input.target;
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    category: input.category,
    rarity: input.rarity,
    unlocked,
    earnedAt: unlocked && input.earnedAt ? input.earnedAt.toISOString() : null,
    progress: progress(input.current, input.target, input.progressLabel),
  };
}

function achievementsFor(row: RankingRow, rank: { local: number; national: number }, context: PublicContext): PublicAwardDto[] {
  const netWorth = Number(row.netWorthCents);
  const localMovement = movement(row.dailyStartingLocalRank, rank.local) ?? 0;
  const nationalMovement = movement(row.dailyStartingNationalRank, rank.national) ?? 0;
  const bestMovement = Math.max(localMovement, nationalMovement, 0);
  const localHeldAt = rankHeldSince(row, rank.local, 'local', new Date());
  const nationalHeldAt = rankHeldSince(row, rank.national, 'national', new Date());

  return [
    achievement({ key: 'national-number-one', title: 'National #1', description: 'Hold the top national rank.', category: 'rank', rarity: 'legendary', current: rank.national === 1 ? 1 : 0, target: 1, progressLabel: 'rank #1', earnedAt: nationalHeldAt }),
    achievement({ key: 'city-boss', title: 'City Boss', description: `Hold the top spot in ${row.city.name}.`, category: 'rank', rarity: 'epic', current: rank.local === 1 ? 1 : 0, target: 1, progressLabel: 'rank #1', earnedAt: localHeldAt }),
    achievement({ key: 'top-ten', title: 'Top Ten', description: 'Reach the national top ten.', category: 'rank', rarity: 'rare', current: rank.national <= 10 ? 10 : Math.max(0, 11 - rank.national), target: 10, progressLabel: 'top-ten standing', earnedAt: rank.national <= 10 ? nationalHeldAt : null }),
    achievement({ key: 'climber', title: 'Climber', description: 'Move up at least five ranks in one day.', category: 'rank', rarity: 'uncommon', current: bestMovement, target: 5, progressLabel: 'ranks gained today' }),

    achievement({ key: 'first-stack', title: 'First Stack', description: 'Reach $25,000 public net worth.', category: 'wealth', rarity: 'common', current: netWorth, target: 25_000_00, progressLabel: 'net worth', earnedAt: row.createdAt }),
    achievement({ key: 'six-figures', title: 'Six Figures', description: 'Reach $100,000 public net worth.', category: 'wealth', rarity: 'uncommon', current: netWorth, target: 100_000_00, progressLabel: 'net worth' }),
    achievement({ key: 'quarter-million', title: 'Big Fish', description: 'Reach $250,000 public net worth.', category: 'wealth', rarity: 'rare', current: netWorth, target: 250_000_00, progressLabel: 'net worth' }),
    achievement({ key: 'millionaire', title: 'Millionaire', description: 'Reach $1,000,000 public net worth.', category: 'wealth', rarity: 'epic', current: netWorth, target: 1_000_000_00, progressLabel: 'net worth' }),
    achievement({ key: 'empire-builder', title: 'Empire Builder', description: 'Reach $5,000,000 public net worth.', category: 'wealth', rarity: 'legendary', current: netWorth, target: 5_000_000_00, progressLabel: 'net worth' }),

    achievement({ key: 'knock-knock', title: 'Knock Knock', description: 'Launch a raid against another player.', category: 'combat', rarity: 'common', current: context.raidAttacks, target: 1, progressLabel: 'raid attempts', earnedAt: context.firstRaidAt }),
    achievement({ key: 'first-blood', title: 'First Blood', description: 'Win a raid as the attacker.', category: 'combat', rarity: 'common', current: context.raidAttackWins, target: 1, progressLabel: 'raid attack wins', earnedAt: context.firstRaidWinAt }),
    achievement({ key: 'enforcer', title: 'Enforcer', description: 'Win five raids as the attacker.', category: 'combat', rarity: 'uncommon', current: context.raidAttackWins, target: 5, progressLabel: 'raid attack wins', earnedAt: context.firstRaidWinAt }),
    achievement({ key: 'warpath', title: 'Warpath', description: 'Win twenty-five raids as the attacker.', category: 'combat', rarity: 'epic', current: context.raidAttackWins, target: 25, progressLabel: 'raid attack wins', earnedAt: context.firstRaidWinAt }),
    achievement({ key: 'made-enemies', title: 'Made Enemies', description: 'Get raided by another player.', category: 'combat', rarity: 'common', current: context.raidDefenses, target: 1, progressLabel: 'incoming raids', earnedAt: context.firstDefenseAt }),
    achievement({ key: 'held-the-line', title: 'Held the Line', description: 'Win an automatic defense.', category: 'combat', rarity: 'common', current: context.raidDefenseWins, target: 1, progressLabel: 'defense wins', earnedAt: context.firstDefenseWinAt }),
    achievement({ key: 'untouchable', title: 'Untouchable', description: 'Win five automatic defenses.', category: 'combat', rarity: 'rare', current: context.raidDefenseWins, target: 5, progressLabel: 'defense wins', earnedAt: context.firstDefenseWinAt }),

    achievement({ key: 'street-intel', title: 'Street Intel', description: 'Run recon on a target.', category: 'intel', rarity: 'common', current: context.reconRuns, target: 1, progressLabel: 'recon runs', earnedAt: context.firstReconAt }),
    achievement({ key: 'wire-tapper', title: 'Wire Tapper', description: 'Run five recon jobs in one round.', category: 'intel', rarity: 'uncommon', current: context.reconRuns, target: 5, progressLabel: 'recon runs', earnedAt: context.firstReconAt }),
    achievement({ key: 'eyes-everywhere', title: 'Eyes Everywhere', description: 'Run fifteen recon jobs in one round.', category: 'intel', rarity: 'rare', current: context.reconRuns, target: 15, progressLabel: 'recon runs', earnedAt: context.firstReconAt }),

    achievement({ key: 'favor-done', title: 'Favor Done', description: 'Complete one trader favor.', category: 'reputation', rarity: 'common', current: context.questsCompleted, target: 1, progressLabel: 'trader favors', earnedAt: context.firstQuestAt }),
    achievement({ key: 'connected', title: 'Connected', description: 'Complete all trader favors.', category: 'reputation', rarity: 'rare', current: context.questsCompleted, target: 4, progressLabel: 'trader favors', earnedAt: context.firstQuestAt }),
    achievement({ key: 'shotgun-trust', title: 'Shotgun Trust', description: 'Unlock shotgun purchases through trader reputation.', category: 'reputation', rarity: 'uncommon', current: row.shotgunUnlocked ? 1 : 0, target: 1, progressLabel: 'unlock' }),
    achievement({ key: 'tek-runner', title: 'Tek Runner', description: 'Unlock Tek-9 purchases through trader reputation.', category: 'reputation', rarity: 'rare', current: row.tek9Unlocked ? 1 : 0, target: 1, progressLabel: 'unlock' }),
    achievement({ key: 'heavy-metal', title: 'Heavy Metal', description: 'Unlock AK-47 purchases through trader reputation.', category: 'reputation', rarity: 'epic', current: row.ak47Unlocked ? 1 : 0, target: 1, progressLabel: 'unlock' }),

    achievement({ key: 'veteran', title: 'Veteran', description: 'Finish at least one previous round.', category: 'legacy', rarity: 'common', current: context.legacy.roundsPlayed, target: 1, progressLabel: 'past rounds' }),
    achievement({ key: 'past-winner', title: 'Past Winner', description: 'Finish a previous round at national #1.', category: 'legacy', rarity: 'legendary', current: context.legacy.roundWins, target: 1, progressLabel: 'past round wins' }),
    achievement({ key: 'hall-of-fame', title: 'Hall of Fame', description: 'Win three previous rounds.', category: 'legacy', rarity: 'legendary', current: context.legacy.roundWins, target: 3, progressLabel: 'past round wins' }),
    achievement({ key: 'top-finisher', title: 'Top Finisher', description: 'Finish a previous round in the national top ten.', category: 'legacy', rarity: 'rare', current: context.legacy.bestNationalRank !== null && context.legacy.bestNationalRank <= 10 ? 1 : 0, target: 1, progressLabel: 'top-ten finish' }),
  ];
}

async function loadPublicContexts(
  prisma: PrismaClient,
  currentRoundId: string,
  rows: Array<Pick<RankingRow, 'id' | 'accountId'>>,
): Promise<Map<string, PublicContext>> {
  const contexts = new Map<string, PublicContext>();
  const ids = [...new Set(rows.map((row) => row.id))];
  const accountIds = [...new Set(rows.map((row) => row.accountId))];
  for (const id of ids) contexts.set(id, emptyContext());
  if (!ids.length) return contexts;

  const [pastRows, battles, reconActivities, reputationRows] = await Promise.all([
    prisma.roundPlayer.findMany({
      where: { accountId: { in: accountIds }, roundId: { not: currentRoundId }, round: { status: { in: ['ENDED', 'ARCHIVED'] } } },
      select: { accountId: true, nationalRank: true, netWorthCents: true },
    }),
    prisma.raidBattle.findMany({
      // Raid achievements count raids; a drive-by is not a raid attempt.
      where: { kind: 'RAID', OR: [{ attackerId: { in: ids } }, { defenderId: { in: ids } }] },
      select: { attackerId: true, defenderId: true, attackerReport: true, defenderReport: true, createdAt: true },
    }),
    prisma.playerActivity.findMany({
      where: { roundPlayerId: { in: ids }, type: 'COMBAT_RECON' },
      select: { roundPlayerId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.playerReputation.findMany({
      where: { roundPlayerId: { in: ids }, questDoneAt: { not: null } },
      select: { roundPlayerId: true, questDoneAt: true },
      orderBy: { questDoneAt: 'asc' },
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
    contexts.get(id)!.legacy = legacyByAccount.get(accountId) ?? emptyLegacy();
  }

  for (const battle of battles) {
    if (contexts.has(battle.attackerId)) {
      const context = contexts.get(battle.attackerId)!;
      context.raidAttacks += 1;
      context.firstRaidAt = earliest(context.firstRaidAt, battle.createdAt);
      if ((battle.attackerReport as { won?: boolean }).won === true) {
        context.raidAttackWins += 1;
        context.firstRaidWinAt = earliest(context.firstRaidWinAt, battle.createdAt);
      }
    }
    if (contexts.has(battle.defenderId)) {
      const context = contexts.get(battle.defenderId)!;
      context.raidDefenses += 1;
      context.firstDefenseAt = earliest(context.firstDefenseAt, battle.createdAt);
      if ((battle.defenderReport as { won?: boolean }).won === true) {
        context.raidDefenseWins += 1;
        context.firstDefenseWinAt = earliest(context.firstDefenseWinAt, battle.createdAt);
      }
    }
  }

  for (const activity of reconActivities) {
    const context = contexts.get(activity.roundPlayerId);
    if (!context) continue;
    context.reconRuns += 1;
    context.firstReconAt = context.firstReconAt ?? activity.createdAt;
  }

  for (const reputation of reputationRows) {
    const context = contexts.get(reputation.roundPlayerId);
    if (!context || !reputation.questDoneAt) continue;
    context.questsCompleted += 1;
    context.firstQuestAt = context.firstQuestAt ?? reputation.questDoneAt;
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
    const context = contexts.get(row.id) ?? emptyContext();
    const rankPair = {
      local: scope === 'local' ? rank : row.localRank ?? rank,
      national: scope === 'national' ? rank : row.nationalRank ?? rank,
    };
    const earned = achievementsFor(row, rankPair, context).filter((award) => award.unlocked);

    return {
      rank,
      publicPimpId: row.publicPimpId,
      displayName: row.displayName,
      city: toCityDto(row.city),
      netWorthCents: Number(row.netWorthCents),
      rankHeldSinceAt: rankHeldSince(row, rank, scope, now).toISOString(),
      rankMovement: movement(scope === 'local' ? row.dailyStartingLocalRank : row.dailyStartingNationalRank, rank),
      legacy: context.legacy,
      awards: earned.slice(0, 3),
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
    const context = (await loadPublicContexts(prisma, roundId, [player])).get(player.id) ?? emptyContext();

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
      awards: achievementsFor(player, { local: localRank, national: nationalRank }, context),
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
