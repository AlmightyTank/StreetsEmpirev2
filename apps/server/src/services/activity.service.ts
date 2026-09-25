import type { ActivityType, Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { createPlayerActivity } from './in-app-notification.service.js';
import { QuestProgressService } from './quest-progress.service.js';

/**
 * Section 42. The player's own feed of what they did.
 *
 * Writes take a transaction client so an activity row can only exist if the
 * action that produced it committed.
 */
export const ActivityService = {
  async log(
    db: Db,
    roundPlayerId: string,
    type: ActivityType,
    payload: Prisma.InputJsonValue,
  ) {
    const activity = await createPlayerActivity(db, roundPlayerId, type, payload);
    await QuestProgressService.recordActivity(db, activity);
    return activity;
  },

  recent(prisma: PrismaClient, roundPlayerId: string, limit = 10) {
    return prisma.playerActivity.findMany({
      where: { roundPlayerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
