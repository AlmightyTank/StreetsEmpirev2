import { createHash, timingSafeEqual } from 'node:crypto';
import type { PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound, regenerateTurns } from '@streets/rules-engine';
import type {
  DiscordBadgesDto,
  DiscordCityDto,
  DiscordHallOfFameDto,
  DiscordMemberDto,
  DiscordNewsPostDto,
  DiscordProfileCardDto,
  DiscordRankingEntryDto,
  DiscordRankingsDto,
  DiscordReminderStateDto,
  DiscordTurnReminderDto,
  ForumGroupBadgeDto,
  PublicLegacyDto,
} from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { CommunityService, legacyAchievements, loadLegacyByAccount } from './community.service.js';
import { ForumGroupsService } from './forum-groups.service.js';
import { RoundService } from './round.service.js';

/** Constant-time bearer check; hashing first makes the lengths equal. */
export function botTokenMatches(header: string | undefined, token: string): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(token));
}

/** Rankings-style ranks for rows already sorted by net worth, richest first: ties share a rank. */
export function competitionRanks(sortedDesc: Array<{ netWorthCents: bigint }>): number[] {
  const ranks: number[] = [];
  sortedDesc.forEach((row, index) => {
    const previous = sortedDesc[index - 1];
    ranks.push(previous && previous.netWorthCents === row.netWorthCents ? ranks[index - 1]! : index + 1);
  });
  return ranks;
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

const emptyLegacy = (): PublicLegacyDto => ({ roundsPlayed: 0, roundWins: 0, bestNationalRank: null, totalFinalNetWorthCents: 0 });

const notLinked = () => AppError.notFound('DISCORD_NOT_LINKED', 'That Discord account is not linked to a Street Empire account.');

type PlayerQuery = { discordId: string } | { name: string };

async function findRoundPlayer(prisma: PrismaClient, round: Round, query: PlayerQuery): Promise<{ publicPimpId: number }> {
  if ('discordId' in query) {
    const account = await prisma.account.findFirst({ where: { discordId: query.discordId, isActive: true }, select: { id: true } });
    if (!account) throw notLinked();
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

  /** Final national podiums of the most recently finished rounds. Deactivated accounts are left out. */
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

  async setTurnReminder(prisma: PrismaClient, discordId: string, enabled: boolean): Promise<DiscordReminderStateDto> {
    const account = await prisma.account.findFirst({ where: { discordId, isActive: true }, select: { id: true } });
    if (!account) throw notLinked();

    const round = await RoundService.getCurrent(prisma);
    const player = round
      ? await prisma.roundPlayer.findFirst({ where: { roundId: round.id, accountId: account.id }, select: { turns: true, lastTurnCalculationAt: true } })
      : null;
    const ruleset = round && player ? loadRulesetForRound(round) : null;
    const current = player && ruleset
      ? { turns: regenerateTurns(player, new Date(), ruleset).turns, cap: ruleset.turns.cap }
      : null;
    // Already full when switching on: the first reminder waits until they spend and refill.
    const armed = enabled && (current ? current.turns < current.cap : true);

    await prisma.discordReminder.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, turnsEnabled: enabled, turnsArmed: armed },
      update: { turnsEnabled: enabled, turnsArmed: armed },
    });
    return { turns: enabled, roundName: round?.name ?? null, current };
  },

  /** Due turn reminders, disarmed as they are handed out: at most one DM per refill. */
  async claimTurnReminders(prisma: PrismaClient): Promise<DiscordTurnReminderDto[]> {
    const round = await RoundService.getCurrent(prisma);
    if (!round || round.status !== 'ACTIVE') return [];

    const reminders = await prisma.discordReminder.findMany({
      where: { turnsEnabled: true, account: { isActive: true, discordId: { not: null } } },
      select: { accountId: true, turnsArmed: true, account: { select: { discordId: true } } },
    });
    if (!reminders.length) return [];

    const players = await prisma.roundPlayer.findMany({
      where: { roundId: round.id, accountId: { in: reminders.map((reminder) => reminder.accountId) } },
      select: { accountId: true, displayName: true, turns: true, lastTurnCalculationAt: true },
    });
    const playerByAccount = new Map(players.map((player) => [player.accountId, player]));
    const ruleset = loadRulesetForRound(round);
    const now = new Date();

    const arm: string[] = [];
    const due: Array<DiscordTurnReminderDto & { accountId: string }> = [];
    for (const reminder of reminders) {
      const player = playerByAccount.get(reminder.accountId);
      if (!player) continue;
      const turns = regenerateTurns(player, now, ruleset).turns;
      const decision = reminderDecision({ armed: reminder.turnsArmed, turns, cap: ruleset.turns.cap });
      if (decision === 'arm') arm.push(reminder.accountId);
      if (decision === 'notify') {
        due.push({
          accountId: reminder.accountId,
          discordId: reminder.account.discordId!,
          displayName: player.displayName,
          roundName: round.name,
          turns,
          cap: ruleset.turns.cap,
          url: gameUrl('/game'),
        });
      }
    }

    if (arm.length || due.length) {
      await prisma.$transaction([
        prisma.discordReminder.updateMany({ where: { accountId: { in: arm } }, data: { turnsArmed: true } }),
        prisma.discordReminder.updateMany({
          where: { accountId: { in: due.map((reminder) => reminder.accountId) }, turnsArmed: true },
          data: { turnsArmed: false, turnsLastSentAt: now },
        }),
      ]);
    }
    return due.map(({ accountId: _accountId, ...reminder }) => reminder);
  },
};
