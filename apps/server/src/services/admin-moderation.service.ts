import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  AdminReportDetailDto,
  AdminReportQueueDto,
  AdminReportResolution,
  AdminReportStatus,
  AdminReportSummaryDto,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { AdminAccountService, toCommsMuteDto } from './admin-account.service.js';
import { commsMuted } from './communication-guard.js';
import { wakeDiscordBot } from './discord-bot-push.service.js';
import { DiscordStaffService, linkedDiscordAccount } from './discord-staff.service.js';

/**
 * 0.9.0-H. The reports queue.
 *
 * Admins see who reported what and why, but never message text in the queue.
 * Opening a report is a deliberate, audited act that shows the reported message
 * and at most a few messages either side of it in the same two-player thread.
 * There is no way to browse a conversation that nobody reported.
 */
export const REPORT_PAGE_SIZE = 25;
export const CONTEXT_BEFORE = 5;
export const CONTEXT_AFTER = 2;

const partySelect = {
  publicPimpId: true,
  displayName: true,
  accountId: true,
  account: { select: { username: true, commsMutedUntil: true, commsMutedPermanent: true } },
} as const;

const reportInclude = {
  reporter: { select: { username: true } },
  message: {
    select: {
      id: true,
      createdAt: true,
      senderId: true,
      recipientId: true,
      round: { select: { name: true } },
      sender: { select: partySelect },
      recipient: { select: partySelect },
      _count: { select: { reports: true } },
    },
  },
} satisfies Prisma.PlayerMessageReportInclude;

type ReportRow = Prisma.PlayerMessageReportGetPayload<{ include: typeof reportInclude }>;

function party(row: ReportRow['message']['sender']) {
  return { accountId: row.accountId, username: row.account.username, displayName: row.displayName, publicPimpId: row.publicPimpId };
}

async function openAgainst(prisma: PrismaClient, accountIds: string[]): Promise<Map<string, number>> {
  if (!accountIds.length) return new Map();
  const rows = await prisma.playerMessageReport.findMany({
    where: { resolvedAt: null, message: { sender: { accountId: { in: accountIds } } } },
    select: { message: { select: { sender: { select: { accountId: true } } } } },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row.message.sender.accountId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function summary(row: ReportRow, against: Map<string, number>, now: Date): AdminReportSummaryDto {
  return {
    id: row.id,
    source: row.source === 'AUTO' ? 'AUTO' : 'PLAYER',
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    reporterUsername: row.reporter?.username ?? null,
    roundName: row.message.round.name,
    messageId: row.message.id,
    messageAt: row.message.createdAt.toISOString(),
    sender: party(row.message.sender),
    recipient: party(row.message.recipient),
    reportsOnMessage: row.message._count.reports,
    openAgainstSender: against.get(row.message.sender.accountId) ?? 0,
    senderRestricted: commsMuted(row.message.sender.account, now),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByUsername: row.resolvedByUsername,
    resolution: row.resolution === 'DISMISSED' || row.resolution === 'ACTIONED' ? row.resolution : null,
    resolutionNote: row.resolutionNote,
  };
}

/** What the Discord staff buttons on a message report can do. */
export type DiscordReportAction = 'mute-1d' | 'dismiss';

/**
 * Close a report and every other open report or flag on the same message, in
 * the caller's transaction. Refuses a report someone else closed first, even
 * one closed while this was waiting on its rows.
 */
async function closeReport(
  tx: Db,
  actor: AuditActor,
  reportId: string,
  resolution: AdminReportResolution,
  note: string,
  now: Date,
): Promise<{ senderAccountId: string }> {
  const row = await tx.playerMessageReport.findUnique({
    where: { id: reportId },
    select: { id: true, messageId: true, resolvedAt: true, message: { select: { sender: { select: { accountId: true } } } } },
  });
  if (!row) throw AppError.notFound('REPORT_NOT_FOUND', 'That report does not exist.');
  if (row.resolvedAt) throw AppError.conflict('REPORT_RESOLVED', 'Another admin already resolved that report.');
  const closing = await tx.playerMessageReport.findMany({ where: { messageId: row.messageId, resolvedAt: null }, select: { id: true } });
  const { count } = await tx.playerMessageReport.updateMany({
    where: { messageId: row.messageId, resolvedAt: null },
    data: { resolvedAt: now, resolvedByUsername: actor.username, resolution, resolutionNote: note },
  });
  if (!count) throw AppError.conflict('REPORT_RESOLVED', 'Another admin already resolved that report.');
  // Every closed report's staff post says so, not just this one's.
  for (const closed of closing) await DiscordStaffService.queue(tx, 'MESSAGE_REPORT_RESOLVED', closed.id);
  await AdminAuditService.record(tx, actor, {
    action: 'report.resolve',
    targetType: 'message-report',
    targetId: row.id,
    reason: note,
    before: { resolvedAt: null },
    after: { resolution, messageId: row.messageId, reportsClosed: count },
  });
  return { senderAccountId: row.message.sender.accountId };
}

export const AdminModerationService = {
  /**
   * One report as the queue lists it, for the staff channel: who reported whom
   * and why, never the message text. Null when the report is gone.
   */
  async summary(prisma: PrismaClient, reportId: string, now = new Date()): Promise<AdminReportSummaryDto | null> {
    const row = await prisma.playerMessageReport.findUnique({ where: { id: reportId }, include: reportInclude });
    if (!row) return null;
    return summary(row, await openAgainst(prisma, [row.message.sender.accountId]), now);
  },

  async queue(prisma: PrismaClient, status: AdminReportStatus, requestedPage = 1, now = new Date()): Promise<AdminReportQueueDto> {
    const where: Prisma.PlayerMessageReportWhereInput = status === 'open' ? { resolvedAt: null } : { resolvedAt: { not: null } };
    const [open, resolved] = await Promise.all([
      prisma.playerMessageReport.count({ where: { resolvedAt: null } }),
      prisma.playerMessageReport.count({ where: { resolvedAt: { not: null } } }),
    ]);
    const total = status === 'open' ? open : resolved;
    const totalPages = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    const rows = await prisma.playerMessageReport.findMany({
      where,
      // Open: oldest first, so nothing waits forever. Resolved: newest decisions first.
      orderBy: status === 'open' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ resolvedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * REPORT_PAGE_SIZE,
      take: REPORT_PAGE_SIZE,
      include: reportInclude,
    });
    const against = await openAgainst(prisma, [...new Set(rows.map((row) => row.message.sender.accountId))]);
    return {
      status,
      page,
      totalPages,
      total,
      counts: { open, resolved },
      reports: rows.map((row) => summary(row, against, now)),
    };
  },

  /** Open one report: the reported message and a little of its thread, audited. */
  async open(prisma: PrismaClient, actor: AuditActor, reportId: string, now = new Date()): Promise<AdminReportDetailDto> {
    const row = await prisma.playerMessageReport.findUnique({ where: { id: reportId }, include: reportInclude });
    if (!row) throw AppError.notFound('REPORT_NOT_FOUND', 'That report does not exist.');
    const { senderId, recipientId, createdAt, id: messageId } = row.message;
    const pair: Prisma.DirectMessageWhereInput = {
      OR: [{ senderId, recipientId }, { senderId: recipientId, recipientId: senderId }],
    };
    const [reported, before, after, beforeTotal, afterTotal, reportedIds, sender] = await Promise.all([
      prisma.directMessage.findUniqueOrThrow({ where: { id: messageId } }),
      prisma.directMessage.findMany({
        where: { ...pair, createdAt: { lt: createdAt } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: CONTEXT_BEFORE,
      }),
      prisma.directMessage.findMany({
        where: { ...pair, createdAt: { gt: createdAt } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: CONTEXT_AFTER,
      }),
      prisma.directMessage.count({ where: { ...pair, createdAt: { lt: createdAt } } }),
      prisma.directMessage.count({ where: { ...pair, createdAt: { gt: createdAt } } }),
      prisma.playerMessageReport.findMany({ where: { message: pair }, select: { messageId: true } }),
      prisma.account.findUniqueOrThrow({ where: { id: row.message.sender.accountId } }),
    ]);
    const flagged = new Set(reportedIds.map((entry) => entry.messageId));
    const thread = [...before.reverse(), reported, ...after].map((message) => ({
      id: message.id,
      fromSender: message.senderId === senderId,
      subject: message.subject,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      reported: flagged.has(message.id),
    }));

    await AdminAuditService.record(prisma, actor, {
      action: 'report.view',
      targetType: 'message-report',
      targetId: row.id,
      reason: row.reason.slice(0, 500),
      before: null,
      after: { messageId, messagesShown: thread.length, sender: row.message.sender.displayName, recipient: row.message.recipient.displayName },
    });

    const against = await openAgainst(prisma, [row.message.sender.accountId]);
    return {
      report: summary(row, against, now),
      thread,
      omitted: { before: beforeTotal - before.length, after: afterTotal - after.length },
      senderComms: toCommsMuteDto(sender, now),
    };
  },

  /**
   * Resolve a report. Every other open report or flag on the same message is
   * closed with it: they are about the same words. Punishment is a separate,
   * audited account action (mute, suspend), never a side effect of resolving.
   */
  async resolve(
    prisma: PrismaClient,
    actor: AuditActor,
    reportId: string,
    resolution: AdminReportResolution,
    note: string,
    now = new Date(),
  ): Promise<AdminReportQueueDto> {
    await prisma.$transaction((tx) => closeReport(tx, actor, reportId, resolution, note, now));
    wakeDiscordBot('staff');
    return AdminModerationService.queue(prisma, 'open', 1, now);
  },

  /**
   * A staff button in Discord, for linked game admins only. Muting closes the report
   * as actioned and is still its own audited account action, in the same transaction;
   * a longer mute the sender already has is kept, never cut to a day. Dismissing just
   * closes it. Neither shows the message, which stays behind the audited open.
   */
  async actFromDiscord(
    prisma: PrismaClient,
    discordId: string,
    reportId: string,
    action: DiscordReportAction,
    note: string,
    now = new Date(),
  ): Promise<void> {
    const actor = await linkedDiscordAccount(prisma, discordId);
    if (!actor.isAdmin) throw AppError.forbidden('Only game admins can act on reports.');
    // Closing first claims the report: a second admin acting on it at the same time
    // waits on its rows, then finds it closed, so nobody is muted on a report that
    // ends up dismissed. A mute that fails rolls the close back with it.
    await prisma.$transaction(async (tx) => {
      const { senderAccountId } = await closeReport(tx, actor, reportId, action === 'mute-1d' ? 'ACTIONED' : 'DISMISSED', note, now);
      if (action === 'mute-1d') await AdminAccountService.muteCommsWithin(tx, actor, senderAccountId, '1d', note, now);
    });
    wakeDiscordBot('staff');
  },
};
