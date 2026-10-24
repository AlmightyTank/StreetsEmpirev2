import type { PrismaClient } from '@prisma/client';
import {
  STREET_PASS_SKIP_PRICES,
  streetPassCredToReach,
  streetPassSkipPrice,
  streetPassTierForCred,
  discountedDropPrice,
  type Ruleset,
  type StreetPassRules,
} from '@streets/rulesets';
import type { GameActionResult, StreetPassSkipQuoteDto, StreetPassSkipResultDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { dropDiscountFor } from './drop-catalog.service.js';
import { CrownWalletService } from './crown-wallet.service.js';
import { assertActionId } from './drop-purchase.service.js';
import { DropSettingsService, requireDropEnabled, switchesFor } from './drop-settings.service.js';
import { progressFor } from './street-pass-cred.service.js';
import type { sharedEntitlementRuntime } from './shared-entitlement-runtime.js';

type SharedRuntime = NonNullable<Awaited<ReturnType<typeof sharedEntitlementRuntime>>>;

/**
 * The Drop, Slice E: Street Pass level skips, bought with Crowns. A skip raises
 * the player's Cred to exactly the next tier's threshold, so any tier on the
 * track can be skipped to. It only moves Cred: the player still claims each
 * tier as usual, a skip never pays Crowns, and it can never go past the last
 * tier. Runs as a game action, so it holds the player's lock, replays a
 * repeated action id and refuses an ended round; the Crown debit commits with
 * the Cred or not at all.
 */

function requirePassRules(ruleset: Ruleset) {
  if (!ruleset.streetPass) throw AppError.notFound('STREET_PASS_OFF', 'This round has no Street Pass.');
  return ruleset.streetPass;
}

export const StreetPassSkipService = {
  async quote(prisma: PrismaClient, accountId: string, roundPlayerId: string, ruleset: Ruleset, shared?: SharedRuntime | null): Promise<StreetPassSkipQuoteDto> {
    const rules = ruleset.streetPass;
    const settings = await DropSettingsService.get(prisma);
    const [progress, wallet, discount] = await Promise.all([
      prisma.streetPassProgress.findUnique({ where: { roundPlayerId } }),
      shared
        ? shared.db.sharedCrownWallet.findUnique({ where: { accountId: shared.accountId }, select: { balance: true } })
        : prisma.crownWallet.findUnique({ where: { accountId }, select: { balance: true } }),
      dropDiscountFor(prisma, accountId, new Date()),
    ]);
    const tierCount = rules?.tiers.length ?? 0;
    const tier = rules ? streetPassTierForCred(rules, progress?.passKey === rules.key ? progress.cred : 0) : 0;
    return {
      enabled: Boolean(rules) && switchesFor(settings).streetPassSkips,
      tier,
      tierCount,
      remaining: Math.max(0, tierCount - tier),
      single: STREET_PASS_SKIP_PRICES.single,
      tenPack: STREET_PASS_SKIP_PRICES.tenPack,
      discount,
      balance: wallet?.balance ?? 0,
    };
  },

  async skip(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: { tiers: number; actionId: string; expectedFromTier: number },
    shared?: SharedRuntime | null,
  ): Promise<GameActionResult<StreetPassSkipResultDto>> {
    requireDropEnabled();
    assertActionId(input.actionId);
    const settings = await DropSettingsService.get(prisma);
    if (!switchesFor(settings).streetPassSkips) {
      throw new AppError(503, 'STREET_PASS_SKIPS_OFF', 'Street Pass level skips are paused right now.');
    }
    if (!Number.isSafeInteger(input.tiers) || input.tiers < 1 || input.tiers > STREET_PASS_SKIP_PRICES.maxPerPurchase) {
      throw AppError.badRequest('STREET_PASS_SKIP_INVALID', `Skip 1 to ${STREET_PASS_SKIP_PRICES.maxPerPurchase} tiers at a time.`, { tiers: 'Pick how many tiers to skip.' });
    }
    if (!Number.isSafeInteger(input.expectedFromTier) || input.expectedFromTier < 0 || input.expectedFromTier > 30) {
      throw AppError.badRequest('STREET_PASS_SKIP_INVALID', 'Refresh the Street Pass and try again.');
    }
    return ActionService.run<StreetPassSkipResultDto>(prisma, roundPlayerId, {
      action: 'STREET_PASS_SKIP',
      actionId: input.actionId,
      idempotencyScope: 'STREET_PASS_SKIP',
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const rules = requirePassRules(ruleset);
        const progress = await tx.streetPassProgress.findUnique({ where: { roundPlayerId } });
        const cred = progress?.passKey === rules.key ? progress.cred : 0;
        const fromTier = streetPassTierForCred(rules, cred);
        if (fromTier !== input.expectedFromTier) {
          throw AppError.conflict('STREET_PASS_SKIP_STALE', 'Street Pass progress changed before this skip completed. Refresh your tier and confirm the purchase again. No Crowns were charged.');
        }
        const last = rules.tiers.length;
        if (fromTier >= last) throw AppError.conflict('STREET_PASS_COMPLETE', 'You have already reached the last Street Pass tier.');
        if (fromTier + input.tiers > last) {
          throw AppError.conflict('STREET_PASS_SKIP_PAST_END', `Only ${last - fromTier} tier${last - fromTier === 1 ? '' : 's'} left to skip.`);
        }
        const toTier = fromTier + input.tiers;
        const priorSkips = await tx.dropOrder.findMany({
          where: { roundPlayerId, kind: 'STREET_PASS_SKIP', refKey: rules.key },
          select: { metadata: true },
        });
        const alreadyPurchased = priorSkips.some(({ metadata }) => {
          if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
          const transition = metadata as Record<string, unknown>;
          return transition.fromTier === fromTier && transition.toTier === toTier;
        });
        if (alreadyPurchased) {
          throw AppError.conflict('STREET_PASS_SKIP_ALREADY_PURCHASED', 'That Street Pass tier skip was already processed. Your Crowns were not charged again. Refresh the Street Pass to continue.');
        }
        const basePrice = streetPassSkipPrice(input.tiers);
        const discount = await dropDiscountFor(tx, player.accountId, now);
        const price = discountedDropPrice(basePrice, discount?.percent ?? 0);
        const targetCred = streetPassCredToReach(rules, toTier);

        const order = await tx.dropOrder.create({
          data: {
            accountId: player.accountId,
            // Its own namespace, so a skip id can never collide with an item purchase id.
            actionId: `skip:${input.actionId}`,
            kind: 'STREET_PASS_SKIP',
            refKey: rules.key,
            offerId: null,
            priceCrowns: price,
            grantedKeys: [],
            roundPlayerId,
            metadata: {
              fromTier,
              toTier,
              credBefore: cred,
              credAfter: targetCred,
              roundId: round.id,
              ...(discount ? { discountPercent: discount.percent, discountReason: discount.reason, priceBeforeDiscount: basePrice } : {}),
            },
            createdAt: now,
          },
        });
        await CrownWalletService.apply(tx, {
          accountId: player.accountId,
          kind: 'SPEND',
          delta: -price,
          source: 'street-pass-skip',
          externalRef: `street-pass-skip:${player.accountId}:${input.actionId}`,
          reason: `Street Pass tier ${fromTier} → ${toTier}`,
          metadata: { orderId: order.id, roundPlayerId, fromTier, toTier },
        });
        await raiseCred(tx, roundPlayerId, rules, targetCred);

        return {
          next: { ...current },
          result: {
            fromTier,
            toTier,
            priceCrowns: price,
            wallet: await CrownWalletService.view(tx, player.accountId, round.id, settings.roundEarnCap, shared),
          },
        };
      },
    });
  },
};

/** Lifts Cred to the target; never lowers it. Creates the progress row (with its late-join bonus) on first use. */
async function raiseCred(tx: Db, roundPlayerId: string, rules: StreetPassRules, target: number): Promise<void> {
  const progress = await progressFor(tx, roundPlayerId, rules);
  if (progress.passKey !== rules.key) {
    await tx.streetPassProgress.update({ where: { id: progress.id }, data: { passKey: rules.key, cred: target } });
  } else if (progress.cred < target) {
    await tx.streetPassProgress.update({ where: { id: progress.id }, data: { cred: target } });
  }
}
