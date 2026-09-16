import type { City, Prisma, PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type {
  PublicAchievementCategory,
  PublicAchievementRarity,
  PublicAwardDto,
  PublicCareerDto,
  HallOfFameDto,
  PublicLegacyDto,
  PublicPlayerProfileDto,
  PublicSeasonStatsDto,
  ProfileAccent,
  RankingEntryDto,
  RankingsDto,
} from '@streets/shared';
import { env } from '../config/env.js';
import { toCityDto, toSeasonHideoutDto } from '../game/dto.js';
import { AppError } from '../utils/errors.js';
import { allianceTagDto } from './alliance.service.js';
import { ForumGroupsService } from './forum-groups.service.js';
import { forumProfileUrl } from './forum-link.service.js';
import { selectProfileBadges } from './profile-badges.js';

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
  hideoutSafeRoomLevel: number;
  hideoutLookoutsLevel: number;
  hideoutWorkshopLevel: number;
  hideoutBackOfficeLevel: number;
  createdAt: Date;
  /** 0.3.0-C. Loaded where the ranking or profile shows a tag. */
  alliance?: { name: string; tag: string } | null;
}

interface PublicContext {
  legacy: PublicLegacyDto;
  raidAttacks: number;
  raidAttackWins: number;
  raidDefenses: number;
  driveByAttacks: number;
  driveByWins: number;
  drugRunWins: number;
  rideTheftWins: number;
  lureRunWins: number;
  whoresDrugged: number;
  lowRidersStolen: number;
  crewLured: number;
  firstRaidAt: Date | null;
  raidDefenseWins: number;
  firstDefenseAt: Date | null;
  firstDriveByAt: Date | null;
  firstDriveByWinAt: Date | null;
  firstDrugRunWinAt: Date | null;
  firstRideTheftWinAt: Date | null;
  firstLureRunWinAt: Date | null;
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
  topTenFinishes: 0,
  bestNationalRank: null,
  bestLocalRank: null,
  totalFinalNetWorthCents: 0,
});

function addPastRound(legacy: PublicLegacyDto, row: { localRank: number | null; nationalRank: number | null; netWorthCents: bigint | number }): PublicLegacyDto {
  legacy.roundsPlayed += 1;
  legacy.totalFinalNetWorthCents += Number(row.netWorthCents);
  if (row.nationalRank !== null) {
    legacy.bestNationalRank = legacy.bestNationalRank === null ? row.nationalRank : Math.min(legacy.bestNationalRank, row.nationalRank);
    if (row.nationalRank === 1) legacy.roundWins += 1;
    if (row.nationalRank <= 10) legacy.topTenFinishes += 1;
  }
  if (row.localRank !== null) {
    legacy.bestLocalRank = legacy.bestLocalRank === null ? row.localRank : Math.min(legacy.bestLocalRank, row.localRank);
  }
  return legacy;
}

/** Legacy for accounts that may not be in the current round (forum badges, Discord roles). One query. */
export async function loadLegacyByAccount(
  prisma: PrismaClient,
  accountIds: string[],
  currentRoundId: string | null,
): Promise<Map<string, PublicLegacyDto>> {
  const legacyByAccount = new Map<string, PublicLegacyDto>();
  if (!accountIds.length) return legacyByAccount;
  const rows = await prisma.roundPlayer.findMany({
    where: {
      accountId: { in: accountIds },
      ...(currentRoundId ? { roundId: { not: currentRoundId } } : {}),
      round: { status: { in: ['ENDED', 'ARCHIVED'] } },
    },
    select: { accountId: true, localRank: true, nationalRank: true, netWorthCents: true },
  });
  for (const row of rows) {
    legacyByAccount.set(row.accountId, addPastRound(legacyByAccount.get(row.accountId) ?? emptyLegacy(), row));
  }
  return legacyByAccount;
}

export async function loadAccountLegacy(
  prisma: PrismaClient,
  accountId: string,
  currentRoundId: string | null,
): Promise<PublicLegacyDto> {
  return (await loadLegacyByAccount(prisma, [accountId], currentRoundId)).get(accountId) ?? emptyLegacy();
}

const emptySeasonStats = (): PublicSeasonStatsDto => ({
  raidAttacks: 0,
  raidAttackWins: 0,
  raidDefenses: 0,
  raidDefenseWins: 0,
  driveByAttacks: 0,
  driveByWins: 0,
  reconRuns: 0,
  traderFavors: 0,
});

function addBattleToSeasonStats(
  stats: PublicSeasonStatsDto,
  battle: { attackerId: string; defenderId: string; attackerReport: unknown; defenderReport: unknown },
  playerId: string,
): void {
  const attackerReport = battle.attackerReport as { kind?: string; won?: boolean };
  const defenderReport = battle.defenderReport as { won?: boolean };
  const battleKind = attackerReport.kind ?? 'RAID';

  if (battle.attackerId === playerId) {
    if (battleKind === 'DRIVE_BY') {
      stats.driveByAttacks += 1;
      if (attackerReport.won === true) stats.driveByWins += 1;
    } else {
      stats.raidAttacks += 1;
      if (attackerReport.won === true) stats.raidAttackWins += 1;
    }
  }

  if (battle.defenderId === playerId && battleKind !== 'DRIVE_BY') {
    stats.raidDefenses += 1;
    if (defenderReport.won === true) stats.raidDefenseWins += 1;
  }
}

export async function loadCareerForAccount(
  prisma: PrismaClient,
  accountId: string,
  options: { limit?: number; currentRoundId?: string | null } = {},
): Promise<PublicCareerDto> {
  const where: Prisma.RoundPlayerWhereInput = {
    accountId,
    ...(options.currentRoundId ? { roundId: { not: options.currentRoundId } } : {}),
    round: { status: { in: ['ENDED', 'ARCHIVED'] } },
  };
  const players = await prisma.roundPlayer.findMany({
    where,
    include: { city: true, round: true },
    orderBy: { round: { endsAt: 'desc' } },
    take: options.limit,
  });

  const ids = players.map((player) => player.id);
  const statsByPlayer = new Map(ids.map((id) => [id, emptySeasonStats()]));

  if (ids.length) {
    const [battles, reconActivities, reputationRows] = await Promise.all([
      prisma.raidBattle.findMany({
        where: { OR: [{ attackerId: { in: ids } }, { defenderId: { in: ids } }], voidedAt: null },
        select: { attackerId: true, defenderId: true, attackerReport: true, defenderReport: true },
      }),
      prisma.playerActivity.groupBy({
        by: ['roundPlayerId'],
        where: { roundPlayerId: { in: ids }, type: 'COMBAT_RECON' },
        _count: { _all: true },
      }),
      prisma.playerReputation.groupBy({
        by: ['roundPlayerId'],
        where: { roundPlayerId: { in: ids }, questDoneAt: { not: null } },
        _count: { _all: true },
      }),
    ]);

    for (const battle of battles) {
      const attackerStats = statsByPlayer.get(battle.attackerId);
      if (attackerStats) addBattleToSeasonStats(attackerStats, battle, battle.attackerId);
      const defenderStats = statsByPlayer.get(battle.defenderId);
      if (defenderStats && battle.defenderId !== battle.attackerId) {
        addBattleToSeasonStats(defenderStats, battle, battle.defenderId);
      }
    }

    for (const activity of reconActivities) {
      const stats = statsByPlayer.get(activity.roundPlayerId);
      if (stats) stats.reconRuns = activity._count._all;
    }

    for (const reputation of reputationRows) {
      const stats = statsByPlayer.get(reputation.roundPlayerId);
      if (stats) stats.traderFavors = reputation._count._all;
    }
  }

  const legacyRows = options.limit === undefined
    ? players
    : await prisma.roundPlayer.findMany({
      where,
      select: { localRank: true, nationalRank: true, netWorthCents: true },
    });
  const legacy = legacyRows.reduce(
    (carry, player) => addPastRound(carry, player),
    emptyLegacy(),
  );

  return {
    legacy,
    seasons: players.map((player) => ({
      round: {
        id: player.round.id,
        name: player.round.name,
        slug: player.round.slug,
        status: player.round.status,
        rulesetId: player.round.rulesetId,
        rulesetVersion: player.round.rulesetVersion,
        startsAt: player.round.startsAt.toISOString(),
        endedAt: player.round.endsAt.toISOString(),
      },
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      city: toCityDto(player.city),
      finalNetWorthCents: Number(player.netWorthCents),
      finalCashCents: Number(player.cashCents),
      rank: {
        local: player.localRank,
        national: player.nationalRank,
      },
      stats: statsByPlayer.get(player.id) ?? emptySeasonStats(),
      hideout: toSeasonHideoutDto(player),
      joinedAt: player.createdAt.toISOString(),
      lastActiveAt: player.lastActiveAt.toISOString(),
    })),
  };
}

const emptyContext = (): PublicContext => ({
  legacy: emptyLegacy(),
  raidAttacks: 0,
  raidAttackWins: 0,
  raidDefenses: 0,
  driveByAttacks: 0,
  driveByWins: 0,
  drugRunWins: 0,
  rideTheftWins: 0,
  lureRunWins: 0,
  whoresDrugged: 0,
  lowRidersStolen: 0,
  crewLured: 0,
  firstRaidAt: null,
  raidDefenseWins: 0,
  firstDefenseAt: null,
  firstDriveByAt: null,
  firstDriveByWinAt: null,
  firstDrugRunWinAt: null,
  firstRideTheftWinAt: null,
  firstLureRunWinAt: null,
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
  const hideoutLevels =
    row.hideoutSafeRoomLevel +
    row.hideoutLookoutsLevel +
    row.hideoutWorkshopLevel +
    row.hideoutBackOfficeLevel;
  const maxedHideoutRooms = [
    row.hideoutSafeRoomLevel,
    row.hideoutLookoutsLevel,
    row.hideoutWorkshopLevel,
    row.hideoutBackOfficeLevel,
  ].filter((level) => level >= 5).length;

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
    achievement({ key: 'rolling-deep', title: 'Rolling Deep', description: 'Send a drive-by at another block.', category: 'combat', rarity: 'common', current: context.driveByAttacks, target: 1, progressLabel: 'drive-bys sent', earnedAt: context.firstDriveByAt }),
    achievement({ key: 'clean-pass', title: 'Clean Pass', description: 'Land a drive-by.', category: 'combat', rarity: 'uncommon', current: context.driveByWins, target: 1, progressLabel: 'drive-bys landed', earnedAt: context.firstDriveByWinAt }),
    achievement({ key: 'bad-batch', title: 'Bad Batch', description: 'Win a drug run against a rival block.', category: 'combat', rarity: 'uncommon', current: context.drugRunWins, target: 1, progressLabel: 'drug runs won', earnedAt: context.firstDrugRunWinAt }),
    achievement({ key: 'burned-stable', title: 'Burned Stable', description: 'Drug twenty rival hoes in one round.', category: 'combat', rarity: 'rare', current: context.whoresDrugged, target: 20, progressLabel: 'hoes drugged' }),
    achievement({ key: 'boosted', title: 'Boosted', description: 'Steal a Low-Rider from another crew.', category: 'combat', rarity: 'uncommon', current: context.rideTheftWins, target: 1, progressLabel: 'rides stolen', earnedAt: context.firstRideTheftWinAt }),
    achievement({ key: 'chop-shop-regular', title: 'Chop Shop Regular', description: 'Steal three Low-Riders in one round.', category: 'combat', rarity: 'rare', current: context.lowRidersStolen, target: 3, progressLabel: 'Low-Riders stolen' }),
    achievement({ key: 'silver-tongue', title: 'Silver Tongue', description: 'Win a lure run against an unhappy block.', category: 'combat', rarity: 'uncommon', current: context.lureRunWins, target: 1, progressLabel: 'lure runs won', earnedAt: context.firstLureRunWinAt }),
    achievement({ key: 'recruiter', title: 'Recruiter', description: 'Lure twenty people away from rival crews in one round.', category: 'combat', rarity: 'rare', current: context.crewLured, target: 20, progressLabel: 'crew lured' }),

    achievement({ key: 'street-intel', title: 'Street Intel', description: 'Run recon on a target.', category: 'intel', rarity: 'common', current: context.reconRuns, target: 1, progressLabel: 'recon runs', earnedAt: context.firstReconAt }),
    achievement({ key: 'wire-tapper', title: 'Wire Tapper', description: 'Run five recon jobs in one round.', category: 'intel', rarity: 'uncommon', current: context.reconRuns, target: 5, progressLabel: 'recon runs', earnedAt: context.firstReconAt }),
    achievement({ key: 'eyes-everywhere', title: 'Eyes Everywhere', description: 'Run fifteen recon jobs in one round.', category: 'intel', rarity: 'rare', current: context.reconRuns, target: 15, progressLabel: 'recon runs', earnedAt: context.firstReconAt }),

    achievement({ key: 'favor-done', title: 'Favor Done', description: 'Complete one trader favor.', category: 'reputation', rarity: 'common', current: context.questsCompleted, target: 1, progressLabel: 'trader favors', earnedAt: context.firstQuestAt }),
    achievement({ key: 'connected', title: 'Connected', description: 'Complete all trader favors.', category: 'reputation', rarity: 'rare', current: context.questsCompleted, target: 4, progressLabel: 'trader favors', earnedAt: context.firstQuestAt }),
    achievement({ key: 'shotgun-trust', title: 'Shotgun Trust', description: 'Unlock shotgun purchases through trader reputation.', category: 'reputation', rarity: 'uncommon', current: row.shotgunUnlocked ? 1 : 0, target: 1, progressLabel: 'unlock' }),
    achievement({ key: 'tek-runner', title: 'Tek Runner', description: 'Unlock Tek-9 purchases through trader reputation.', category: 'reputation', rarity: 'rare', current: row.tek9Unlocked ? 1 : 0, target: 1, progressLabel: 'unlock' }),
    achievement({ key: 'heavy-metal', title: 'Heavy Metal', description: 'Unlock AK-47 purchases through trader reputation.', category: 'reputation', rarity: 'epic', current: row.ak47Unlocked ? 1 : 0, target: 1, progressLabel: 'unlock' }),

    achievement({ key: 'first-hideout-upgrade', title: 'Keys to the Place', description: 'Buy your first seasonal hideout upgrade.', category: 'hideout', rarity: 'common', current: hideoutLevels, target: 1, progressLabel: 'hideout levels' }),
    achievement({ key: 'hideout-regular', title: 'House Money', description: 'Reach ten hideout upgrades in one season.', category: 'hideout', rarity: 'uncommon', current: hideoutLevels, target: 10, progressLabel: 'hideout levels' }),
    achievement({ key: 'room-maxed', title: 'Room Maxed', description: 'Fully upgrade any hideout room in one season.', category: 'hideout', rarity: 'rare', current: maxedHideoutRooms, target: 1, progressLabel: 'maxed rooms' }),
    achievement({ key: 'fully-built-hideout', title: 'Fully Built', description: 'Max every hideout room in one season.', category: 'hideout', rarity: 'epic', current: hideoutLevels, target: 20, progressLabel: 'hideout levels' }),

    ...legacyAchievements(context.legacy),
  ];
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function profileAccent(value: string | null | undefined): ProfileAccent {
  return ['default', 'crimson', 'gold', 'green', 'blue', 'purple'].includes(value ?? '')
    ? value as ProfileAccent
    : 'default';
}

/** Cross-round achievements. Exported so forum badges work for accounts not in the current round. */
export function legacyAchievements(legacy: PublicLegacyDto): PublicAwardDto[] {
  return [
    achievement({ key: 'veteran', title: 'Veteran', description: 'Finish at least one previous round.', category: 'legacy', rarity: 'common', current: legacy.roundsPlayed, target: 1, progressLabel: 'past rounds' }),
    achievement({ key: 'past-winner', title: 'Past Winner', description: 'Finish a previous round at national #1.', category: 'legacy', rarity: 'legendary', current: legacy.roundWins, target: 1, progressLabel: 'past round wins' }),
    achievement({ key: 'hall-of-fame', title: 'Hall of Fame', description: 'Win three previous rounds.', category: 'legacy', rarity: 'legendary', current: legacy.roundWins, target: 3, progressLabel: 'past round wins' }),
    achievement({ key: 'top-finisher', title: 'Top Finisher', description: 'Finish a previous round in the national top ten.', category: 'legacy', rarity: 'rare', current: legacy.topTenFinishes, target: 1, progressLabel: 'top-ten finish' }),
  ];
}

export async function loadPublicContexts(
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
      select: { accountId: true, localRank: true, nationalRank: true, netWorthCents: true },
    }),
    prisma.raidBattle.findMany({
      where: { OR: [{ attackerId: { in: ids } }, { defenderId: { in: ids } }], voidedAt: null },
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
    legacyByAccount.set(row.accountId, addPastRound(legacyByAccount.get(row.accountId) ?? emptyLegacy(), row));
  }

  const idToAccount = new Map(rows.map((row) => [row.id, row.accountId]));
  for (const [id, accountId] of idToAccount) {
    contexts.get(id)!.legacy = legacyByAccount.get(accountId) ?? emptyLegacy();
  }

  for (const battle of battles) {
    const attackerReport = battle.attackerReport as {
      kind?: string;
      won?: boolean;
      raidForm?: {
        whoresDrugged?: number;
        lowRidersStolen?: number;
        whoresLured?: number;
        thugsLured?: number;
      };
    };
    const defenderReport = battle.defenderReport as { kind?: string; won?: boolean };
    const battleKind = attackerReport.kind ?? 'RAID';
    if (contexts.has(battle.attackerId)) {
      const context = contexts.get(battle.attackerId)!;
      if (battleKind === 'RAID') {
        context.raidAttacks += 1;
        context.firstRaidAt = earliest(context.firstRaidAt, battle.createdAt);
      } else if (battleKind === 'DRIVE_BY') {
        context.driveByAttacks += 1;
        context.firstDriveByAt = earliest(context.firstDriveByAt, battle.createdAt);
      }
      if (attackerReport.won === true && battleKind === 'RAID') {
        context.raidAttackWins += 1;
        context.firstRaidWinAt = earliest(context.firstRaidWinAt, battle.createdAt);
      }
      if (attackerReport.won === true && battleKind === 'DRIVE_BY') {
        context.driveByWins += 1;
        context.firstDriveByWinAt = earliest(context.firstDriveByWinAt, battle.createdAt);
      }
      if (attackerReport.won === true && battleKind === 'DRUG_HOES') {
        context.drugRunWins += 1;
        context.firstDrugRunWinAt = earliest(context.firstDrugRunWinAt, battle.createdAt);
        context.whoresDrugged += attackerReport.raidForm?.whoresDrugged ?? 0;
      }
      if (attackerReport.won === true && battleKind === 'STEAL_RIDE') {
        context.rideTheftWins += 1;
        context.firstRideTheftWinAt = earliest(context.firstRideTheftWinAt, battle.createdAt);
        context.lowRidersStolen += attackerReport.raidForm?.lowRidersStolen ?? 0;
      }
      if (attackerReport.won === true && battleKind === 'LURE_CREW') {
        context.lureRunWins += 1;
        context.firstLureRunWinAt = earliest(context.firstLureRunWinAt, battle.createdAt);
        context.crewLured += (attackerReport.raidForm?.whoresLured ?? 0) + (attackerReport.raidForm?.thugsLured ?? 0);
      }
    }
    if (contexts.has(battle.defenderId) && battleKind !== 'DRIVE_BY') {
      const context = contexts.get(battle.defenderId)!;
      context.raidDefenses += 1;
      context.firstDefenseAt = earliest(context.firstDefenseAt, battle.createdAt);
      if (defenderReport.won === true) {
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
      alliance: allianceTagDto(row.alliance),
    };
  });
}

export const CommunityService = {
  career: loadCareerForAccount,

  async hallOfFame(prisma: PrismaClient, roundLimit = 10, podiumSize = 3): Promise<HallOfFameDto> {
    const rounds = await prisma.round.findMany({
      where: { status: { in: ['ENDED', 'ARCHIVED'] } },
      // Seasons superseded together share an end, so the later start goes first.
      orderBy: [{ endsAt: 'desc' }, { startsAt: 'desc' }],
      take: roundLimit,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        rulesetId: true,
        rulesetVersion: true,
        startsAt: true,
        endsAt: true,
        _count: { select: { players: true } },
        players: {
          where: { nationalRank: { not: null, lte: 10 }, account: { isActive: true } },
          orderBy: [{ nationalRank: 'asc' }, { netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
          select: {
            nationalRank: true,
            publicPimpId: true,
            displayName: true,
            netWorthCents: true,
            cashCents: true,
            hideoutSafeRoomLevel: true,
            hideoutLookoutsLevel: true,
            hideoutWorkshopLevel: true,
            hideoutBackOfficeLevel: true,
            createdAt: true,
            lastActiveAt: true,
            city: { select: { name: true } },
          },
        },
      },
    });

    return {
      rounds: rounds.map((round) => {
        const topTen = round.players.map((player) => ({
          rank: player.nationalRank!,
          publicPimpId: player.publicPimpId,
          displayName: player.displayName,
          netWorthCents: Number(player.netWorthCents),
          cashCents: Number(player.cashCents),
          city: player.city.name,
          hideout: toSeasonHideoutDto(player),
          joinedAt: player.createdAt.toISOString(),
          lastActiveAt: player.lastActiveAt.toISOString(),
        }));
        return {
          id: round.id,
          name: round.name,
          slug: round.slug,
          status: round.status,
          rulesetId: round.rulesetId,
          rulesetVersion: round.rulesetVersion,
          startsAt: round.startsAt.toISOString(),
          endedAt: round.endsAt.toISOString(),
          playerCount: round._count.players,
          podium: topTen.filter((player) => player.rank <= podiumSize),
          topTen,
        };
      }),
    };
  },

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
        where: { roundId: player.roundId, account: { isActive: true } },
        include: { city: true, alliance: { select: { name: true, tag: true } } },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        take: topCount,
      }),
      prisma.roundPlayer.findMany({
        where: { roundId: player.roundId, cityId: player.cityId, account: { isActive: true } },
        include: { city: true, alliance: { select: { name: true, tag: true } } },
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
    /** The forum's own badge lookup skips the forum round trip. */
    options: { forumGroups?: boolean } = {},
  ): Promise<PublicPlayerProfileDto> {
    const player = await prisma.roundPlayer.findFirst({
      where: { roundId, publicPimpId, account: { isActive: true } },
      include: { city: true, alliance: { select: { name: true, tag: true } } },
    });

    if (!player) {
      throw AppError.notFound('PLAYER_NOT_FOUND', 'That pimp is not in this round.');
    }

    const [nationalAhead, localAhead, forumLink] = await Promise.all([
      prisma.roundPlayer.count({
        where: { roundId, netWorthCents: { gt: player.netWorthCents }, account: { isActive: true } },
      }),
      prisma.roundPlayer.count({
        where: {
          roundId,
          cityId: player.cityId,
          netWorthCents: { gt: player.netWorthCents },
          account: { isActive: true },
        },
      }),
      // Same rules as the forum-side lookup: linking enabled and the current forum only.
      env.forum.enabled
        ? prisma.forumLink.findFirst({ where: { accountId: player.accountId, forumOrigin: env.forum.origin } })
        : null,
    ]);

    const localRank = localAhead + 1;
    const nationalRank = nationalAhead + 1;
    const now = new Date();
    const isYou = player.publicPimpId === viewerPublicPimpId;
    const privacy = ruleset.communityPrivacy;
    const hideCrew = Boolean(privacy?.hideOpponentCrew && !isYou);
    const hideWeapons = Boolean(privacy?.hideOpponentWeapons && !isYou);
    const weapons = player.pistols + player.shotguns + player.tek9s + player.ak47s;
    const [contexts, forumGroups, career, profileSettings] = await Promise.all([
      loadPublicContexts(prisma, roundId, [player]),
      forumLink && options.forumGroups !== false ? ForumGroupsService.groupsFor(forumLink.forumUserId) : [],
      loadCareerForAccount(prisma, player.accountId, { currentRoundId: roundId, limit: 10 }),
      prisma.accountProfile.findUnique({ where: { accountId: player.accountId } }),
    ]);
    const context = contexts.get(player.id) ?? emptyContext();
    const awards = achievementsFor(player, { local: localRank, national: nationalRank }, context);
    const unlockedAwards = awards.filter((award) => award.unlocked);
    const featuredBadgeKeys = jsonStringArray(profileSettings?.featuredBadgeKeys)
      .filter((key) => unlockedAwards.some((award) => award.key === key));
    const title = unlockedAwards.find((award) => award.key === profileSettings?.activeTitleKey)?.title ?? null;

    return {
      forumProfileUrl: forumLink ? forumProfileUrl(forumLink) : null,
      badges: selectProfileBadges(awards, undefined, featuredBadgeKeys),
      forumGroups,
      cosmetics: {
        title,
        accent: profileAccent(profileSettings?.profileAccent),
      },
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      alliance: allianceTagDto(player.alliance),
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
      career,
      awards,
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
