import type { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';

export const AdminRivalryService = {
  async overview(db: PrismaClient, roundId: string) {
    const [relationships, openReports] = await Promise.all([
      db.rivalryRelationship.findMany({ where: { roundId }, orderBy: { updatedAt: 'desc' }, take: 100,
        select: { id: true, status: true, mutuality: true, scoreA: true, scoreB: true, suppressedAt: true, suppressionReason: true, updatedAt: true } }),
      db.rivalrySuppressionReport.count({ where: { relationship: { roundId }, status: 'OPEN' } }),
    ]);
    return { roundId, openReports, relationships: relationships.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })) };
  },

  async preview(db: PrismaClient, relationshipId: string) {
    const row = await db.rivalryRelationship.findUnique({ where: { id: relationshipId }, include: {
      sources: { orderBy: { settledAt: 'asc' }, take: 100, select: { id: true, sourceKind: true, sourceId: true, participantId: true, outcome: true, visibility: true, decisionReason: true, settledAt: true } },
      contracts: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, status: true, objective: true, terms: true, expiresAt: true } },
      settlements: { orderBy: { settledAt: 'desc' }, take: 20 },
      reports: { orderBy: { createdAt: 'desc' }, take: 20 },
    } });
    if (!row) throw AppError.notFound('RIVALRY_NOT_FOUND', 'That rivalry could not be found.');
    return { id: row.id, roundId: row.roundId, status: row.status, mutuality: row.mutuality, scoreA: row.scoreA, scoreB: row.scoreB,
      suppressed: Boolean(row.suppressedAt), suppressionReason: row.suppressionReason,
      sources: row.sources.map((source) => ({ ...source, settledAt: source.settledAt.toISOString() })),
      contracts: row.contracts.map((contract) => ({ ...contract, expiresAt: contract.expiresAt.toISOString() })),
      settlements: row.settlements.map((settlement) => ({ ...settlement, settledAt: settlement.settledAt.toISOString() })),
      reports: row.reports.map((report) => ({ ...report, createdAt: report.createdAt.toISOString(), resolvedAt: report.resolvedAt?.toISOString() ?? null })),
      mutation: 'NONE', rewardGrant: 'NONE', publication: 'NONE' };
  },

  async suppress(db: PrismaClient, actor: AuditActor, relationshipId: string, reason: string) {
    return db.$transaction(async (tx) => {
      const before = await tx.rivalryRelationship.findUnique({ where: { id: relationshipId }, select: { id: true, suppressedAt: true, suppressionReason: true, status: true } });
      if (!before) throw AppError.notFound('RIVALRY_NOT_FOUND', 'That rivalry could not be found.');
      const now = new Date();
      const after = await tx.rivalryRelationship.update({ where: { id: relationshipId }, data: { suppressedAt: now, suppressionReason: reason, status: 'SUPPRESSED' } });
      await tx.rivalryPublicStoryDecision.updateMany({ where: { relationshipId }, data: { suppressed: true } });
      await AdminAuditService.record(tx, actor, { action: 'rivalry.suppress', targetType: 'rivalry', targetId: relationshipId, reason, before, after: { status: after.status, suppressedAt: now.toISOString() } });
      return { id: after.id, suppressed: true };
    });
  },

  async report(db: PrismaClient, relationshipId: string, reason: string) {
    const row = await db.rivalryRelationship.findUnique({ where: { id: relationshipId }, select: { id: true } });
    if (!row) throw AppError.notFound('RIVALRY_NOT_FOUND', 'That rivalry could not be found.');
    return db.rivalrySuppressionReport.create({ data: { relationshipId, reason } });
  },

  async resolveReport(db: PrismaClient, actor: AuditActor, reportId: string, resolution: string) {
    return db.$transaction(async (tx) => {
      const before = await tx.rivalrySuppressionReport.findUnique({ where: { id: reportId } });
      if (!before) throw AppError.notFound('RIVALRY_REPORT_NOT_FOUND', 'That rivalry report could not be found.');
      if (before.status !== 'OPEN') return { id: before.id, status: before.status };
      const after = await tx.rivalrySuppressionReport.update({
        where: { id: reportId },
        data: { status: 'RESOLVED', resolvedAt: new Date(), operatorId: actor.id, reason: `${before.reason}\nResolution: ${resolution}` },
      });
      await AdminAuditService.record(tx, actor, {
        action: 'rivalry.report.resolve', targetType: 'rivalry-report', targetId: reportId,
        reason: resolution, before: { status: before.status }, after: { status: after.status, relationshipId: after.relationshipId },
      });
      return { id: after.id, status: after.status, resolvedAt: after.resolvedAt?.toISOString() ?? null };
    });
  },

  async auditHistory(db: PrismaClient, relationshipId: string) {
    return AdminAuditService.list(db, { targetType: 'rivalry', targetId: relationshipId, limit: 100 });
  },
};
