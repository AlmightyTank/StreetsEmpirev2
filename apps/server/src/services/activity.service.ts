import type { ActivityType, Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { rulesets } from '@streets/rulesets';
import { createPlayerActivity } from './in-app-notification.service.js';
import { QuestProgressService } from './quest-progress.service.js';
import { recordLivingCaseActivity } from './living-case-evidence.service.js';
import { CareerStoryService } from './career-story.service.js';
import { careerStorySourceFromActivity } from './career-story-source.service.js';
import { RivalryAdapterService } from './rivalry-adapter.service.js';
import { loadRulesetForRound } from '@streets/rules-engine';
import { fitThugs } from './crew-availability.js';

function combatAmmoCrossing(payload: Prisma.InputJsonValue): { before: number; after: number } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const combat = (payload as Record<string, unknown>).ammoCombat;
  if (!combat || typeof combat !== 'object' || Array.isArray(combat)) return null;
  const row = combat as Record<string, unknown>;
  if (typeof row.afterRounds !== 'number' || typeof row.spentRounds !== 'number') return null;
  return {
    before: row.afterRounds + row.spentRounds + (typeof row.lostRounds === 'number' ? row.lostRounds : 0) - (typeof row.gainedRounds === 'number' ? row.gainedRounds : 0),
    after: row.afterRounds,
  };
}

async function notifyLowAmmoAfterCombat(db: Db, roundPlayerId: string, type: ActivityType, payload: Prisma.InputJsonValue) {
  if (type === 'AMMO_LOW') return;
  const crossing = combatAmmoCrossing(payload);
  if (!crossing) return;
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { id: true, ammo: true, thugs: true, woundedThugs: true, busyThugs: true, postedThugs: true, businessThugs: true, dealerThugs: true, pistols: true, shotguns: true, tek9s: true, ak47s: true, round: { select: { id: true, rulesetId: true, rulesetVersion: true } } },
  });
  if (!player) return;
  const ruleset = loadRulesetForRound(player.round);
  if (!ruleset.ammoParts?.lowAmmoNotificationsEnabled) return;
  const rounds = ruleset.ammoParts.ammo.roundsPerFight;
  let fighters = Math.min(fitThugs(player), ruleset.combat?.squadCap ?? Number.MAX_SAFE_INTEGER);
  let threshold = 0;
  const weapons: Array<[number, number]> = [[player.ak47s, rounds.AK47], [player.tek9s, rounds.TEK9], [player.shotguns, rounds.SHOTGUN], [player.pistols, rounds.PISTOL]];
  for (const [guns, cost] of weapons) {
    const assigned = Math.min(fighters, guns);
    threshold += assigned * cost;
    fighters -= assigned;
  }
  if (threshold > 0 && crossing.before > threshold && crossing.after <= threshold) {
    await createPlayerActivity(db, roundPlayerId, 'AMMO_LOW', {
      ammoRemaining: player.ammo,
      ammoThreshold: threshold,
      message: 'Your ammunition is running low. Restock before the next fight.',
    });
  }
}

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
    await notifyLowAmmoAfterCombat(db, roundPlayerId, type, payload);
    await RivalryAdapterService.fromActivity(db, roundPlayerId, type, payload);
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
