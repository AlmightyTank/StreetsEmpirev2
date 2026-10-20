import type { PrismaClient } from '@prisma/client';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';

let paused = false;
const ALERT_THRESHOLDS = { suppressedRelationships: 25, targetConcentration: 50, unresolvedFeuds: 100, claimFailures: 10, duplicateAttempts: 25 };

export const RivalryOperationsService = {
  isPaused() { return paused; },
  async metrics(db: PrismaClient) {
    const [suppressedRelationships, targetConcentration, unresolvedFeuds, publicPublication, claimFailures, duplicateAttempts] = await Promise.all([
      db.rivalryRelationship.count({ where: { suppressedAt: { not: null } } }),
      db.rivalryRelationship.count({ where: { mutuality: 'ONE_SIDED' } }),
      db.rivalryFeudContract.count({ where: { status: { in: ['PROPOSED', 'ACCEPTED'] } } }),
      db.rivalryPublicStoryDecision.count({ where: { published: true, suppressed: false } }),
      db.adminAuditLog.count({ where: { action: 'rivalry.claim.failed' } }),
      db.adminAuditLog.count({ where: { action: 'rivalry.source.duplicate' } }),
    ]);
    const metrics = { paused, suppressedRelationships, targetConcentration, unresolvedFeuds, publicPublication, claimFailures, duplicateAttempts };
    return { ...metrics, alerts: Object.entries(ALERT_THRESHOLDS).filter(([key, threshold]) => metrics[key as keyof typeof ALERT_THRESHOLDS] >= threshold).map(([key, threshold]) => ({ key, threshold })) };
  },
  async setPaused(db: PrismaClient, actor: AuditActor, next: boolean, reason: string) {
    const previous = paused;
    paused = next;
    await AdminAuditService.record(db, actor, { action: next ? 'rivalry.pause' : 'rivalry.resume', targetType: 'rivalry-operations', targetId: null, reason, before: { paused: previous }, after: { paused: next } });
    return { paused };
  },
};
