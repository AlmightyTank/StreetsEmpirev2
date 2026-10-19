import type { ActivityType, Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { rulesets } from '@streets/rulesets';
import { createPlayerActivity } from './in-app-notification.service.js';
import { QuestProgressService } from './quest-progress.service.js';
import { recordLivingCaseActivity } from './living-case-evidence.service.js';
import { CareerStoryService } from './career-story.service.js';
import { careerStorySourceFromActivity } from './career-story-source.service.js';

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
    // Same authoritative action transaction, after its verified PlayerActivity
    // receipt has been committed to the transaction. No GET-time progress.
    await recordLivingCaseActivity(db, activity);
    const storySource = careerStorySourceFromActivity(activity);
    if (storySource) {
      const player = await db.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        select: { accountId: true, round: { select: { id: true, rulesetId: true, pausedAt: true, endsAt: true, status: true } } },
      });
      const ruleset = player ? rulesets[player.round.rulesetId] : undefined;
      if (player && ruleset?.careerStorylines?.enabled) {
        await CareerStoryService.claimSource(db, {
          accountId: player.accountId,
          roundPlayerId,
          ruleset,
          sourceKind: storySource.sourceKind,
          sourceId: storySource.sourceId,
          settledAt: storySource.settledAt,
        });
      }
    }
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
