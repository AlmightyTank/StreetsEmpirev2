import type { PrismaClient } from '@prisma/client';
import {
  calculateQuestCompletion,
  hasWeaponAccess,
  QuestError,
  questProgress,
  restockSpeedup,
  tierFor,
  totalReputation,
  traderKeys,
  weaponUnlockField,
  weaponUnlockProgress,
  type QuestPlayer,
  type Ruleset,
  type Standings,
} from '@streets/rules-engine';
import type { QuestKey, WeaponUnlockKey } from '@streets/rulesets';
import type {
  GameActionResult,
  QuestCompleteInput,
  QuestCompleteResult,
  ReputationSummaryDto,
} from '@streets/shared';
import { ActionService, type PlayerState } from './action.service.js';
import { AppError } from '../utils/errors.js';

/** Everything a quest reads, pulled off the settled player. */
function toQuestPlayer(player: PlayerState): QuestPlayer {
  return {
    crack: player.crack,
    thugs: player.thugs,
    lowRiders: player.lowRiders,
    cleanShiftStreak: player.cleanShiftStreak,
    rocksSuppliedToPip: player.rocksSuppliedToPip,
    driveBys: player.driveBysDone,
  };
}

/**
 * Standing with the traders, and the favours they are asking for.
 *
 * The favours are the spine of reputation: trading alone tops out below the
 * AK-47 gate on purpose, so this is the only way to the top of the ladder.
 */
export const QuestService = {
  summary(
    ruleset: Ruleset,
    player: PlayerState,
    standings: Standings,
  ): ReputationSummaryDto {
    const questPlayer = toQuestPlayer(player);

    return {
      traders: traderKeys(ruleset).map((trader) => {
        const points = standings[trader]?.points ?? 0;
        return {
          trader,
          traderName: ruleset.stores[trader].name,
          keeper: ruleset.stores[trader].keeper,
          points,
          max: ruleset.reputation.perTraderMax,
          standing: tierFor(points, ruleset).name,
          restockSpeedup: Math.round(restockSpeedup(points, ruleset) * 100),
          quest: questProgress(trader as QuestKey, questPlayer, standings, ruleset),
        };
      }),
      totalRep: totalReputation(standings),
      unlocks: (Object.keys(ruleset.weaponUnlocks) as WeaponUnlockKey[]).map((key) =>
        weaponUnlockProgress(player, standings, key, ruleset),
      ),
    };
  },

  complete(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: QuestCompleteInput,
  ): Promise<GameActionResult<QuestCompleteResult>> {
    return ActionService.run<QuestCompleteResult>(prisma, roundPlayerId, {
      action: 'QUEST_COMPLETE',
      actionId: input.actionId,
      execute: ({ current, ruleset, standings, now }) => {
        let done;
        try {
          done = calculateQuestCompletion(input.trader, toQuestPlayer(current), standings, ruleset);
        } catch (error) {
          if (error instanceof QuestError) throw AppError.badRequest(error.code, error.message);
          throw error;
        }

        const points = Math.min(
          ruleset.reputation.perTraderMax,
          (standings[done.key]?.points ?? 0) + done.pointsGained,
        );

        // What the total becomes, so the ladder can be read against it here
        // rather than making the client work it out.
        const after: Standings = {
          ...standings,
          [done.key]: { ...standings[done.key]!, points, questDone: true },
        };

        const next: PlayerState = {
          ...current,
          crack: current.crack - done.spend.crack,
          lowRiders: current.lowRiders - done.spend.lowRiders,
          ...(done.clearsCleanShiftStreak ? { cleanShiftStreak: 0 } : {}),
        };

        // A favour can be the thing that opens a rung, so the flags are
        // settled in the same breath rather than needing a second request.
        const unlocked: string[] = [];
        for (const key of Object.keys(ruleset.weaponUnlocks) as WeaponUnlockKey[]) {
          const progress = weaponUnlockProgress(next, after, key, ruleset);
          if (!hasWeaponAccess(next, key) && progress.canComplete) {
            // Prerequisites are read off `next`, which this mutates as it
            // climbs, so one favour can open more than one rung at once.
            next[weaponUnlockField(key)] = true;
            unlocked.push(progress.weaponName);
          }
        }

        return {
          next,
          result: {
            trader: done.key,
            traderName: ruleset.stores[done.key].name,
            title: ruleset.quests[done.key].title,
            reputationGained: points - (standings[done.key]?.points ?? 0),
            totalRep: totalReputation(after),
            crackDelivered: done.spend.crack,
            lowRidersHandedOver: done.spend.lowRiders,
            unlocked,
          },
          reputation: [{ trader: done.key, points, questDoneAt: now }],
          activity: {
            type: 'WEAPON_UNLOCK',
            payload: {
              quest: ruleset.quests[done.key].title,
              trader: ruleset.stores[done.key].name,
              reputation: points,
              unlocked,
            },
          },
        };
      },
    });
  },
};
