import type { Account, AdminAuditLog, Prisma, PrismaClient } from '@prisma/client';
import type { AdminAuditEntryDto, AdminAuditLogDto, AdminAuditPurgeResultDto, AdminAuditRetentionDto } from '@streets/shared';
import { AUDIT_EXPORT_MAX_ROWS } from '@streets/shared';
import { env } from '../config/env.js';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export type AuditActor = Pick<Account, 'id' | 'username'>;

export interface AuditInput {
  /** Dotted verb, e.g. round.schedule. */
  action: string;
  targetType: string;
  targetId: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface AuditListOptions {
  limit?: number | undefined;
  actor?: string | undefined;
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  before?: string | undefined;
}

/** JSON-safe copy of a row: dates become ISO strings and bigints become strings. */
export function auditSnapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value, (_key, field: unknown) => (typeof field === 'bigint' ? field.toString() : field))) as Prisma.InputJsonValue;
}

/** The filters, as one Prisma condition shared by the list and the export. */
export function auditWhere(options: AuditListOptions): Prisma.AdminAuditLogWhereInput {
  return {
    AND: [
      options.targetType ? { targetType: options.targetType } : {},
      options.targetId ? { targetId: options.targetId } : {},
      options.action ? { action: { startsWith: options.action } } : {},
      options.actor ? { actorUsername: { contains: options.actor, mode: 'insensitive' } } : {},
      options.from || options.to
        ? { createdAt: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
        : {},
    ],
  };
}

/** The oldest entry a purge would keep, or null when history is kept forever. */
export function retentionCutoff(now = new Date(), days = env.auditRetentionDays): Date | null {
  return days > 0 ? new Date(now.getTime() - days * 24 * 60 * 60_000) : null;
}

/** What a purge takes: everything past the window except the record of past purges. */
function purgeWhere(cutoff: Date): Prisma.AdminAuditLogWhereInput {
  return { createdAt: { lt: cutoff }, action: { not: 'audit.purge' } };
}

export function toAuditEntryDto(row: AdminAuditLog): AdminAuditEntryDto {
  return {
    id: row.id,
    actorAccountId: row.actorAccountId,
    actorUsername: row.actorUsername,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt.toISOString(),
  };
}


/** A cell for a spreadsheet: quoted when it has to be, never a formula. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? ''
    : value instanceof Date ? value.toISOString()
      : typeof value === 'object' ? JSON.stringify(value)
        : String(value);
  // A leading =, +, - or @ makes Excel treat the cell as a formula, so it is
  // prefixed with a quote. The text stays readable and nothing is executed.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const EXPORT_COLUMNS = ['createdAt', 'actorUsername', 'actorAccountId', 'action', 'targetType', 'targetId', 'reason', 'before', 'after'] as const;

export const AdminAuditService = {
  /** Call inside the same transaction as the change it describes. */
  record(db: Db, actor: AuditActor, input: AuditInput): Promise<AdminAuditLog> {
    return db.adminAuditLog.create({
      data: {
        actorAccountId: actor.id,
        actorUsername: actor.username,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason ?? null,
        before: auditSnapshot(input.before),
        after: auditSnapshot(input.after),
      },
    });
  },

  /** Newest first, filtered, paged with a `before` cursor. */
  async list(prisma: PrismaClient, options: AuditListOptions = {}): Promise<AdminAuditLogDto> {
    const limit = options.limit ?? 50;
    const cursor = options.before ? await prisma.adminAuditLog.findUnique({ where: { id: options.before } }) : null;
    if (options.before && !cursor) throw AppError.notFound('AUDIT_ENTRY_NOT_FOUND', 'That audit entry does not exist.');

    const rows = await prisma.adminAuditLog.findMany({
      where: {
        AND: [
          auditWhere(options),
          cursor
            ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
            : {},
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return {
      entries: rows.slice(0, limit).map(toAuditEntryDto),
      nextBefore: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  },

  /**
   * The same rows the panel is showing, as a spreadsheet. Capped so one click
   * can never try to stream the whole table into a browser; the caller is told
   * when the cap cut the export short.
   */
  async exportCsv(prisma: PrismaClient, options: AuditListOptions = {}): Promise<{ csv: string; rows: number; truncated: boolean }> {
    const limit = Math.min(options.limit ?? AUDIT_EXPORT_MAX_ROWS, AUDIT_EXPORT_MAX_ROWS);
    const rows = await prisma.adminAuditLog.findMany({
      where: auditWhere(options),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const kept = rows.slice(0, limit);
    const lines = [EXPORT_COLUMNS.join(',')];
    for (const row of kept) {
      lines.push(EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(','));
    }
    return { csv: `${lines.join('\r\n')}\r\n`, rows: kept.length, truncated: rows.length > limit };
  },

  /** How much history there is and what a purge would take out. */
  async retention(prisma: PrismaClient, now = new Date()): Promise<AdminAuditRetentionDto> {
    const cutoff = retentionCutoff(now);
    const [total, oldest, expired] = await Promise.all([
      prisma.adminAuditLog.count(),
      prisma.adminAuditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      cutoff ? prisma.adminAuditLog.count({ where: purgeWhere(cutoff) }) : Promise.resolve(0),
    ]);
    return {
      days: env.auditRetentionDays,
      cutoff: cutoff?.toISOString() ?? null,
      total,
      expired,
      oldestAt: oldest?.createdAt.toISOString() ?? null,
    };
  },

  /**
   * Deletes entries past the retention window. Nothing runs on a timer: an
   * admin asks for it, and the purge writes its own record of what it removed.
   * Purge records are themselves never purged, so the gap in the history is
   * always explained.
   */
  async purge(prisma: PrismaClient, actor: AuditActor, reason: string, now = new Date()): Promise<AdminAuditPurgeResultDto> {
    const cutoff = retentionCutoff(now);
    if (!cutoff) {
      throw AppError.badRequest('AUDIT_RETENTION_OFF', 'This server keeps audit history forever. Set ADMIN_AUDIT_RETENTION_DAYS to turn purging on.');
    }

    const removed = await prisma.$transaction(async (tx) => {
      const oldest = await tx.adminAuditLog.findFirst({ where: purgeWhere(cutoff), orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
      const { count } = await tx.adminAuditLog.deleteMany({ where: purgeWhere(cutoff) });
      if (count === 0) throw AppError.conflict('AUDIT_NOTHING_TO_PURGE', 'No audit entries are older than the retention window.');
      await AdminAuditService.record(tx, actor, {
        action: 'audit.purge',
        targetType: 'audit',
        targetId: null,
        reason,
        before: { oldestRemovedAt: oldest?.createdAt ?? null, retentionDays: env.auditRetentionDays },
        after: { removed: count, cutoff },
      });
      return count;
    });

    return { removed, cutoff: cutoff.toISOString(), retention: await AdminAuditService.retention(prisma, now) };
  },
};
