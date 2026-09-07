import type { Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';

/**
 * Section 52. How long a completed action can still be replayed by id.
 *
 * Long enough to cover a double click, a retry after a dropped connection or a
 * browser resend; short enough that the table stays small.
 */
const RETENTION_MS = 10 * 60 * 1000;

export const IdempotencyService = {
  /**
   * The stored result for this action id, if it already ran.
   *
   * Must be called with the player row already locked. Under READ COMMITTED
   * the lock is what guarantees a concurrent duplicate sees the first
   * request's committed row instead of racing past it and executing twice.
   */
  async find<T>(db: Db, actionId: string, roundPlayerId: string): Promise<T | null> {
    const existing = await db.processedAction.findUnique({
      where: { roundPlayerId_actionId: { roundPlayerId, actionId } },
    });

    if (!existing) return null;
    if (existing.expiresAt.getTime() <= Date.now()) return null;

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

  /** Housekeeping, called on boot alongside the session purge. */
  async purgeExpired(prisma: PrismaClient): Promise<number> {
    const { count } = await prisma.processedAction.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  },
};
