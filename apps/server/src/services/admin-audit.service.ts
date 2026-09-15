import type { Account, AdminAuditLog, Prisma, PrismaClient } from '@prisma/client';
import type { AdminAuditEntryDto, AdminAuditLogDto } from '@streets/shared';
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
          options.targetType ? { targetType: options.targetType } : {},
          options.targetId ? { targetId: options.targetId } : {},
          options.action ? { action: { startsWith: options.action } } : {},
          options.actor ? { actorUsername: { contains: options.actor, mode: 'insensitive' } } : {},
          options.from || options.to
            ? { createdAt: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
            : {},
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
};
