import type { BugReport, Prisma, PrismaClient } from '@prisma/client';
import { BUG_REPORT_CATEGORY_LABELS, type BugReportCategory, type BugReportResolution, type BugReportSource } from '@streets/shared';
import { env } from '../config/env.js';
import { gameUrl } from './standings.js';

export type StaffPostKind = 'BUG_REPORT' | 'BUG_REPORT_RESOLVED' | 'PATCH_NOTES_HELD';

/**
 * A post the bot first sees this long after it was queued is dropped instead of
 * posted, so a staff channel set up months later starts fresh instead of flooding.
 */
export const STAFF_POST_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export interface StaffBugReportDto {
  id: string;
  category: string;
  summary: string;
  details: string;
  username: string;
  source: BugReportSource;
  pagePath: string | null;
  appVersion: string | null;
  createdAt: string;
  resolution: BugReportResolution | null;
  resolvedByUsername: string | null;
  resolvedAt: string | null;
  url: string;
}

export interface DiscordStaffPostDto {
  id: string;
  kind: StaffPostKind;
  /** The staff channel message to edit instead of posting a new one. */
  editMessageId: string | null;
  bugReport?: StaffBugReportDto;
  patchNotes?: { id: string; title: string; body: string; publishedAt: string; url: string };
}

type Db = PrismaClient | Prisma.TransactionClient;

/** A bug report as the staff channel shows it. */
export function staffBugReport(row: BugReport): StaffBugReportDto {
  return {
    id: row.id,
    category: BUG_REPORT_CATEGORY_LABELS[row.category as BugReportCategory] ?? row.category,
    summary: row.summary,
    details: row.details,
    username: row.username,
    source: row.source === 'DISCORD' ? 'DISCORD' : 'GAME',
    pagePath: row.pagePath,
    appVersion: row.appVersion,
    createdAt: row.createdAt.toISOString(),
    resolution: (row.resolution as BugReportResolution | null) ?? null,
    resolvedByUsername: row.resolvedByUsername,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    url: gameUrl('/game/admin/bugs'),
  };
}

/** The staff channel half of the Discord bot API: what to post, and what happened to it. */
export const DiscordStaffService = {
  /** Queue a staff channel post. Nothing is queued while the bot API is off, so nothing piles up. */
  async queue(db: Db, kind: StaffPostKind, targetId: string): Promise<void> {
    if (!env.discordBot.enabled) return;
    await db.discordStaffPost.create({ data: { kind, targetId } });
  },

  /**
   * Unclaimed posts, oldest first, marked claimed before the bot sends them: at most
   * once, like news. Each is read fresh, so a deleted report or post is skipped.
   */
  async claim(prisma: PrismaClient, now = new Date(), limit = 10): Promise<DiscordStaffPostDto[]> {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.discordStaffPost.findMany({ where: { claimedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit });
      if (!rows.length) return [];
      await tx.discordStaffPost.updateMany({ where: { id: { in: rows.map((row) => row.id) }, claimedAt: null }, data: { claimedAt: now } });
      const posts: DiscordStaffPostDto[] = [];
      for (const row of rows) {
        if (now.getTime() - row.createdAt.getTime() > STAFF_POST_MAX_AGE_MS) continue;
        const kind = row.kind as StaffPostKind;
        if (kind === 'BUG_REPORT' || kind === 'BUG_REPORT_RESOLVED') {
          const report = await tx.bugReport.findUnique({ where: { id: row.targetId } });
          if (!report) continue;
          let editMessageId: string | null = null;
          if (kind === 'BUG_REPORT_RESOLVED') {
            const first = await tx.discordStaffPost.findFirst({
              where: { kind: 'BUG_REPORT', targetId: row.targetId, messageId: { not: null } },
              orderBy: { createdAt: 'desc' },
              select: { messageId: true },
            });
            // Never posted (no staff channel then, or Discord refused it): nothing to update.
            if (!first?.messageId) continue;
            editMessageId = first.messageId;
          }
          posts.push({ id: row.id, kind, editMessageId, bugReport: staffBugReport(report) });
        } else if (kind === 'PATCH_NOTES_HELD') {
          const news = await tx.gameNews.findUnique({ where: { id: row.targetId } });
          if (!news) continue;
          posts.push({
            id: row.id,
            kind,
            editMessageId: null,
            patchNotes: { id: news.id, title: news.title, body: news.body, publishedAt: news.publishedAt.toISOString(), url: gameUrl('/game/admin/news') },
          });
        }
      }
      return posts;
    });
  },

  async posted(prisma: PrismaClient, postId: string, messageId: string): Promise<void> {
    await prisma.discordStaffPost.updateMany({ where: { id: postId }, data: { messageId, error: null } });
  },

  async failed(prisma: PrismaClient, postId: string, error: string): Promise<void> {
    await prisma.discordStaffPost.updateMany({ where: { id: postId }, data: { error: error.slice(0, 500) } });
  },
};
