import type { Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

/**
 * Section 52. How long a completed action can still be replayed by id.
 */
const RETENTION_MS = 10 * 60 * 1000;

export const IdempotencyService = {
  /**
   * Return the stored result for this action id when it already ran.
   *
   * H also binds an id to its action name. Reusing a Scout id for Produce,
   * Payout, a store trade, etc. can never return a result of the wrong shape.
   */
  async find<T>(
    db: Db,
    actionId: string,
    roundPlayerId: string,
    expectedAction?: string,
  ): Promise<T | null> {
    const existing = await db.processedAction.findUnique({
      where: { roundPlayerId_actionId: { roundPlayerId, actionId } },
    });

    if (!existing) return null;
    if (existing.expiresAt.getTime() <= Date.now()) return null;

    if (expectedAction && existing.action !== expectedAction) {
      throw AppError.conflict(
        'ACTION_ID_REUSED',
        'That request id belongs to a different action. Refresh the page and try again.',
      );
    }

    return existing.result as T;
  },

  record(
    db: Db,
    actionId: string,
    roundPlayerId: string,
    action: string,
    result: unknown,
    now: Date = new Date(),
  ) {
    return db.processedAction.create({
      data: {
        actionId,
        roundPlayerId,
        action,
        result: result as Prisma.InputJsonValue,
        expiresAt: new Date(now.getTime() + RETENTION_MS),
      },
    });
  },

  async purgeExpired(prisma: PrismaClient): Promise<number> {
    const { count } = await prisma.processedAction.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  },
};
