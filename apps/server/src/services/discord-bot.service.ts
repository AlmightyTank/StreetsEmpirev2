import { createHash, timingSafeEqual } from 'node:crypto';
import type { Prisma, PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound, regenerateTurns } from '@streets/rules-engine';
import type {
  DiscordAlertSettingsDto,
  DiscordAlertType,
  DiscordAlertsClaimDto,
  DiscordBadgesDto,
  DiscordBattleEventDto,
  DiscordBattleKind,
  DiscordCityDto,
  DiscordHallOfFameDto,
  DiscordHistoryDto,
  DiscordLeaderboardDto,
  DiscordLeaderboardStat,
  DiscordMemberDto,
  DiscordNewsCreatedDto,
  DiscordNewsPostDto,
  DiscordProfileCardDto,
  DiscordRankAlertDto,
  DiscordRankingEntryDto,
  DiscordRankingsDto,
  DiscordRoundEventDto,
  DiscordStatsDto,
  DiscordTurnReminderDto,
  ForumGroupBadgeDto,
  PublicLegacyDto,
} from '@streets/shared';
import { env } from '../config/env.js';
import { toRoundPlayerDto } from '../game/dto.js';
import { AppError } from '../utils/errors.js';
import { CommunityService, legacyAchievements, loadLegacyByAccount, loadPublicContexts } from './community.service.js';
import { ForumGroupsService } from './forum-groups.service.js';
import { PlayerStateService } from './player-state.service.js';
import { RoundService } from './round.service.js';

/** Constant-time bearer check; hashing first makes the lengths equal. */
export function botTokenMatches(header: string | undefined, token: string): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(token));
}

/** Ranks for values already sorted high to low: ties share a rank and skip the tied positions. */
export function rankValues(sortedDesc: Array<number | bigint>): number[] {
  const ranks: number[] = [];
  sortedDesc.forEach((value, index) => {
    ranks.push(index > 0 && sortedDesc[index - 1] === value ? ranks[index - 1]! : index + 1);
  });
  return ranks;
}

/** Rankings-style ranks for rows already sorted by net worth, richest first. */
export function competitionRanks(sortedDesc: Array<{ netWorthCents: bigint }>): number[] {
  return rankValues(sortedDesc.map((row) => row.netWorthCents));
}

/** Role keys the bot maps to Discord roles. Every linked, active account is at least "linked". */
export function roleKeysFor(input: {
  inRound: boolean;
  nationalRank: number | null;
  legacy: PublicLegacyDto;
  forumGroups: ForumGroupBadgeDto[];
}): string[] {
  const keys = ['linked'];
  if (input.inRound) keys.push('player');
  if (input.nationalRank === 1) keys.push('national-1');
  if (input.nationalRank !== null && input.nationalRank <= 10) keys.push('top-10');
  for (const award of legacyAchievements(input.legacy)) if (award.unlocked) keys.push(award.key);
  for (const group of input.forumGroups) keys.push(`forum:${group.name}`);
  return keys;
}

/**
 * Turn reminder state machine. Turns only regenerate while below the cap, so
 * "armed" (seen below the cap) then "full" means they filled up since last time.
 */
export function reminderDecision(input: { armed: boolean; turns: number; cap: number }): 'arm' | 'notify' | 'none' {
  if (input.turns >= input.cap) return input.armed ? 'notify' : 'none';
  return input.armed ? 'none' : 'arm';
}

/** Rank alerts fire on the way down only: losing #1, or falling out of the top 10. */
export function rankAlertFor(previous: number | null, current: number): DiscordRankAlertDto['kind'] | null {
  if (previous === null) return null;
  if (previous === 1 && current > 1) return 'lost-first';
  if (previous <= 10 && current > 10) return 'out-of-top-10';
  return null;
}

type PublicContext = NonNullable<ReturnType<Awaited<ReturnType<typeof loadPublicContexts>>['get']>>;

export const LEADERBOARD_STATS: Record<DiscordLeaderboardStat, { label: string; value: (context: PublicContext) => number }> = {
  raids: { label: 'Raid wins', value: (context) => context.raidAttackWins },
  defenses: { label: 'Defense wins', value: (context) => context.raidDefenseWins },
  'drive-bys': { label: 'Drive-bys landed', value: (context) => context.driveByWins },
  recon: { label: 'Recon runs', value: (context) => context.reconRuns },
  rides: { label: 'Low-Riders stolen', value: (context) => context.lowRidersStolen },
  lures: { label: 'Crew lured', value: (context) => context.crewLured },
};

const BATTLE_KINDS: readonly DiscordBattleKind[] = ['RAID', 'DRIVE_BY', 'DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW'];

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }));
  return results;
}

function gameUrl(path: string): string {
  return new URL(path, env.frontendOrigin).toString();
}

function playerUrl(publicPimpId: number): string {
  return gameUrl(`/game/players/${publicPimpId}`);
}

function roundSummary(round: Round): NonNullable<DiscordRankingsDto['round']> {
  return { name: round.name, status: round.status, endsAt: round.endsAt.toISOString() };
}

type RankedRow = { publicPimpId: number; displayName: string; netWorthCents: bigint; startingRank: number | null; city: string };

/** Rows must already be sorted richest first. Movement compares with the day's starting rank. */
function rankedEntries(rows: RankedRow[]): DiscordRankingEntryDto[] {
  const ranks = competitionRanks(rows);
  return rows.map((row, index) => ({
    rank: ranks[index]!,
    publicPimpId: row.publicPimpId,
    displayName: row.displayName,
    city: row.city,
    netWorthCents: Number(row.netWorthCents),
    movement: row.startingRank === null ? null : row.startingRank - ranks[index]!,
    profileUrl: playerUrl(row.publicPimpId),
  }));
}

const emptyLegacy = (): PublicLegacyDto => ({
  roundsPlayed: 0,
  roundWins: 0,
  topTenFinishes: 0,
  bestNationalRank: null,
  bestLocalRank: null,
  totalFinalNetWorthCents: 0,
});

const notLinked = () => AppError.notFound('DISCORD_NOT_LINKED', 'That Discord account is not linked to a StreetsEmpire account.');

async function findLinkedAccount(prisma: PrismaClient, discordId: string) {
  const account = await prisma.account.findFirst({ where: { discordId, isActive: true }, select: { id: true, isAdmin: true } });
  if (!account) throw notLinked();
  return account;
}

type PlayerQuery = { discordId: string } | { name: string };

async function findRoundPlayer(prisma: PrismaClient, round: Round, query: PlayerQuery): Promise<{ publicPimpId: number }> {
  if ('discordId' in query) {
    const account = await findLinkedAccount(prisma, query.discordId);
    const player = await prisma.roundPlayer.findFirst({ where: { roundId: round.id, accountId: account.id }, select: { publicPimpId: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_IN_ROUND', `That player has not joined ${round.name} yet.`);
    return player;
  }
  const player = await prisma.roundPlayer.findFirst({
    where: { roundId: round.id, displayName: { equals: query.name, mode: 'insensitive' }, account: { isActive: true } },
    select: { publicPimpId: true },
  });
  // The name stays out of the message; the bot echoes it safely itself.
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', `No player by that name in ${round.name}.`);
  return player;
}

async function publicProfile(prisma: PrismaClient, query: PlayerQuery) {
  const round = await RoundService.requireCurrent(prisma);
  const player = await findRoundPlayer(prisma, round, query);
  const profile = await CommunityService.profile(
    prisma, round.id, player.publicPimpId, 0, loadRulesetForRound(round), { forumGroups: false },
  );
  return { round, profile };
}

/** Current round, plus the account's turns and national rank in it when they have joined. */
async function currentStanding(prisma: PrismaClient, accountId: string) {
  const round = await RoundService.getCurrent(prisma);
  if (!round) return { round: null, current: null };
  const player = await prisma.roundPlayer.findFirst({
    where: { roundId: round.id, accountId },
    select: { turns: true, lastTurnCalculationAt: true, netWorthCents: true },
  });
  if (!player) return { round, current: null };
  const ruleset = loadRulesetForRound(round);
  const ahead = await prisma.roundPlayer.count({
    where: { roundId: round.id, netWorthCents: { gt: player.netWorthCents }, account: { isActive: true } },
  });
  return {
    round,
    current: { turns: regenerateTurns(player, new Date(), ruleset).turns, cap: ruleset.turns.cap, nationalRank: ahead + 1 },
  };
}

type AlertRow = { attacksEnabled: boolean; roundEnabled: boolean; rankEnabled: boolean; turnsEnabled: boolean };

function alertSettingsDto(
  row: AlertRow | null,
  round: Round | null,
  current: DiscordAlertSettingsDto['current'],
): DiscordAlertSettingsDto {
  return {
    alerts: {
      attacks: row?.attacksEnabled ?? false,
      round: row?.roundEnabled ?? false,
      rank: row?.rankEnabled ?? false,
      turns: row?.turnsEnabled ?? false,
    },
    roundName: round?.name ?? null,
    current,
  };
}

/** Active players of a round, richest first, with tie-aware ranks. */
async function roundStandings(prisma: PrismaClient, roundId: string) {
  const players = await prisma.roundPlayer.findMany({
    where: { roundId, account: { isActive: true } },
    orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
    select: { accountId: true, publicPimpId: true, displayName: true, netWorthCents: true, city: { select: { name: true } } },
  });
  const ranks = competitionRanks(players);
  return { players, ranks, rankByAccount: new Map(players.map((player, index) => [player.accountId, ranks[index]!])) };
}

/** New battles, oldest first, marked as posted before the bot sends anything. */
async function claimBattles(prisma: PrismaClient, now: Date, limit = 25): Promise<DiscordBattleEventDto[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.raidBattle.findMany({
      where: { discordPostedAt: null, voidedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        attackerReport: true,
        createdAt: true,
        attacker: { select: { displayName: true, publicPimpId: true, round: { select: { name: true } } } },
        defender: {
          select: {
            displayName: true,
            publicPimpId: true,
            account: { select: { discordId: true, isActive: true, discordReminder: { select: { attacksEnabled: true } } } },
          },
        },
      },
    });
    if (!rows.length) return [];
    await tx.raidBattle.updateMany({ where: { id: { in: rows.map((row) => row.id) }, discordPostedAt: null }, data: { discordPostedAt: now } });

    return rows.map((row) => {
      const report = row.attackerReport as { kind?: string; won?: boolean };
      const kind = BATTLE_KINDS.find((candidate) => candidate === report.kind) ?? row.kind;
      const defender = row.defender.account;
      return {
        id: row.id,
        kind,
        roundName: row.attacker.round.name,
        attackerName: row.attacker.displayName,
        attackerProfileUrl: playerUrl(row.attacker.publicPimpId),
        defenderName: row.defender.displayName,
        defenderProfileUrl: playerUrl(row.defender.publicPimpId),
        attackerWon: report.won === true,
        createdAt: row.createdAt.toISOString(),
        alertDiscordId: defender.isActive && defender.discordId && defender.discordReminder?.attacksEnabled ? defender.discordId : null,
      };
    });
  });
}

async function claimRoundEvents(prisma: PrismaClient, now: Date): Promise<DiscordRoundEventDto[]> {
  const soon = new Date(now.getTime() + 24 * 60 * 60_000);
  const [openedRounds, endingSoonRounds, endedRounds] = await Promise.all([
    prisma.round.findMany({ where: { discordOpenedAt: null, status: { in: ['REGISTRATION', 'ACTIVE'] } } }),
    prisma.round.findMany({ where: { discordEndingSoonAt: null, discordEndedAt: null, status: 'ACTIVE', endsAt: { gt: now, lte: soon } } }),
    prisma.round.findMany({
      where: {
        discordEndedAt: null,
        OR: [{ status: { in: ['ENDED', 'ARCHIVED'] } }, { status: { in: ['REGISTRATION', 'ACTIVE'] }, endsAt: { lte: now } }],
      },
    }),
  ]);
  if (!openedRounds.length && !endingSoonRounds.length && !endedRounds.length) return [];

  const endedIds = endedRounds.map((round) => round.id);
  await prisma.$transaction([
    prisma.round.updateMany({ where: { id: { in: openedRounds.map((round) => round.id) }, discordOpenedAt: null }, data: { discordOpenedAt: now } }),
    prisma.round.updateMany({ where: { id: { in: endingSoonRounds.map((round) => round.id) }, discordEndingSoonAt: null }, data: { discordEndingSoonAt: now } }),
    prisma.round.updateMany({ where: { id: { in: endedIds }, discordEndedAt: null }, data: { discordEndedAt: now } }),
    // An ended round never needs its "ending soon" alert any more.
    prisma.round.updateMany({ where: { id: { in: endedIds }, discordEndingSoonAt: null }, data: { discordEndingSoonAt: now } }),
  ]);

  const subscribers = await prisma.discordReminder.findMany({
    where: { roundEnabled: true, account: { isActive: true, discordId: { not: null } } },
    select: { accountId: true, account: { select: { discordId: true } } },
  });
  const base = (type: DiscordRoundEventDto['type'], round: Round) => ({
    type,
    roundName: round.name,
    status: round.status,
    startsAt: round.startsAt.toISOString(),
    endsAt: round.endsAt.toISOString(),
    url: gameUrl(type === 'ended' ? '/game/rankings' : '/join'),
  });

  const events: DiscordRoundEventDto[] = [];
  for (const round of openedRounds) {
    // A round that opened and ended between checks only announces the ending.
    if (endedIds.includes(round.id)) continue;
    events.push({ ...base('opened', round), standings: [], recipients: subscribers.map((s) => ({ discordId: s.account.discordId!, rank: null })) });
  }
  for (const round of endingSoonRounds) {
    const { rankByAccount } = await roundStandings(prisma, round.id);
    events.push({
      ...base('ending-soon', round),
      standings: [],
      recipients: subscribers.filter((s) => rankByAccount.has(s.accountId)).map((s) => ({ discordId: s.account.discordId!, rank: rankByAccount.get(s.accountId)! })),
    });
  }
  for (const round of endedRounds) {
    const { players, ranks, rankByAccount } = await roundStandings(prisma, round.id);
    events.push({
      ...base('ended', round),
      standings: players.slice(0, 10).map((player, index) => ({
        rank: ranks[index]!,
        publicPimpId: player.publicPimpId,
        displayName: player.displayName,
        city: player.city.name,
        netWorthCents: Number(player.netWorthCents),
        movement: null,
        profileUrl: playerUrl(player.publicPimpId),
      })),
      recipients: subscribers.filter((s) => rankByAccount.has(s.accountId)).map((s) => ({ discordId: s.account.discordId!, rank: rankByAccount.get(s.accountId)! })),
    });
  }
  return events;
}

/** Turn and rank alerts for the running round. */
async function claimPlayerAlerts(prisma: PrismaClient, round: Round, now: Date): Promise<Pick<DiscordAlertsClaimDto, 'turns' | 'ranks'>> {
  const settings = await prisma.discordReminder.findMany({
    where: { OR: [{ turnsEnabled: true }, { rankEnabled: true }], account: { isActive: true, discordId: { not: null } } },
    select: {
      accountId: true,
      turnsEnabled: true,
      turnsArmed: true,
      rankEnabled: true,
      rankRoundId: true,
      rankLastNational: true,
      account: { select: { discordId: true } },
    },
  });
  if (!settings.length) return { turns: [], ranks: [] };

  const [players, standings] = await Promise.all([
    prisma.roundPlayer.findMany({
      where: { roundId: round.id, accountId: { in: settings.map((setting) => setting.accountId) } },
      select: { accountId: true, displayName: true, turns: true, lastTurnCalculationAt: true },
    }),
    settings.some((setting) => setting.rankEnabled) ? roundStandings(prisma, round.id) : null,
  ]);
  const playerByAccount = new Map(players.map((player) => [player.accountId, player]));
  const ruleset = loadRulesetForRound(round);

  const arm: string[] = [];
  const turnsDue: string[] = [];
  const turns: DiscordTurnReminderDto[] = [];
  const ranks: DiscordRankAlertDto[] = [];
  const rankUpdates: Array<{ accountId: string; rank: number }> = [];

  for (const setting of settings) {
    const player = playerByAccount.get(setting.accountId);
    if (!player) continue;
    const discordId = setting.account.discordId!;

    if (setting.turnsEnabled) {
      const current = regenerateTurns(player, now, ruleset).turns;
      const decision = reminderDecision({ armed: setting.turnsArmed, turns: current, cap: ruleset.turns.cap });
      if (decision === 'arm') arm.push(setting.accountId);
      if (decision === 'notify') {
        turnsDue.push(setting.accountId);
        turns.push({ discordId, displayName: player.displayName, roundName: round.name, turns: current, cap: ruleset.turns.cap, url: gameUrl('/game') });
      }
    }

    const rank = standings?.rankByAccount.get(setting.accountId);
    if (setting.rankEnabled && rank !== undefined) {
      // A rank remembered from another round says nothing about this one.
      const previous = setting.rankRoundId === round.id ? setting.rankLastNational : null;
      const kind = rankAlertFor(previous, rank);
      if (kind) {
        ranks.push({ discordId, displayName: player.displayName, roundName: round.name, kind, rank, leaderName: standings!.players[0]?.displayName ?? null, url: gameUrl('/game/rankings') });
      }
      if (setting.rankRoundId !== round.id || setting.rankLastNational !== rank) rankUpdates.push({ accountId: setting.accountId, rank });
    }
  }

  if (arm.length || turnsDue.length || rankUpdates.length) {
    await prisma.$transaction([
      prisma.discordReminder.updateMany({ where: { accountId: { in: arm } }, data: { turnsArmed: true } }),
      prisma.discordReminder.updateMany({ where: { accountId: { in: turnsDue }, turnsArmed: true }, data: { turnsArmed: false, turnsLastSentAt: now } }),
      ...rankUpdates.map((update) => prisma.discordReminder.update({
        where: { accountId: update.accountId },
        data: { rankRoundId: round.id, rankLastNational: update.rank },
      })),
    ]);
  }
  return { turns, ranks };
}

export const DiscordBotService = {
  async rolesFor(prisma: PrismaClient, discordIds: string[]): Promise<Record<string, string[]>> {
    const accounts = await prisma.account.findMany({
      where: { discordId: { in: discordIds }, isActive: true },
      select: { id: true, discordId: true, forumLink: { select: { forumOrigin: true, forumUserId: true } } },
    });
    if (!accounts.length) return {};

    const round = await RoundService.getCurrent(prisma);
    const [standings, legacyByAccount, forumGroups] = await Promise.all([
      round
        ? prisma.roundPlayer.findMany({
          where: { roundId: round.id, account: { isActive: true } },
          select: { accountId: true, netWorthCents: true },
          orderBy: { netWorthCents: 'desc' },
        })
        : [],
      loadLegacyByAccount(prisma, accounts.map((account) => account.id), round?.id ?? null),
      // Cached per forum user; limit fan-out on a cold cache.
      mapWithLimit(accounts, 5, (account) =>
        env.forum.enabled && account.forumLink?.forumOrigin === env.forum.origin
          ? ForumGroupsService.groupsFor(account.forumLink.forumUserId)
          : Promise.resolve([] as ForumGroupBadgeDto[])),
    ]);

    const ranks = competitionRanks(standings);
    const rankByAccount = new Map(standings.map((row, index) => [row.accountId, ranks[index]!]));
    // Rank roles only mean something while the round is running.
    const ranked = round?.status === 'ACTIVE';

    return Object.fromEntries(accounts.map((account, index) => [
      account.discordId!,
      roleKeysFor({
        inRound: rankByAccount.has(account.id),
        nationalRank: ranked ? rankByAccount.get(account.id) ?? null : null,
        legacy: legacyByAccount.get(account.id) ?? emptyLegacy(),
        forumGroups: forumGroups[index]!,
      }),
    ]));
  },

  async profileCard(prisma: PrismaClient, query: PlayerQuery): Promise<DiscordProfileCardDto> {
    const { round, profile } = await publicProfile(prisma, query);
    return {
      roundName: round.name,
      displayName: profile.displayName,
      publicPimpId: profile.publicPimpId,
      city: profile.city.name,
      netWorthCents: profile.netWorthCents,
      rank: { local: profile.rank.local, national: profile.rank.national, nationalMovement: profile.rank.nationalMovement },
      legacy: profile.legacy,
      badges: profile.badges,
      profileUrl: playerUrl(profile.publicPimpId),
      forumProfileUrl: profile.forumProfileUrl,
    };
  },

  /** Every achievement with progress: the same public list the game profile shows. */
  async badges(prisma: PrismaClient, query: PlayerQuery): Promise<DiscordBadgesDto> {
    const { round, profile } = await publicProfile(prisma, query);
    return {
      roundName: round.name,
      displayName: profile.displayName,
      publicPimpId: profile.publicPimpId,
      profileUrl: playerUrl(profile.publicPimpId),
      awards: profile.awards,
    };
  },

  async rankings(prisma: PrismaClient, limit = 10): Promise<DiscordRankingsDto> {
    const round = await RoundService.getCurrent(prisma);
    if (!round) return { round: null, city: null, entries: [] };

    const rows = await prisma.roundPlayer.findMany({
      where: { roundId: round.id, account: { isActive: true } },
      orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
      take: limit,
      select: { publicPimpId: true, displayName: true, netWorthCents: true, dailyStartingNationalRank: true, city: { select: { name: true } } },
    });
    return {
      round: roundSummary(round),
      city: null,
      entries: rankedEntries(rows.map((row) => ({ ...row, startingRank: row.dailyStartingNationalRank, city: row.city.name }))),
    };
  },

  async cities(prisma: PrismaClient): Promise<DiscordCityDto[]> {
    return prisma.city.findMany({
      where: { isEnabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true },
    });
  },

  async cityRankings(prisma: PrismaClient, citySlug: string, limit = 10): Promise<DiscordRankingsDto> {
    const city = await prisma.city.findFirst({ where: { slug: citySlug, isEnabled: true }, select: { id: true, slug: true, name: true } });
    if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'No city by that name.');

    const round = await RoundService.getCurrent(prisma);
    if (!round) return { round: null, city: { slug: city.slug, name: city.name }, entries: [] };

    const rows = await prisma.roundPlayer.findMany({
      where: { roundId: round.id, cityId: city.id, account: { isActive: true } },
      orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
      take: limit,
      select: { publicPimpId: true, displayName: true, netWorthCents: true, dailyStartingLocalRank: true },
    });
    return {
      round: roundSummary(round),
      city: { slug: city.slug, name: city.name },
      entries: rankedEntries(rows.map((row) => ({ ...row, startingRank: row.dailyStartingLocalRank, city: city.name }))),
    };
  },

  /** Top 10 for one public combat or intel count this round; the same counts profiles show. */
  async leaderboard(prisma: PrismaClient, stat: DiscordLeaderboardStat, limit = 10): Promise<DiscordLeaderboardDto> {
    const definition = LEADERBOARD_STATS[stat];
    const round = await RoundService.getCurrent(prisma);
    if (!round) return { round: null, stat, label: definition.label, entries: [] };

    const players = await prisma.roundPlayer.findMany({
      where: { roundId: round.id, account: { isActive: true } },
      select: { id: true, accountId: true, publicPimpId: true, displayName: true, city: { select: { name: true } } },
    });
    const contexts = await loadPublicContexts(prisma, round.id, players);
    const scored = players
      .map((player) => ({ player, value: definition.value(contexts.get(player.id)!) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value || a.player.publicPimpId - b.player.publicPimpId)
      .slice(0, limit);
    const ranks = rankValues(scored.map((entry) => entry.value));

    return {
      round: roundSummary(round),
      stat,
      label: definition.label,
      entries: scored.map((entry, index) => ({
        rank: ranks[index]!,
        publicPimpId: entry.player.publicPimpId,
        displayName: entry.player.displayName,
        city: entry.player.city.name,
        value: entry.value,
        profileUrl: playerUrl(entry.player.publicPimpId),
      })),
    };
  },

  async hallOfFame(prisma: PrismaClient, roundLimit = 5, podiumSize = 3): Promise<DiscordHallOfFameDto> {
    const rounds = await prisma.round.findMany({
      where: { status: { in: ['ENDED', 'ARCHIVED'] } },
      orderBy: { endsAt: 'desc' },
      take: roundLimit,
      select: {
        name: true,
        endsAt: true,
        players: {
          where: { nationalRank: { not: null, lte: podiumSize }, account: { isActive: true } },
          orderBy: [{ nationalRank: 'asc' }, { netWorthCents: 'desc' }],
          select: { nationalRank: true, displayName: true, netWorthCents: true, city: { select: { name: true } } },
        },
      },
    });
    return {
      rounds: rounds.map((round) => ({
        name: round.name,
        endedAt: round.endsAt.toISOString(),
        podium: round.players.map((player) => ({
          rank: player.nationalRank!,
          displayName: player.displayName,
          netWorthCents: Number(player.netWorthCents),
          city: player.city.name,
        })),
      })),
    };
  },

  /** A player's finishes in past rounds, found by Discord member or by any name they played under. */
  async history(prisma: PrismaClient, query: PlayerQuery, limit = 10): Promise<DiscordHistoryDto> {
    let accountId: string;
    if ('discordId' in query) {
      accountId = (await findLinkedAccount(prisma, query.discordId)).id;
    } else {
      const named = await prisma.roundPlayer.findFirst({
        where: { displayName: { equals: query.name, mode: 'insensitive' }, account: { isActive: true } },
        orderBy: { createdAt: 'desc' },
        select: { accountId: true },
      });
      if (!named) throw AppError.notFound('PLAYER_NOT_FOUND', 'No player by that name.');
      accountId = named.accountId;
    }

    const now = new Date();
    const [rows, latest, legacyByAccount] = await Promise.all([
      prisma.roundPlayer.findMany({
        where: {
          accountId,
          round: { OR: [{ status: { in: ['ENDED', 'ARCHIVED'] } }, { status: { in: ['REGISTRATION', 'ACTIVE'] }, endsAt: { lte: now } }] },
        },
        orderBy: { round: { endsAt: 'desc' } },
        take: limit,
        select: {
          displayName: true,
          nationalRank: true,
          netWorthCents: true,
          city: { select: { name: true } },
          round: { select: { name: true, endsAt: true } },
        },
      }),
      prisma.roundPlayer.findFirst({ where: { accountId }, orderBy: { round: { startsAt: 'desc' } }, select: { displayName: true } }),
      loadLegacyByAccount(prisma, [accountId], null),
    ]);

    return {
      displayName: latest?.displayName ?? 'This player',
      rounds: rows.map((row) => ({
        name: row.round.name,
        endedAt: row.round.endsAt.toISOString(),
        displayName: row.displayName,
        rank: row.nationalRank,
        netWorthCents: Number(row.netWorthCents),
        city: row.city.name,
      })),
      legacy: legacyByAccount.get(accountId) ?? emptyLegacy(),
    };
  },

  /** The member's own numbers, for their private /stats. Not counted as being at the keyboard. */
  async stats(prisma: PrismaClient, discordId: string): Promise<DiscordStatsDto> {
    const account = await findLinkedAccount(prisma, discordId);
    const round = await RoundService.requireCurrent(prisma);
    const player = await prisma.roundPlayer.findFirst({ where: { roundId: round.id, accountId: account.id }, select: { id: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_IN_ROUND', `You have not joined ${round.name} yet.`);

    const settled = await PlayerStateService.settle(prisma, player.id, { markActive: false });
    const dto = toRoundPlayerDto(settled.player, settled.ruleset, settled.turns);
    return {
      roundName: round.name,
      displayName: dto.displayName,
      publicPimpId: dto.publicPimpId,
      profileUrl: playerUrl(dto.publicPimpId),
      cashCents: dto.resources.cashCents,
      netWorthCents: dto.netWorthCents,
      payoutPercent: dto.payoutPercent,
      turns: { turns: dto.turns.turns, cap: dto.turns.turnCap, nextTurnAt: dto.turns.nextTurnAt, perTick: dto.turns.turnsGeneratedNextTick },
      crew: {
        whores: dto.resources.whores,
        thugs: dto.resources.thugs,
        fitThugs: dto.resources.fitThugs,
        woundedThugs: dto.resources.woundedThugs,
        armedThugs: dto.resources.armedThugs,
      },
      weapons: { pistols: dto.resources.pistols, shotguns: dto.resources.shotguns, tek9s: dto.resources.tek9s, ak47s: dto.resources.ak47s },
      supplies: { condoms: dto.resources.condoms, medicine: dto.resources.medicine, crack: dto.resources.crack, beer: dto.resources.beer },
      lowRiders: dto.resources.lowRiders,
      happiness: { whore: dto.happiness.whore, thug: dto.happiness.thug },
      rank: { local: dto.rank.local, national: dto.rank.national },
    };
  },

  /** For the member's own private /link reply only: includes their account username. */
  async member(prisma: PrismaClient, discordId: string): Promise<DiscordMemberDto> {
    const account = await prisma.account.findFirst({
      where: { discordId, isActive: true },
      select: { id: true, username: true, forumLink: { select: { forumOrigin: true, forumUsername: true } } },
    });
    if (!account) return { linked: false, username: null, forumUsername: null, roundName: null, player: null, roles: [] };

    const round = await RoundService.getCurrent(prisma);
    const [player, roles] = await Promise.all([
      round ? prisma.roundPlayer.findFirst({ where: { roundId: round.id, accountId: account.id }, select: { displayName: true, publicPimpId: true } }) : null,
      DiscordBotService.rolesFor(prisma, [discordId]),
    ]);
    return {
      linked: true,
      username: account.username,
      forumUsername: env.forum.enabled && account.forumLink?.forumOrigin === env.forum.origin ? account.forumLink.forumUsername : null,
      roundName: round?.name ?? null,
      player: player ? { displayName: player.displayName, publicPimpId: player.publicPimpId, profileUrl: playerUrl(player.publicPimpId) } : null,
      roles: roles[discordId] ?? ['linked'],
    };
  },

  /** Game admins only (isAdmin on the linked account). The news channel picks it up automatically. */
  async createNews(
    prisma: PrismaClient,
    input: { discordId: string; title: string; body: string; pinned: boolean; scope: 'round' | 'global' },
  ): Promise<DiscordNewsCreatedDto> {
    const account = await findLinkedAccount(prisma, input.discordId);
    if (!account.isAdmin) throw AppError.forbidden('Only game admins can post news.');
    const round = input.scope === 'round' ? await RoundService.requireCurrent(prisma) : null;
    const news = await prisma.gameNews.create({
      data: { title: input.title, body: input.body, isPinned: input.pinned, roundId: round?.id ?? null, createdByAccountId: account.id },
    });
    return { id: news.id, title: news.title, url: gameUrl('/game/news'), roundName: round?.name ?? null };
  },

  /**
   * Published posts not yet sent to Discord, marked as sent before the bot posts
   * them: at most once, so a crash or restart never reposts. Oldest first.
   * Only one bot process should call this.
   */
  async claimNews(prisma: PrismaClient, limit = 5): Promise<DiscordNewsPostDto[]> {
    const round = await RoundService.getCurrent(prisma);
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const rows = await tx.gameNews.findMany({
        where: {
          discordPostedAt: null,
          publishedAt: { lte: now },
          OR: [{ roundId: null }, ...(round ? [{ roundId: round.id }] : [])],
        },
        include: { createdBy: { select: { username: true } } },
        orderBy: { publishedAt: 'asc' },
        take: limit,
      });
      if (!rows.length) return [];
      await tx.gameNews.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, discordPostedAt: null },
        data: { discordPostedAt: now },
      });
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        isPinned: row.isPinned,
        publishedAt: row.publishedAt.toISOString(),
        authorName: row.createdBy?.username ?? null,
        url: gameUrl('/game/news'),
      }));
    });
  },

  async alertSettings(prisma: PrismaClient, discordId: string): Promise<DiscordAlertSettingsDto> {
    const account = await findLinkedAccount(prisma, discordId);
    const [{ round, current }, row] = await Promise.all([
      currentStanding(prisma, account.id),
      prisma.discordReminder.findUnique({ where: { accountId: account.id } }),
    ]);
    return alertSettingsDto(row, round, current);
  },

  async setAlert(prisma: PrismaClient, discordId: string, type: DiscordAlertType, enabled: boolean): Promise<DiscordAlertSettingsDto> {
    const account = await findLinkedAccount(prisma, discordId);
    const { round, current } = await currentStanding(prisma, account.id);

    let data: Prisma.DiscordReminderUncheckedCreateWithoutAccountInput;
    switch (type) {
      case 'attacks':
        data = { attacksEnabled: enabled };
        break;
      case 'round':
        data = { roundEnabled: enabled };
        break;
      case 'rank':
        // Start from the current rank, so switching on never alerts about the past.
        data = {
          rankEnabled: enabled,
          rankRoundId: enabled && round && current ? round.id : null,
          rankLastNational: enabled && current ? current.nationalRank : null,
        };
        break;
      case 'turns':
        // Already full when switching on: the first reminder waits until they spend and refill.
        data = { turnsEnabled: enabled, turnsArmed: enabled && (current ? current.turns < current.cap : true) };
        break;
    }

    const row = await prisma.discordReminder.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, ...data },
      update: data,
    });
    return alertSettingsDto(row, round, current);
  },

  /** Everything due to announce, each handed out once: new battles, round events, rank drops and full turns. */
  async claimAlerts(prisma: PrismaClient): Promise<DiscordAlertsClaimDto> {
    const now = new Date();
    const [round, battles, rounds] = await Promise.all([
      RoundService.getCurrent(prisma),
      claimBattles(prisma, now),
      claimRoundEvents(prisma, now),
    ]);
    const player = round?.status === 'ACTIVE' ? await claimPlayerAlerts(prisma, round, now) : { turns: [], ranks: [] };
    return { ...player, battles, rounds };
  },
};
