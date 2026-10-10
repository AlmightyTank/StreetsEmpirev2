import type { DiscordBotStatus, GameNews, PrismaClient, Round } from '@prisma/client';
import type { AdminNewsDto, AdminNewsPostDto } from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { wakeDiscordBot } from './discord-bot-push.service.js';
import { forumDiscussionUrl, mirrorNewsToForum } from './forum-news.service.js';
import { RoundService } from './round.service.js';

const newsInclude = {
  round: { select: { name: true } },
  createdBy: { select: { username: true } },
} as const;

type NewsRow = GameNews & { round: { name: string } | null; createdBy: { username: string } | null };

/** The bot checks for news every minute by default; this long without a word means it is down. */
export const BOT_SILENT_AFTER_MS = 15 * 60_000;

type DiscordContext = { now: Date; botApiEnabled: boolean; currentRound: Pick<Round, 'id' | 'name'> | null; bot: DiscordBotStatus | null };

/** Why a post is not on Discord, in words an admin can act on; null once it is there. */
export function discordWaiting(row: Pick<GameNews, 'discordPostedAt' | 'discordError' | 'publishedAt' | 'roundId'> & { round: { name: string } | null }, context: DiscordContext): string | null {
  if (row.discordPostedAt) return null;
  if (row.discordError) return `Refused: ${row.discordError} Fix that, then resend it.`;
  if (!context.botApiEnabled) return 'The Discord bot API is off: set DISCORD_BOT_API_TOKEN on the game server and restart it.';
  if (row.publishedAt > context.now) return 'Scheduled: Discord gets it once it is published.';
  if (row.roundId && row.roundId !== context.currentRound?.id) {
    return `Only news for every round or the current round${context.currentRound ? ` (${context.currentRound.name})` : ''} goes to Discord, and this post is for ${row.round?.name ?? 'another round'}.`;
  }
  if (!context.bot) return 'The bot has never checked in. Make sure it is running the latest code (scripts/ops/deploy.sh) with the same DISCORD_BOT_API_TOKEN as the game server.';
  const silentMs = context.now.getTime() - context.bot.lastSeenAt.getTime();
  if (silentMs > BOT_SILENT_AFTER_MS) {
    return `The bot has not checked in for ${Math.round(silentMs / 60_000)} minutes. Check that it is running: journalctl -u streets-empire-bot.`;
  }
  if (context.bot.problem) return `The bot cannot post news: ${context.bot.problem}`;
  return 'Waiting for the bot to pick it up. It checks every minute.';
}

function toAdminNewsPostDto(row: NewsRow, context: DiscordContext): AdminNewsPostDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isPinned: row.isPinned,
    publishedAt: row.publishedAt.toISOString(),
    roundId: row.roundId,
    roundName: row.round?.name ?? null,
    authorName: row.createdBy?.username ?? null,
    discordPostedAt: row.discordPostedAt?.toISOString() ?? null,
    discordError: row.discordError,
    discordWaiting: discordWaiting(row, context),
    forumDiscussionId: row.forumDiscussionId,
    forumUrl: row.forumDiscussionId ? forumDiscussionUrl(row.forumDiscussionId) : null,
    forumPostedAt: row.forumPostedAt?.toISOString() ?? null,
    forumError: row.forumError,
    updatedAt: row.updatedAt.toISOString(),
    broadcast: row.broadcast,
    broadcastAt: row.broadcastAt?.toISOString() ?? null,
  };
}

/** Mirror after the post has committed, so a slow or failing forum never blocks or undoes it. */
async function mirror(prisma: PrismaClient, actor: AuditActor, newsId: string): Promise<void> {
  const row = await prisma.gameNews.findUnique({ where: { id: newsId } });
  if (!row) return;
  const result = await mirrorNewsToForum({ title: row.title, body: row.body });
  await prisma.$transaction(async (tx) => {
    const after = await tx.gameNews.update({
      where: { id: newsId },
      data: result.ok
        ? { forumDiscussionId: result.discussionId, forumPostedAt: new Date(), forumError: null }
        : { forumError: result.error },
    });
    await AdminAuditService.record(tx, actor, {
      action: result.ok ? 'news.forum-mirror' : 'news.forum-mirror-failed',
      targetType: 'news',
      targetId: newsId,
      reason: result.ok ? null : result.error,
      before: { forumDiscussionId: row.forumDiscussionId, forumError: row.forumError },
      after: { forumDiscussionId: after.forumDiscussionId, forumError: after.forumError },
    });
  });
}

export const AdminNewsService = {
  async list(prisma: PrismaClient, limit = 50): Promise<AdminNewsDto> {
    const now = new Date();
    const [rows, rounds, currentRound, bot] = await Promise.all([
      prisma.gameNews.findMany({ include: newsInclude, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: limit }),
      prisma.round.findMany({
        where: { status: { in: ['SCHEDULED', 'REGISTRATION', 'ACTIVE', 'ENDED'] } },
        orderBy: { startsAt: 'desc' },
        take: 20,
        select: { id: true, name: true, status: true },
      }),
      RoundService.getCurrent(prisma, now),
      prisma.discordBotStatus.findUnique({ where: { id: 'news' } }),
    ]);
    const context: DiscordContext = { now, botApiEnabled: env.discordBot.enabled, currentRound, bot };
    return {
      posts: rows.map((row) => toAdminNewsPostDto(row, context)),
      rounds,
      forumMirrorEnabled: env.forum.news.enabled,
      discordBot: bot ? { lastSeenAt: bot.lastSeenAt.toISOString(), channel: bot.channel, problem: bot.problem } : null,
    };
  },

  async create(
    prisma: PrismaClient,
    actor: AuditActor,
    input: { title: string; body: string; pinned: boolean; roundId: string | null; publishedAt?: Date | undefined; mirrorToForum: boolean; broadcast?: boolean | undefined },
  ): Promise<AdminNewsDto> {
    if (input.mirrorToForum && !env.forum.news.enabled) {
      throw AppError.badRequest('FORUM_MIRROR_DISABLED', 'Forum mirroring is not configured on this server.', { mirrorToForum: 'Not configured.' });
    }
    const created = await prisma.$transaction(async (tx) => {
      if (input.roundId && !(await tx.round.findUnique({ where: { id: input.roundId }, select: { id: true } }))) {
        throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
      }
      const row = await tx.gameNews.create({
        data: {
          title: input.title,
          body: input.body,
          isPinned: input.pinned,
          roundId: input.roundId,
          createdByAccountId: actor.id,
          broadcast: input.broadcast ?? false,
          ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
        },
      });
      await AdminAuditService.record(tx, actor, { action: 'news.create', targetType: 'news', targetId: row.id, after: row });
      return row;
    });
    wakeDiscordBot('news');
    if (input.mirrorToForum) await mirror(prisma, actor, created.id);
    return AdminNewsService.list(prisma);
  },

  /**
   * Edits the game copy only. A post already sent to Discord or the forum keeps its original text there.
   * publishNow releases a scheduled post, such as held deploy patch notes, to players and Discord at once.
   */
  async update(
    prisma: PrismaClient,
    actor: AuditActor,
    newsId: string,
    input: { title?: string | undefined; body?: string | undefined; pinned?: boolean | undefined; publishNow?: true | undefined },
  ): Promise<AdminNewsDto> {
    const now = new Date();
    const published = await prisma.$transaction(async (tx) => {
      const before = await tx.gameNews.findUnique({ where: { id: newsId } });
      if (!before) throw AppError.notFound('NEWS_NOT_FOUND', 'That news post does not exist.');
      if (input.publishNow && before.publishedAt <= now) throw AppError.conflict('NEWS_ALREADY_PUBLISHED', 'That post is already published.');
      const data = {
        ...(input.title !== undefined && input.title !== before.title ? { title: input.title } : {}),
        ...(input.body !== undefined && input.body !== before.body ? { body: input.body } : {}),
        ...(input.pinned !== undefined && input.pinned !== before.isPinned ? { isPinned: input.pinned } : {}),
        ...(input.publishNow ? { publishedAt: now } : {}),
      };
      if (!Object.keys(data).length) throw AppError.badRequest('NO_CHANGES', 'Nothing changed on that post.');
      const after = await tx.gameNews.update({ where: { id: before.id }, data });
      await AdminAuditService.record(tx, actor, { action: input.publishNow ? 'news.publish-now' : 'news.update', targetType: 'news', targetId: before.id, before, after });
      return Boolean(input.publishNow);
    });
    if (published) wakeDiscordBot('news');
    return AdminNewsService.list(prisma);
  },

  /** Removes the post from the game. Copies already sent to Discord or the forum stay there. */
  async remove(prisma: PrismaClient, actor: AuditActor, newsId: string, reason: string): Promise<AdminNewsDto> {
    await prisma.$transaction(async (tx) => {
      const before = await tx.gameNews.findUnique({ where: { id: newsId } });
      if (!before) throw AppError.notFound('NEWS_NOT_FOUND', 'That news post does not exist.');
      await tx.gameNews.delete({ where: { id: before.id } });
      await AdminAuditService.record(tx, actor, { action: 'news.delete', targetType: 'news', targetId: before.id, reason, before });
    });
    return AdminNewsService.list(prisma);
  },

  /** Queue the post for Discord again: after Discord refused it, or to repost one that never showed up. */
  async resendDiscord(prisma: PrismaClient, actor: AuditActor, newsId: string): Promise<AdminNewsDto> {
    if (!env.discordBot.enabled) {
      throw AppError.badRequest('DISCORD_BOT_DISABLED', 'The Discord bot API is not configured on this server, so nothing would pick the post up.');
    }
    await prisma.$transaction(async (tx) => {
      const before = await tx.gameNews.findUnique({ where: { id: newsId } });
      if (!before) throw AppError.notFound('NEWS_NOT_FOUND', 'That news post does not exist.');
      if (!before.discordPostedAt && !before.discordError) {
        throw AppError.conflict('NEWS_DISCORD_PENDING', 'That post is already waiting for Discord.');
      }
      await tx.gameNews.update({ where: { id: newsId }, data: { discordPostedAt: null, discordError: null } });
      await AdminAuditService.record(tx, actor, {
        action: 'news.discord-resend',
        targetType: 'news',
        targetId: newsId,
        before: { discordPostedAt: before.discordPostedAt, discordError: before.discordError },
        after: { discordPostedAt: null, discordError: null },
      });
    });
    wakeDiscordBot('news');
    return AdminNewsService.list(prisma);
  },

  async retryMirror(prisma: PrismaClient, actor: AuditActor, newsId: string): Promise<AdminNewsDto> {
    if (!env.forum.news.enabled) throw AppError.badRequest('FORUM_MIRROR_DISABLED', 'Forum mirroring is not configured on this server.');
    const row = await prisma.gameNews.findUnique({ where: { id: newsId }, select: { forumDiscussionId: true } });
    if (!row) throw AppError.notFound('NEWS_NOT_FOUND', 'That news post does not exist.');
    if (row.forumDiscussionId) throw AppError.conflict('NEWS_ALREADY_MIRRORED', 'That post is already on the forum.');
    await mirror(prisma, actor, newsId);
    return AdminNewsService.list(prisma);
  },
};
