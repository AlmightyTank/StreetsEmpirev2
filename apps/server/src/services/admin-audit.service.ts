import type { Account, AdminAuditLog, Prisma, PrismaClient } from '@prisma/client';
import type { AdminAuditEntryDto, AdminAuditLogDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

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

  async list(
    prisma: PrismaClient,
    options: { limit?: number | undefined; targetType?: string | undefined; targetId?: string | undefined } = {},
  ): Promise<AdminAuditLogDto> {
    const rows = await prisma.adminAuditLog.findMany({
      where: {
        ...(options.targetType ? { targetType: options.targetType } : {}),
        ...(options.targetId ? { targetId: options.targetId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit ?? 50,
    });
    return { entries: rows.map(toAuditEntryDto) };
  },
};
