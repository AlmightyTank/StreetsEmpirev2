import type { Prisma, PrismaClient } from '@prisma/client';
import {
  streetPassCredToReach,
  streetPassTierForCred,
  type Ruleset,
  type StreetPassRules,
} from '@streets/rulesets';
import type { GameActionResult, StreetPassClaimResult, StreetPassDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { ActionService } from './action.service.js';
import { dailyContractWindow } from './daily-contract.service.js';
import { QuestCosmeticService } from './quest-cosmetic.service.js';
import { grantRewards, rewardDto } from './reward-grant.service.js';

/**
 * Street Pass step 2: reading a player's pass and claiming tiers. Cred is
 * earned in street-pass-cred.service.ts; see docs/STREET-PASS.md.
 */

function requirePass(ruleset: Ruleset): StreetPassRules {
  if (!ruleset.streetPass) throw AppError.notFound('STREET_PASS_OFF', 'This round has no Street Pass.');
  return ruleset.streetPass;
}

function sourceKey(rules: StreetPassRules, tier: number): string {
  return `${rules.key}:${tier}`;
}

/**
 * Award any cosmetic on a tier this player already claimed that the account
 * is missing. A tier can gain a cosmetic after players claimed it (Slice D
 * added the item art collections to Season 1 at tiers 8, 18 and 28), so each
 * claim and the round close top these up. Already-owned unlocks are skipped.
 */
async function awardClaimedTierCosmetics(
  tx: Db,
  roundPlayerId: string,
  accountId: string,
  ruleset: Ruleset,
  rules: StreetPassRules,
  at: Date,
): Promise<number> {
  const claims = await tx.streetPassClaim.findMany({ where: { roundPlayerId, passKey: rules.key }, select: { tier: true } });
  const claimed = new Set(claims.map((claim) => claim.tier));
  const due = rules.tiers
    .filter((t) => claimed.has(t.tier))
    .flatMap((t) => t.rewards.flatMap((reward) => (reward.kind === 'COSMETIC_UNLOCK' && reward.key ? [{ key: reward.key, tier: t.tier }] : [])));
  if (!due.length) return 0;
  const owned = await tx.accountCosmeticUnlock.findMany({
    where: { accountId, key: { in: due.map((reward) => reward.key) } },
    select: { key: true },
  });
  const have = new Set(owned.map((unlock) => unlock.key));
  let awarded = 0;
  for (const reward of due) {
    if (have.has(reward.key)) continue;
    await QuestCosmeticService.award(tx, accountId, ruleset, reward.key, sourceKey(rules, reward.tier), at);
    have.add(reward.key);
    awarded++;
  }
  return awarded;
}

export const StreetPassService = {
  /** The round's track and this player's Cred, tier and claims. Null on rounds without a pass. */
  async view(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, now = new Date()): Promise<StreetPassDto | null> {
    const rules = ruleset.streetPass;
    if (!rules) return null;
    const [progress, claims] = await Promise.all([
      db.streetPassProgress.findUnique({ where: { roundPlayerId } }),
      db.streetPassClaim.findMany({ where: { roundPlayerId, passKey: rules.key }, select: { tier: true } }),
    ]);
    const cred = progress?.passKey === rules.key ? progress.cred : 0;
    const tier = streetPassTierForCred(rules, cred);
    const claimed = new Set(claims.map((claim) => claim.tier));
    const window = dailyContractWindow(now, ruleset);
    const turnCredToday = progress?.turnCredWindowStartsAt?.getTime() === window.startsAt.getTime() ? progress.turnCredInWindow : 0;
    return {
      key: rules.key,
      name: rules.name,
      cred,
      tier,
      tierCount: rules.tiers.length,
      nextTierCred: tier < rules.tiers.length ? streetPassCredToReach(rules, tier + 1) : null,
      lateJoinBonusPercent: progress?.lateJoinBonusPercent ?? 0,
      turnCredToday,
      turnCredCap: rules.sources.dailyTurnCap,
      sources: {
        dailyContract: rules.sources.dailyContract,
        weeklyContract: rules.sources.weeklyContract,
        oneTimeJob: rules.sources.oneTimeJob,
        eventContract: rules.sources.eventContract,
        perTurnSpent: rules.sources.perTurnSpent,
      },
      claimable: rules.tiers.filter((t) => t.tier <= tier && !claimed.has(t.tier)).map((t) => t.tier),
      tiers: rules.tiers.map((t) => ({
        tier: t.tier,
        credToReach: streetPassCredToReach(rules, t.tier),
        reached: t.tier <= tier,
        claimed: claimed.has(t.tier),
        rewards: t.rewards.map((reward) => rewardDto(reward, ruleset)),
      })),
    };
  },

  /** Just enough for the nav badge: tier reached and how many tiers wait to be claimed. */
  async summary(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<{ tier: number; tierCount: number; claimable: number } | null> {
    const rules = ruleset.streetPass;
    if (!rules) return null;
    const [progress, claimed] = await Promise.all([
      db.streetPassProgress.findUnique({ where: { roundPlayerId }, select: { passKey: true, cred: true } }),
      db.streetPassClaim.count({ where: { roundPlayerId, passKey: rules.key } }),
    ]);
    const tier = streetPassTierForCred(rules, progress?.passKey === rules.key ? progress.cred : 0);
    return { tier, tierCount: rules.tiers.length, claimable: Math.max(0, tier - claimed) };
  },

  /**
   * Claim one reached tier. Runs as a game action, so it holds the player's
   * lock, replays a repeated action id instead of paying twice, and refuses
   * an ended round. The claim row's unique key backs that up.
   */
  async claim(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: { tier: number; actionId?: string },
  ): Promise<GameActionResult<StreetPassClaimResult>> {
    return ActionService.run<StreetPassClaimResult>(prisma, roundPlayerId, {
      action: 'STREET_PASS_CLAIM',
      actionId: input.actionId,
      idempotencyScope: `STREET_PASS_CLAIM:${input.tier}`,
      execute: async ({ tx, current, player, ruleset, now }) => {
        const rules = requirePass(ruleset);
        const definition = Number.isSafeInteger(input.tier) ? rules.tiers.find((t) => t.tier === input.tier) : undefined;
        if (!definition) {
          throw AppError.badRequest('STREET_PASS_TIER_UNKNOWN', `The Street Pass has tiers 1 to ${rules.tiers.length}.`, { tier: 'Pick a tier on the track.' });
        }
        const progress = await tx.streetPassProgress.findUnique({ where: { roundPlayerId } });
        const cred = progress?.passKey === rules.key ? progress.cred : 0;
        const needed = streetPassCredToReach(rules, definition.tier);
        if (streetPassTierForCred(rules, cred) < definition.tier) {
          throw AppError.conflict('STREET_PASS_TIER_LOCKED', `Tier ${definition.tier} needs ${needed.toLocaleString('en-US')} Cred. You have ${cred.toLocaleString('en-US')}.`);
        }
        const already = await tx.streetPassClaim.findUnique({
          where: { roundPlayerId_passKey_tier: { roundPlayerId, passKey: rules.key, tier: definition.tier } },
        });
        if (already) throw AppError.conflict('STREET_PASS_ALREADY_CLAIMED', `You already claimed tier ${definition.tier}.`);
        await tx.streetPassClaim.create({ data: { roundPlayerId, passKey: rules.key, tier: definition.tier, claimedAt: now } });

        const next = { ...current };
        await grantRewards(
          { tx, roundPlayerId, accountId: player.accountId, ruleset, now, sourceKey: sourceKey(rules, definition.tier) },
          next,
          definition.rewards,
        );
        await awardClaimedTierCosmetics(tx, roundPlayerId, player.accountId, ruleset, rules, now);
        const rewards = definition.rewards.map((reward) => rewardDto(reward, ruleset));
        return {
          next,
          result: { passKey: rules.key, tier: definition.tier, rewards },
          activity: {
            type: 'STREET_PASS_CLAIMED',
            payload: { passKey: rules.key, tier: definition.tier, rewards: rewards.map((reward) => reward.label) } satisfies Prisma.InputJsonValue,
          },
        };
      },
    });
  },

  /**
   * Round close: a tier that pays a permanent cosmetic and was reached but
   * never claimed is claimed automatically, cosmetics only. Gameplay rewards
   * on unclaimed tiers expire with the round. Cosmetics added to tiers the
   * player had already claimed are topped up too. Runs inside the close
   * transaction, before the round is marked ended.
   */
  async grantUnclaimedCosmetics(tx: Db, roundId: string, ruleset: Ruleset, at: Date): Promise<number> {
    const rules = ruleset.streetPass;
    if (!rules) return 0;
    const cosmeticTiers = rules.tiers.filter((t) => t.rewards.some((reward) => reward.kind === 'COSMETIC_UNLOCK'));
    if (!cosmeticTiers.length) return 0;
    const lowest = Math.min(...cosmeticTiers.map((t) => streetPassCredToReach(rules, t.tier)));
    const players = await tx.streetPassProgress.findMany({
      where: { passKey: rules.key, cred: { gte: lowest }, roundPlayer: { roundId } },
      select: { roundPlayerId: true, cred: true, roundPlayer: { select: { accountId: true } } },
    });
    let granted = 0;
    for (const player of players) {
      const reached = streetPassTierForCred(rules, player.cred);
      for (const tier of cosmeticTiers) {
        if (tier.tier > reached) continue;
        const where = { roundPlayerId_passKey_tier: { roundPlayerId: player.roundPlayerId, passKey: rules.key, tier: tier.tier } };
        if (await tx.streetPassClaim.findUnique({ where })) continue;
        await tx.streetPassClaim.create({ data: { roundPlayerId: player.roundPlayerId, passKey: rules.key, tier: tier.tier, automatic: true, claimedAt: at } });
        for (const reward of tier.rewards) {
          if (reward.kind !== 'COSMETIC_UNLOCK' || !reward.key) continue;
          await QuestCosmeticService.award(tx, player.roundPlayer.accountId, ruleset, reward.key, sourceKey(rules, tier.tier), at);
        }
        granted++;
      }
      await awardClaimedTierCosmetics(tx, player.roundPlayerId, player.roundPlayer.accountId, ruleset, rules, at);
    }
    return granted;
  },
};

