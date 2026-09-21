import type { GameNews, PrismaClient } from '@prisma/client';
import type { AdminNewsDto, AdminNewsPostDto } from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { wakeDiscordBot } from './discord-bot-push.service.js';
import { forumDiscussionUrl, mirrorNewsToForum } from './forum-news.service.js';

const newsInclude = {
  round: { select: { name: true } },
  createdBy: { select: { username: true } },
} as const;

type NewsRow = GameNews & { round: { name: string } | null; createdBy: { username: string } | null };

function toAdminNewsPostDto(row: NewsRow): AdminNewsPostDto {
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
    forumDiscussionId: row.forumDiscussionId,
    forumUrl: row.forumDiscussionId ? forumDiscussionUrl(row.forumDiscussionId) : null,
    forumPostedAt: row.forumPostedAt?.toISOString() ?? null,
    forumError: row.forumError,
    updatedAt: row.updatedAt.toISOString(),
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
    const [rows, rounds] = await Promise.all([
      prisma.gameNews.findMany({ include: newsInclude, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: limit }),
      prisma.round.findMany({
        where: { status: { in: ['SCHEDULED', 'REGISTRATION', 'ACTIVE', 'ENDED'] } },
        orderBy: { startsAt: 'desc' },
        take: 20,
        select: { id: true, name: true, status: true },
      }),
    ]);
    return { posts: rows.map(toAdminNewsPostDto), rounds, forumMirrorEnabled: env.forum.news.enabled };
  },

  async create(
    prisma: PrismaClient,
    actor: AuditActor,
    input: { title: string; body: string; pinned: boolean; roundId: string | null; publishedAt?: Date | undefined; mirrorToForum: boolean },
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

  /** Edits the game copy only. A post already sent to Discord or the forum keeps its original text there. */
  async update(
    prisma: PrismaClient,
    actor: AuditActor,
    newsId: string,
    input: { title?: string | undefined; body?: string | undefined; pinned?: boolean | undefined },
  ): Promise<AdminNewsDto> {
    await prisma.$transaction(async (tx) => {
      const before = await tx.gameNews.findUnique({ where: { id: newsId } });
      if (!before) throw AppError.notFound('NEWS_NOT_FOUND', 'That news post does not exist.');
      const data = {
        ...(input.title !== undefined && input.title !== before.title ? { title: input.title } : {}),
        ...(input.body !== undefined && input.body !== before.body ? { body: input.body } : {}),
        ...(input.pinned !== undefined && input.pinned !== before.isPinned ? { isPinned: input.pinned } : {}),
      };
      if (!Object.keys(data).length) throw AppError.badRequest('NO_CHANGES', 'Nothing changed on that post.');
      const after = await tx.gameNews.update({ where: { id: before.id }, data });
      await AdminAuditService.record(tx, actor, { action: 'news.update', targetType: 'news', targetId: before.id, before, after });
    });
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

  async retryMirror(prisma: PrismaClient, actor: AuditActor, newsId: string): Promise<AdminNewsDto> {
    if (!env.forum.news.enabled) throw AppError.badRequest('FORUM_MIRROR_DISABLED', 'Forum mirroring is not configured on this server.');
    const row = await prisma.gameNews.findUnique({ where: { id: newsId }, select: { forumDiscussionId: true } });
    if (!row) throw AppError.notFound('NEWS_NOT_FOUND', 'That news post does not exist.');
    if (row.forumDiscussionId) throw AppError.conflict('NEWS_ALREADY_MIRRORED', 'That post is already on the forum.');
    await mirror(prisma, actor, newsId);
    return AdminNewsService.list(prisma);
  },
};
