import type { Account, BugReport, Prisma, PrismaClient } from '@prisma/client';
import {
  BUG_REPORT_CATEGORY_LABELS,
  type AdminReportSummaryDto,
  type BugReportCategory,
  type BugReportResolution,
  type BugReportSource,
} from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminModerationService } from './admin-moderation.service.js';
import { gameUrl } from './standings.js';

export type StaffPostKind =
  | 'BUG_REPORT'
  | 'BUG_REPORT_RESOLVED'
  | 'MESSAGE_REPORT'
  | 'MESSAGE_REPORT_RESOLVED'
  | 'PATCH_NOTES_HELD';

/** Each "resolved" kind edits the post its first kind made. */
const FIRST_POST: Partial<Record<StaffPostKind, StaffPostKind>> = {
  BUG_REPORT_RESOLVED: 'BUG_REPORT',
  MESSAGE_REPORT_RESOLVED: 'MESSAGE_REPORT',
};

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

/** A message report as the queue lists it: who reported whom and why, never the message. */
export type StaffMessageReportDto = AdminReportSummaryDto & { url: string };

export interface DiscordStaffPostDto {
  id: string;
  kind: StaffPostKind;
  /** The staff channel message to edit instead of posting a new one. */
  editMessageId: string | null;
  bugReport?: StaffBugReportDto;
  messageReport?: StaffMessageReportDto;
  patchNotes?: { id: string; title: string; body: string; publishedAt: string; url: string };
}

type Db = PrismaClient | Prisma.TransactionClient;

/** The active account behind a Discord user, for /bug and the staff buttons. */
export async function linkedDiscordAccount(prisma: PrismaClient, discordId: string): Promise<Pick<Account, 'id' | 'username' | 'isAdmin'>> {
  const account = await prisma.account.findFirst({ where: { discordId, isActive: true }, select: { id: true, username: true, isAdmin: true } });
  if (!account) throw AppError.notFound('DISCORD_NOT_LINKED', 'That Discord account is not linked to a StreetsEmpire account.');
  return account;
}

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

/** A message report for the staff channel; null once it is gone. */
export async function staffMessageReport(prisma: PrismaClient, reportId: string, now = new Date()): Promise<StaffMessageReportDto | null> {
  const report = await AdminModerationService.summary(prisma, reportId, now);
  return report ? { ...report, url: gameUrl('/game/admin/reports') } : null;
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
   * once, like news. Each is read fresh after the claim, so a deleted target is skipped.
   */
  async claim(prisma: PrismaClient, now = new Date(), limit = 10): Promise<DiscordStaffPostDto[]> {
    const rows = await prisma.$transaction(async (tx) => {
      const unclaimed = await tx.discordStaffPost.findMany({ where: { claimedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit });
      if (unclaimed.length) {
        await tx.discordStaffPost.updateMany({ where: { id: { in: unclaimed.map((row) => row.id) }, claimedAt: null }, data: { claimedAt: now } });
      }
      return unclaimed;
    });
    const posts: DiscordStaffPostDto[] = [];
    for (const row of rows) {
      if (now.getTime() - row.createdAt.getTime() > STAFF_POST_MAX_AGE_MS) continue;
      const kind = row.kind as StaffPostKind;
      let editMessageId: string | null = null;
      const firstKind = FIRST_POST[kind];
      if (firstKind) {
        const first = await prisma.discordStaffPost.findFirst({
          where: { kind: firstKind, targetId: row.targetId, messageId: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { messageId: true },
        });
        // Never posted (no staff channel then, or Discord refused it): nothing to update.
        if (!first?.messageId) continue;
        editMessageId = first.messageId;
      }
      if (kind === 'BUG_REPORT' || kind === 'BUG_REPORT_RESOLVED') {
        const report = await prisma.bugReport.findUnique({ where: { id: row.targetId } });
        if (report) posts.push({ id: row.id, kind, editMessageId, bugReport: staffBugReport(report) });
      } else if (kind === 'MESSAGE_REPORT' || kind === 'MESSAGE_REPORT_RESOLVED') {
        const report = await staffMessageReport(prisma, row.targetId, now);
        if (report) posts.push({ id: row.id, kind, editMessageId, messageReport: report });
      } else if (kind === 'PATCH_NOTES_HELD') {
        const news = await prisma.gameNews.findUnique({ where: { id: row.targetId } });
        // Already public, say after the staff channel was down past the hold: nothing left to review.
        if (!news || news.publishedAt <= now) continue;
        posts.push({
          id: row.id,
          kind,
          editMessageId: null,
          patchNotes: { id: news.id, title: news.title, body: news.body, publishedAt: news.publishedAt.toISOString(), url: gameUrl('/game/admin/news') },
        });
      }
    }
    return posts;
  },

  async posted(prisma: PrismaClient, postId: string, messageId: string): Promise<void> {
    await prisma.discordStaffPost.updateMany({ where: { id: postId }, data: { messageId, error: null } });
  },

  async failed(prisma: PrismaClient, postId: string, error: string): Promise<void> {
    await prisma.discordStaffPost.updateMany({ where: { id: postId }, data: { error: error.slice(0, 500) } });
  },
};
