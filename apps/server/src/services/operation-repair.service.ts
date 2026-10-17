import type { Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { abandonTemplated, TemplatedOperations } from './operation-templated.service.js';
import { operationInclude, pauseOffsetMs, recordOperationTransition, ROUND_CLOCK_SELECT, toOperationDto } from './operation-shared.js';
import { OperationsService } from './operations.service.js';

/**
 * Criminal Operation repair.
 *
 * No admin route read the criminal `Operation` table before this service.
 * Business-operations admin, `admin-operations` tests, and
 * `prisma/migrations/20260927200000_admin_operations` are a different surface.
 * Do not repair these rows from that admin.
 *
 * The round flag defaults off. Turn it on only after duplicate-execute,
 * duplicate-stock, and cancel-while-disabled checks pass.
 */
export const OperationRepairService = {
  async history(prisma: PrismaClient, operationId: string) {
    return prisma.operationTransition.findMany({
      where: { operationId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async setFlag(prisma: PrismaClient, roundId: string, enabled: boolean) {
    return prisma.round.update({
      where: { id: roundId },
      data: { underworldOperationsEnabled: enabled },
      select: { id: true, underworldOperationsEnabled: true },
    });
  },

  async repair(prisma: PrismaClient, operationId: string, action: 'expire' | 'cancel' | 'finish') {
    const operation = await prisma.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
    const round = await prisma.round.findUnique({ where: { id: operation.roundId }, select: ROUND_CLOCK_SELECT });
    const now = new Date();
    const pauseMs = pauseOffsetMs(round, now);
    if (operation.report || operation.status === 'REPORTED') {
      return toOperationDto(operation, operation.participants, operation.leaderId, now, pauseMs);
    }
    if (action === 'finish' && (operation.status === 'READY' || operation.status === 'EXECUTING')) {
      if (operation.catalogVersion) return TemplatedOperations.execute(prisma, operation.leaderId, operationId);
      return OperationsService.execute(prisma, operation.leaderId, { operationId });
    }
    if (action === 'finish') {
      return prisma.$transaction(async (tx) => {
        const current = await tx.operation.findUniqueOrThrow({ where: { id: operationId } });
        if (current.report) {
          const after = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
          return toOperationDto(after, after.participants, operation.leaderId, now, pauseMs);
        }
        const report = {
          success: false,
          band: 'failure' as const,
          stages: [],
          payoutCents: 0,
          totalPayoutCents: 0,
          contributions: [],
          capApplied: false,
          source: null,
        };
        await tx.operation.update({
          where: { id: operationId },
          data: { status: 'REPORTED', report: report as unknown as Prisma.InputJsonValue },
        });
        await recordOperationTransition(tx, operationId, null, current.status, 'REPORTED', 'admin finish');
        const after = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
        return toOperationDto(after, after.participants, operation.leaderId, now, pauseMs);
      });
    }
    return prisma.$transaction(async (tx) => {
      const current = await tx.operation.findUniqueOrThrow({ where: { id: operationId } });
      if (current.report) {
        const after = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
        return toOperationDto(after, after.participants, operation.leaderId, now, pauseMs);
      }
      await abandonTemplated(tx, current, action === 'cancel' ? 'CANCELLED' : 'EXPIRED', null, `admin ${action}`, now);
      const after = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
      return toOperationDto(after, after.participants, operation.leaderId, now, pauseMs);
    });
  },
};

export async function readRepairHistory(tx: Db, operationId: string) {
  return tx.operationTransition.findMany({ where: { operationId }, orderBy: { createdAt: 'asc' } });
}
