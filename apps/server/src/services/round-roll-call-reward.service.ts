import type { Prisma, PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { z } from 'zod';
import type { GameActionResult, QuestRewardDto } from '@streets/shared';
import { DROP_ITEMS } from '@streets/rulesets';
import type { QuestRewardDefinition } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { ActionService } from './action.service.js';
import { grantRewards, rewardDto } from './reward-grant.service.js';
import { RoundRollCallService, roundRollCallClock } from './round-roll-call.service.js';
import { RoundRollCallCosmeticService } from './round-roll-call-cosmetic.service.js';
import { RoundRollCallRecoveryService } from './round-roll-call-recovery.service.js';
import {
  ROUND_ROLL_CALL_DROP_CRATE_KEY,
  roundRollCallCatalog,
  type RoundRollCallRarity,
} from './round-roll-call-rewards.js';
import { grantDropUnlocks } from './drop-purchase.service.js';
import { randomInt } from 'node:crypto';

export interface RoundRollCallClaimResult {
  rewardVersion: string;
  tier: number;
  rarity: RoundRollCallRarity;
  rewards: QuestRewardDto[];
  dropCrate: boolean;
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

/** Render old claims from their actual payout, never from a newer catalog. */
const persistedRewardSchema = z.array(z.object({
  kind: z.enum(['CASH', 'TURNS', 'ITEM', 'COSMETIC_UNLOCK']),
  key: z.string().optional(),
  amount: z.number().int().nonnegative(),
}).strict()).min(1);

const CHEAP_DROP_MAX_PRICE = 300;

export function roundRollCallDropCrateCandidates() {
  return Object.values(DROP_ITEMS).filter((item) => item.priceCrowns <= CHEAP_DROP_MAX_PRICE && item.rarity !== 'legendary');
}

async function resolveRewards(tx: Db, accountId: string, rewards: readonly QuestRewardDefinition[], now: Date) {
  const candidates = roundRollCallDropCrateCandidates();
  const crate = rewards.some((reward) => reward.kind === 'COSMETIC_UNLOCK' && reward.key === ROUND_ROLL_CALL_DROP_CRATE_KEY);
  if (!crate) return { rewards: [...rewards], dropCrate: false };
  if (!candidates.length) throw AppError.conflict('ROUND_ROLL_CALL_DROP_EMPTY', 'The cheap Drop crate has no available contents.');
  const held = new Set((await tx.accountCosmeticUnlock.findMany({
    where: { accountId, key: { in: candidates.map((item) => item.key) } },
    select: { key: true },
  })).map((row) => row.key));
  const unowned = candidates.filter((item) => !held.has(item.key));
  const pool = unowned.length ? unowned : candidates;
  const selected = pool[randomInt(pool.length)]!;
  await grantDropUnlocks(tx, accountId, [selected.key], now);
  return {
    rewards: rewards.map((reward) => reward.kind === 'COSMETIC_UNLOCK' && reward.key === ROUND_ROLL_CALL_DROP_CRATE_KEY
      ? { kind: 'COSMETIC_UNLOCK' as const, key: selected.key }
      : reward),
    dropCrate: true,
  };
}

function receiptRewards(value: Prisma.JsonValue): QuestRewardDefinition[] {
  const parsed = persistedRewardSchema.safeParse(value);
  if (!parsed.success) {
    throw AppError.conflict('ROUND_ROLL_CALL_RECEIPT_INVALID', 'A past reward has invalid saved contents.');
  }
  return parsed.data;
}

export const RoundRollCallRewardService = {
  /** Enrich the readonly attendance calendar with catalog labels and claim receipts. */
  async board(db: Db | PrismaClient, round: Round, roundPlayerId: string, now = new Date()) {
    const [attendance, claimed, player] = await Promise.all([
      RoundRollCallService.view(db, round, roundPlayerId, now),
      db.roundLoginRewardClaim.findMany({
        where: { roundPlayerId },
        select: { tier: true, claimedAt: true, rewardVersion: true, rarity: true, definition: true },
      }),
      db.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { accountId: true } }),
    ]);
    const [grandPrize, recovery] = await Promise.all([
      RoundRollCallCosmeticService.ownership(db, player.accountId),
      RoundRollCallRecoveryService.status(db, round, roundPlayerId, now, attendance),
    ]);
    // A player can complete multiple independently capped makeups in a row,
    // so count the server-verified days usable right now rather than one.
    // Do not declare the finale impossible when eligible recoveries bridge
    // the shortfall, but never count future/unjoined days as recoverable.
    const futureSlots = attendance.ended ? 0 : Math.max(0,
      attendance.roundDays - attendance.roundDay + (attendance.alreadyCheckedInToday ? 0 : 1));
    const canFinishWithCurrentRecovery = recovery.eligible
      && attendance.stamps + futureSlots + recovery.availableNow >= attendance.requiredStamps;
    const receipts = new Map(claimed.map((claim) => [claim.tier, claim]));
    const catalogVersion = round.roundLoginRewardVersion;
    const catalog = roundRollCallCatalog(attendance.requiredStamps, catalogVersion);
    const ruleset = loadRulesetForRound(round);
    return {
      ...attendance,
      canStillFinish: attendance.canStillFinish || canFinishWithCurrentRecovery,
      rewardVersion: catalogVersion,
      grandPrize,
      recovery,
      rewardTrack: catalog.map((step) => {
        const paid = receipts.get(step.tier);
        return {
          tier: step.tier,
          key: paid ? `${paid.rewardVersion}:tier-${step.tier}` : step.key,
          rewardVersion: paid?.rewardVersion ?? catalogVersion,
          rarity: paid?.rarity ?? step.rarity,
          reached: step.tier <= attendance.stamps,
          claimed: paid != null,
          claimedAt: paid?.claimedAt.toISOString() ?? null,
          claimable: attendance.active && step.tier <= attendance.stamps && !paid,
          rewards: (paid ? receiptRewards(paid.definition) : step.rewards)
            .map((reward) => rewardDto(reward, ruleset)),
        };
      }),
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
        const catalogVersion = round.roundLoginRewardVersion;
        const definition = roundRollCallCatalog(clock.requiredStamps, catalogVersion)[input.tier - 1];
        const stamps = await tx.roundLoginCheckIn.count({ where: { roundPlayerId } });
        const already = Number.isSafeInteger(input.tier) && input.tier >= 1
          ? await tx.roundLoginRewardClaim.findUnique({
              where: { roundPlayerId_tier: { roundPlayerId, tier: input.tier } },
            })
          : null;
        assertRoundRollCallClaimable(clock.requiredStamps, stamps, input.tier, already !== null);
        if (!definition) throw AppError.conflict('ROUND_ROLL_CALL_UNKNOWN_TIER', 'That reward is not available.');

         const resolved = await resolveRewards(tx, player.accountId, definition.rewards, now);
         const receipt = resolved.rewards.map((reward) => ({
          kind: reward.kind,
          ...(reward.key ? { key: reward.key } : {}),
          amount: reward.amount ?? 0,
        }));
        await tx.roundLoginRewardClaim.create({
          data: {
            roundPlayerId,
            tier: definition.tier,
            rewardVersion: catalogVersion,
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
           resolved.rewards.filter((reward) => !(reward.kind === 'COSMETIC_UNLOCK' && DROP_ITEMS[reward.key ?? ''])),
        );
        // The permanent pair is awarded ONLY on the final reached reward.
        // Duplicates are prevented by the account-level unique unlock keys.
        // Existing players who claimed the finale before D are topped up on
        // their next verified foreground check-in or at round close.
        if (definition.tier === clock.requiredStamps) {
          await RoundRollCallCosmeticService.awardIfEligible(tx, round, roundPlayerId, player.accountId, now);
        }
        return {
          next,
          result: {
            rewardVersion: catalogVersion,
            tier: definition.tier,
            rarity: definition.rarity,
             rewards: resolved.rewards.map((reward) => rewardDto(reward, ruleset)),
             dropCrate: resolved.dropCrate,
          },
        };
      },
    });
  },
};
