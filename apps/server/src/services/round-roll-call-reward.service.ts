import type { Prisma, PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { GameActionResult, QuestRewardDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { ActionService } from './action.service.js';
import { grantRewards, rewardDto } from './reward-grant.service.js';
import { RoundRollCallService, roundRollCallClock } from './round-roll-call.service.js';
import {
  ROUND_ROLL_CALL_REWARD_VERSION,
  roundRollCallCatalog,
  type RoundRollCallRarity,
} from './round-roll-call-rewards.js';

export interface RoundRollCallClaimResult {
  rewardVersion: string;
  tier: number;
  rarity: RoundRollCallRarity;
  rewards: QuestRewardDto[];
}

export function assertRoundRollCallClaimable(
  requiredStamps: number, earnedStamps: number, tier: number, alreadyClaimed: boolean,
): void {
  if (!Number.isSafeInteger(tier) || tier < 1 || tier > requiredStamps) {
    throw AppError.badRequest('ROUND_ROLL_CALL_UNKNOWN_TIER', 'That day is not in this round\'s reward track.');
  }
  if (earnedStamps < tier) {
    throw AppError.conflict('ROUND_ROLL_CALL_TIER_LOCKED', `Earn ${tier} attendance stamps before claiming this reward.`);
  }
  if (alreadyClaimed) {
    throw AppError.conflict('ROUND_ROLL_CALL_ALREADY_CLAIMED', 'That reward was already collected.');
  }
}

export const RoundRollCallRewardService = {
  /** Enrich the readonly attendance calendar with catalog labels and claim receipts. */
  async board(db: Db | PrismaClient, round: Round, roundPlayerId: string, now = new Date()) {
    const [attendance, claimed] = await Promise.all([
      RoundRollCallService.view(db, round, roundPlayerId, now),
      db.roundLoginRewardClaim.findMany({
        where: { roundPlayerId },
        select: { tier: true, claimedAt: true },
      }),
    ]);
    const receipts = new Map(claimed.map((claim) => [claim.tier, claim.claimedAt.toISOString()]));
    const catalog = roundRollCallCatalog(attendance.requiredStamps);
    const ruleset = loadRulesetForRound(round);
    return {
      ...attendance,
      rewardVersion: ROUND_ROLL_CALL_REWARD_VERSION,
      rewardTrack: catalog.map((step) => ({
        tier: step.tier,
        key: step.key,
        rarity: step.rarity,
        reached: step.tier <= attendance.stamps,
        claimed: receipts.has(step.tier),
        claimedAt: receipts.get(step.tier) ?? null,
        claimable: attendance.active && step.tier <= attendance.stamps && !receipts.has(step.tier),
        rewards: step.rewards.map((reward) => rewardDto(reward, ruleset)),
      })),
    };
  },

  /**
   * Runs under the existing game-action player row lock. A unique DB receipt
   * plus action idempotency prevents repeat payouts across tabs and retries.
   * Claim receipt and payout commit (or roll back) in the same transaction.
   */
  claim(prisma: PrismaClient, roundPlayerId: string, input: { tier: number; actionId?: string }):
    Promise<GameActionResult<RoundRollCallClaimResult>> {
    return ActionService.run<RoundRollCallClaimResult>(prisma, roundPlayerId, {
      action: 'ROUND_ROLL_CALL_CLAIM',
      actionId: input.actionId,
      idempotencyScope: `ROUND_ROLL_CALL_CLAIM:${input.tier}`,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const clock = roundRollCallClock(round, now);
        if (!clock.active) {
          throw AppError.conflict('ROUND_ROLL_CALL_CLOSED', 'This round is not accepting login reward claims.');
        }
        const definition = roundRollCallCatalog(clock.requiredStamps)[input.tier - 1];
        const stamps = await tx.roundLoginCheckIn.count({ where: { roundPlayerId } });
        const already = Number.isSafeInteger(input.tier) && input.tier >= 1
          ? await tx.roundLoginRewardClaim.findUnique({
              where: { roundPlayerId_tier: { roundPlayerId, tier: input.tier } },
            })
          : null;
        assertRoundRollCallClaimable(clock.requiredStamps, stamps, input.tier, already !== null);
        if (!definition) throw AppError.conflict('ROUND_ROLL_CALL_UNKNOWN_TIER', 'That reward is not available.');

        const receipt = definition.rewards.map((reward) => ({
          kind: reward.kind,
          ...(reward.key ? { key: reward.key } : {}),
          amount: reward.amount ?? 0,
        }));
        await tx.roundLoginRewardClaim.create({
          data: {
            roundPlayerId,
            tier: definition.tier,
            rewardVersion: ROUND_ROLL_CALL_REWARD_VERSION,
            rarity: definition.rarity,
            definition: receipt as Prisma.InputJsonValue,
            claimedAt: now,
          },
        });
        const next = { ...current };
        await grantRewards(
          {
            tx,
            roundPlayerId,
            accountId: player.accountId,
            ruleset,
            now,
            sourceKey: definition.key,
          },
          next,
          definition.rewards,
        );
        return {
          next,
          result: {
            rewardVersion: ROUND_ROLL_CALL_REWARD_VERSION,
            tier: definition.tier,
            rarity: definition.rarity,
            rewards: definition.rewards.map((reward) => rewardDto(reward, ruleset)),
          },
        };
      },
    });
  },
};
