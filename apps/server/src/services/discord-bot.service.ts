import { createHash, timingSafeEqual } from 'node:crypto';
import { RelocationService } from './relocation.service.js';
import type { PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type {
  DiscordAlertSettingsDto,
  DiscordAlertType,
  DiscordAlertsClaimDto,
  DiscordBadgesDto,
  DiscordBattleEventDto,
  DiscordCityDto,
  DiscordHallOfFameDto,
  DiscordHistoryDto,
  DiscordLeaderboardDto,
  DiscordLeaderboardStat,
  DiscordMemberDto,
  DiscordNewsCreatedDto,
  DiscordNewsPostDto,
  DiscordProfileCardDto,
  DiscordRankingEntryDto,
  DiscordRankingsDto,
  DiscordRoundEventDto,
  DiscordStatsDto,
  ForumGroupBadgeDto,
  PublicLegacyDto,
} from '@streets/shared';
import { env } from '../config/env.js';
import { toRoundPlayerDto } from '../game/dto.js';
import { AppError } from '../utils/errors.js';
import { CommunityService, legacyAchievements, loadLegacyByAccount, loadPublicContexts } from './community.service.js';
import { ForumGroupsService } from './forum-groups.service.js';
import { PlayerStateService } from './player-state.service.js';
import {
  battleEventDto,
  battleEventSelect,
  endedRoundsWhere,
  finalStandings,
  NotificationService,
  roundEventDto,
} from './notification.service.js';
import { RoundService } from './round.service.js';
import { competitionRanks, gameUrl, playerUrl, rankValues } from './standings.js';

/** Constant-time bearer check; hashing first makes the lengths equal. */
export function botTokenMatches(header: string | undefined, token: string): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(token));
}

/** Role keys the bot maps to Discord roles. Every linked, active account is at least "linked". */
export function roleKeysFor(input: {
  inRound: boolean;
  nationalRank: number | null;
  legacy: PublicLegacyDto;
  forumGroups: ForumGroupBadgeDto[];
  /** 0.3.0-C. The tag of the live alliance they are in this round. */
  allianceTag?: string | null;
}): string[] {
  const keys = ['linked'];
  if (input.inRound) keys.push('player');
  if (input.inRound && input.allianceTag) keys.push(`alliance:${input.allianceTag.toUpperCase()}`);
  if (input.nationalRank === 1) keys.push('national-1');
  if (input.nationalRank !== null && input.nationalRank <= 10) keys.push('top-10');
  for (const award of legacyAchievements(input.legacy)) if (award.unlocked) keys.push(award.key);
  for (const group of input.forumGroups) keys.push(`forum:${group.name}`);
  return keys;
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

/** New battles for the public raid feed, oldest first, marked as posted before the bot sends anything. */
async function claimBattles(prisma: PrismaClient, now: Date, limit = 25): Promise<DiscordBattleEventDto[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.raidBattle.findMany({
      where: { discordPostedAt: null, voidedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: battleEventSelect,
    });
    if (!rows.length) return [];
    await tx.raidBattle.updateMany({ where: { id: { in: rows.map((row) => row.id) }, discordPostedAt: null }, data: { discordPostedAt: now } });
    return rows.map(battleEventDto);
  });
}

/** Finished rounds for the public round-end post. Opening and ending-soon news reach players as alerts only. */
async function claimRoundEnds(prisma: PrismaClient, now: Date): Promise<DiscordRoundEventDto[]> {
  const rounds = await prisma.round.findMany({ where: endedRoundsWhere('discordEndedAt', now) });
  if (!rounds.length) return [];
  await prisma.round.updateMany({ where: { id: { in: rounds.map((round) => round.id) }, discordEndedAt: null }, data: { discordEndedAt: now } });
  const events: DiscordRoundEventDto[] = [];
  for (const round of rounds) events.push(roundEventDto('ended', round, (await finalStandings(prisma, round.id)).top));
  return events;
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
          select: { accountId: true, netWorthCents: true, alliance: { select: { tag: true, disbandedAt: true } } },
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
    const allianceByAccount = new Map(standings.map((row) => [row.accountId, row.alliance && !row.alliance.disbandedAt ? row.alliance.tag : null]));
    // Rank roles only mean something while the round is running.
    const ranked = round?.status === 'ACTIVE';

    return Object.fromEntries(accounts.map((account, index) => [
      account.discordId!,
      roleKeysFor({
        inRound: rankByAccount.has(account.id),
        nationalRank: ranked ? rankByAccount.get(account.id) ?? null : null,
        legacy: legacyByAccount.get(account.id) ?? emptyLegacy(),
        forumGroups: forumGroups[index]!,
        // Alliance roles only mean something while the round can still change.
        allianceTag: round && (round.status === 'ACTIVE' || round.status === 'REGISTRATION') ? allianceByAccount.get(account.id) ?? null : null,
      }),
    ]));
  },

  /** Live alliances in the current round. Empty once the round closes, so the bot retires their roles. */
  async alliances(prisma: PrismaClient): Promise<Array<{ tag: string; name: string }>> {
    const round = await RoundService.getCurrent(prisma);
    if (!round || (round.status !== 'ACTIVE' && round.status !== 'REGISTRATION')) return [];
    return prisma.alliance.findMany({ where: { roundId: round.id, disbandedAt: null }, select: { tag: true, name: true }, orderBy: { createdAt: 'asc' } });
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

    await RelocationService.settleDue(prisma, round.id, new Date());
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
    const dto = toRoundPlayerDto(settled.player, settled.ruleset, settled.turns, settled.products, settled.run, settled.moving);
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
      NotificationService.currentStanding(prisma, account.id),
      prisma.notificationSettings.findUnique({ where: { accountId: account.id } }),
    ]);
    return alertSettingsDto(row, round, current);
  },

  async setAlert(prisma: PrismaClient, discordId: string, type: DiscordAlertType, enabled: boolean): Promise<DiscordAlertSettingsDto> {
    const account = await findLinkedAccount(prisma, discordId);
    const standing = await NotificationService.currentStanding(prisma, account.id);
    const row = await NotificationService.setCategory(prisma, account.id, type, enabled, standing);
    return alertSettingsDto(row, standing.round, standing.current);
  },

  /**
   * Everything due to announce, each handed out once: the public raid feed and round-end
   * posts, plus DMs. Collecting first means a DM never waits for the server's own timer.
   */
  async claimAlerts(prisma: PrismaClient): Promise<DiscordAlertsClaimDto> {
    const now = new Date();
    await NotificationService.collect(prisma, now);
    const [battles, rounds, dms] = await Promise.all([
      claimBattles(prisma, now),
      claimRoundEnds(prisma, now),
      NotificationService.claimDiscord(prisma, now),
    ]);
    return { ...dms, battles, rounds };
  },
};
