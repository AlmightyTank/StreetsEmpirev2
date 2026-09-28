import type { Account, BugReport, Prisma, PrismaClient, Session } from '@prisma/client';
import {
  APP_VERSION,
  BUG_REPORTS_PER_HOUR,
  type AdminBugReportDto,
  type AdminBugReportQueueDto,
  type AdminBugReportStatus,
  type BugReportCategory,
  type BugReportInput,
  type BugReportResolution,
} from '@streets/shared';
import { verifyPassword } from '../auth/password.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';

export const BUG_REPORT_PAGE_SIZE = 25;

function toBugReportDto(row: BugReport): AdminBugReportDto {
  return {
    id: row.id,
    accountId: row.accountId,
    username: row.username,
    category: row.category as BugReportCategory,
    summary: row.summary,
    details: row.details,
    pagePath: row.pagePath,
    userAgent: row.userAgent,
    appVersion: row.appVersion,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByUsername: row.resolvedByUsername,
    resolution: (row.resolution as BugReportResolution | null) ?? null,
    resolutionNote: row.resolutionNote,
  };
}

/** rc.2. Bugs players report from the game, and the admin queue that works through them. */
export const BugReportService = {
  async create(
    prisma: PrismaClient,
    account: Pick<Account, 'id' | 'username'>,
    input: BugReportInput,
    meta: { userAgent?: string | undefined },
    now = new Date(),
  ): Promise<{ ok: true; id: string; message: string }> {
    const recent = await prisma.bugReport.count({
      where: { accountId: account.id, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    if (recent >= BUG_REPORTS_PER_HOUR) {
      throw AppError.tooManyRequests('BUG_REPORT_LIMIT', `That is ${BUG_REPORTS_PER_HOUR} reports this hour. Thank you; send the rest a little later.`);
    }
    const row = await prisma.bugReport.create({
      data: {
        accountId: account.id,
        username: account.username,
        category: input.category,
        summary: input.summary,
        details: input.details,
        pagePath: input.pagePath?.slice(0, 200) ?? null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        appVersion: APP_VERSION,
      },
    });
    return { ok: true, id: row.id, message: 'Thanks. Staff read every report, and the page you were on went with it.' };
  },

  async queue(prisma: PrismaClient, status: AdminBugReportStatus, requestedPage = 1): Promise<AdminBugReportQueueDto> {
    const where: Prisma.BugReportWhereInput = status === 'open' ? { resolvedAt: null } : { resolvedAt: { not: null } };
    const [open, resolved] = await Promise.all([
      prisma.bugReport.count({ where: { resolvedAt: null } }),
      prisma.bugReport.count({ where: { resolvedAt: { not: null } } }),
    ]);
    const total = status === 'open' ? open : resolved;
    const totalPages = Math.max(1, Math.ceil(total / BUG_REPORT_PAGE_SIZE));
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    const rows = await prisma.bugReport.findMany({
      where,
      // Open: oldest first, so nothing waits forever. Resolved: newest decisions first.
      orderBy: status === 'open' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ resolvedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * BUG_REPORT_PAGE_SIZE,
      take: BUG_REPORT_PAGE_SIZE,
    });
    return { status, page, totalPages, total, counts: { open, resolved }, reports: rows.map(toBugReportDto) };
  },

  async resolve(
    prisma: PrismaClient,
    actor: AuditActor,
    reportId: string,
    resolution: BugReportResolution,
    note: string,
    now = new Date(),
  ): Promise<AdminBugReportQueueDto> {
    await prisma.$transaction(async (tx) => {
      const before = await tx.bugReport.findUnique({ where: { id: reportId } });
      if (!before) throw AppError.notFound('BUG_REPORT_NOT_FOUND', 'That bug report does not exist.');
      const claimed = await tx.bugReport.updateMany({
        where: { id: reportId, resolvedAt: null },
        data: { resolvedAt: now, resolvedByUsername: actor.username, resolution, resolutionNote: note },
      });
      if (claimed.count !== 1) throw AppError.conflict('BUG_REPORT_RESOLVED', 'Another admin already resolved that report.');
      await AdminAuditService.record(tx, actor, {
        action: 'bug-report.resolve',
        targetType: 'bug-report',
        targetId: reportId,
        reason: note,
        before: { summary: before.summary, reporter: before.username },
        after: { resolution },
      });
    });
    return BugReportService.queue(prisma, 'open');
  },
};

/** rc.2. A player closes their own account: the same shutdown as a staff deactivation, recorded as theirs. */
export const AccountClosureService = {
  async close(
    prisma: PrismaClient,
    account: Account,
    session: Pick<Session, 'method'>,
    currentPassword: string | undefined,
    now = new Date(),
  ): Promise<void> {
    if (account.isAdmin) {
      throw AppError.conflict('ADMIN_CLOSE', 'Admins cannot close their own account. Have the admin role removed first.');
    }
    // A Discord sign-in is its own proof; a Discord-made account never chose a password.
    if (session.method !== 'DISCORD' || currentPassword) {
      const ok = currentPassword ? await verifyPassword(account.passwordHash, currentPassword) : false;
      if (!ok) {
        throw AppError.badRequest('CURRENT_PASSWORD_INVALID', 'That password does not match.', {
          currentPassword: 'Enter your password.',
        });
      }
    }
    await prisma.$transaction(async (tx) => {
      const closed = await tx.account.updateMany({
        where: { id: account.id, isActive: true },
        data: { isActive: false, closedAt: now },
      });
      if (closed.count !== 1) throw AppError.conflict('ACCOUNT_INACTIVE', 'This account is already closed.');
      const { count } = await tx.session.deleteMany({ where: { accountId: account.id } });
      await AdminAuditService.record(tx, { id: account.id, username: account.username }, {
        action: 'account.self-close',
        targetType: 'account',
        targetId: account.id,
        reason: 'Closed by the player in account settings.',
        before: { isActive: true },
        after: { isActive: false, sessionsRevoked: count },
      });
    });
  },
};
