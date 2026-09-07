import type { ActivityType, Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';

/**
 * Section 42. The player's own feed of what they did.
 *
 * Writes take a transaction client so an activity row can only exist if the
 * action that produced it committed.
 */
export const ActivityService = {
  log(
    db: Db,
    roundPlayerId: string,
    type: ActivityType,
    payload: Prisma.InputJsonValue,
  ) {
    return db.playerActivity.create({
      data: { roundPlayerId, type, payload },
    });
  },

  recent(prisma: PrismaClient, roundPlayerId: string, limit = 10) {
    return prisma.playerActivity.findMany({
      where: { roundPlayerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
