import type { DropOrder, PrismaClient } from '@prisma/client';
import { DROP_BUNDLES, DROP_ITEMS, DROP_SOURCE, DROP_SOURCE_VERSION, dropMinAccountLevel } from '@streets/rulesets';
import { experienceLevelFor, type DropOrderDto, type DropPurchaseResultDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { CrownWalletService, lockCrownWallet } from './crown-wallet.service.js';
import { dropDiscountFor, offerKeys, priceForAccount, resolveOffer } from './drop-catalog.service.js';
import { DropSettingsService, requireDropEnabled, switchesFor } from './drop-settings.service.js';
import { RoundService } from './round.service.js';
import type { sharedEntitlementRuntime } from './shared-entitlement-runtime.js';
import { applySharedDropPurchase } from './shared-entitlement-runtime.js';

type SharedRuntime = NonNullable<Awaited<ReturnType<typeof sharedEntitlementRuntime>>>;

/**
 * The Drop, Slice C: buying an item or bundle with Crowns. One transaction:
 *
 *   lock wallet -> replay check -> resolve the offer on the server clock ->
 *   refuse owned content -> debit -> grant permanent unlocks -> write the order
 *
 * Either all of it commits or none of it does. The (account, actionId) pair is
 * the idempotency key: a retried or double-tapped purchase answers with the
 * original order and never charges twice.
 */

const ACTION_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function orderLabel(order: Pick<DropOrder, 'kind' | 'refKey' | 'metadata'>): string {
  if (order.kind === 'STREET_PASS_SKIP') {
    const meta = (order.metadata ?? {}) as { fromTier?: number; toTier?: number };
    return `Street Pass skip: tier ${meta.fromTier ?? '?'} → ${meta.toTier ?? '?'}`;
  }
  return DROP_ITEMS[order.refKey]?.name ?? DROP_BUNDLES[order.refKey]?.name ?? order.refKey;
}

export function orderDto(order: DropOrder): DropOrderDto {
  return {
    id: order.id,
    kind: order.kind as DropOrderDto['kind'],
    refKey: order.refKey,
    label: orderLabel(order),
    priceCrowns: order.priceCrowns,
    grantedKeys: [...order.grantedKeys],
    createdAt: order.createdAt.toISOString(),
  };
}

export function assertActionId(actionId: string): void {
  if (!ACTION_ID.test(actionId)) {
    throw AppError.badRequest('ACTION_ID_INVALID', 'Send a purchase id of 8 to 80 letters, numbers, dashes or underscores.');
  }
}

/** Writes the permanent unlocks for Drop keys the account does not hold yet. Returns the keys it added. */
export async function grantDropUnlocks(tx: Db, accountId: string, keys: readonly string[], at: Date): Promise<string[]> {
  const held = new Set((await tx.accountCosmeticUnlock.findMany({
    where: { accountId, key: { in: [...keys] } },
    select: { key: true },
  })).map((row) => row.key));
  const added: string[] = [];
  for (const key of keys) {
    const item = DROP_ITEMS[key];
    if (!item || held.has(key)) continue;
    await tx.accountCosmeticUnlock.create({
      data: {
        accountId,
        key: item.key,
        kind: item.kind,
        title: item.name,
        description: item.description,
        rarity: item.rarity,
        styleKey: item.styleKey ?? null,
        sourceQuestKey: DROP_SOURCE,
        sourceRulesetId: DROP_SOURCE,
        sourceRulesetVersion: DROP_SOURCE_VERSION,
        awardedAt: at,
      },
    });
    held.add(key);
    added.push(key);
  }
  return added;
}

export const DropPurchaseService = {
  async purchase(
    prisma: PrismaClient,
    accountId: string,
    input: { offerId: string; actionId: string },
    now = new Date(),
    shared?: SharedRuntime | null,
  ): Promise<DropPurchaseResultDto> {
    requireDropEnabled();
    assertActionId(input.actionId);
    const [settings, round] = await Promise.all([DropSettingsService.get(prisma), RoundService.getCurrent(prisma)]);
    if (!switchesFor(settings).purchases) {
      throw new AppError(503, 'DROP_PURCHASES_OFF', 'Purchases in The Drop are paused right now. Your Crowns and items are safe.');
    }

    return prisma.$transaction(async (tx) => {
      // The wallet lock comes first so a racing duplicate waits, then sees the order below.
      if (!shared) await lockCrownWallet(tx, accountId);
      const replay = await tx.dropOrder.findUnique({ where: { accountId_actionId: { accountId, actionId: input.actionId } } });
      if (replay) {
        if (replay.offerId !== input.offerId) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That purchase id was already used for something else.');
        }
        return {
          order: orderDto(replay),
          wallet: await CrownWalletService.view(tx, accountId, round?.id ?? null, settings.roundEarnCap, shared),
          replayed: true,
        };
      }

      const { offer, catalog } = await resolveOffer(tx, input.offerId, now);
      const keys = offerKeys(offer.kind, offer.refKey);
      if (!keys.length) throw AppError.conflict('DROP_OFFER_EXPIRED', 'That offer is not in the shop right now.');
      const minLevel = dropMinAccountLevel(keys);
      if (minLevel > 0) {
        const account = await tx.account.findUniqueOrThrow({ where: { id: accountId }, select: { experiencePoints: true } });
        const level = experienceLevelFor(account.experiencePoints);
        if (level < minLevel) {
          throw new AppError(403, 'DROP_LEVEL_REQUIRED', `This set is for account level ${minLevel} and up. You are level ${level}.`);
        }
      }
      const [localOwnedRows, sharedOwnedRows] = await Promise.all([(tx.accountCosmeticUnlock.findMany({
        where: { accountId, key: { in: keys } },
        select: { key: true },
      })), shared ? shared.db.sharedCosmeticUnlock.findMany({
        where: { accountId: shared.accountId, key: { in: keys }, source: 'drop' }, select: { key: true },
      }) : Promise.resolve([])]);
      const owned = new Set([...localOwnedRows, ...sharedOwnedRows].map((row) => row.key));
      const discount = await dropDiscountFor(tx, accountId, now);
      const { price, basePrice, grants } = priceForAccount(offer, catalog, owned, discount?.percent ?? 0);
      if (!grants.length) {
        throw AppError.conflict('DROP_ALREADY_OWNED', offer.kind === 'ITEM' ? 'You already own that.' : 'You already own everything in that bundle.');
      }
      if (!Number.isSafeInteger(price) || price <= 0) {
        throw AppError.conflict('DROP_PRICE_INVALID', 'That offer has no valid price. Refresh The Drop.');
      }

      const order = await tx.dropOrder.create({
        data: {
          accountId,
          actionId: input.actionId,
          kind: offer.kind,
          refKey: offer.refKey,
          offerId: offer.id,
          priceCrowns: price,
          grantedKeys: grants,
          metadata: {
            slot: offer.slot,
            badge: offer.badge,
            listPrice: offer.priceCrowns,
            ownedBefore: [...owned],
            ...(discount ? { discountPercent: discount.percent, discountReason: discount.reason, priceBeforeDiscount: basePrice } : {}),
          },
          createdAt: now,
        },
      });
      if (shared) {
        await applySharedDropPurchase(shared, { actionId: input.actionId, orderId: order.id, refKey: offer.refKey, price, keys: grants, now });
      } else {
        await CrownWalletService.apply(tx, {
          accountId,
          kind: 'SPEND',
          delta: -price,
          source: 'drop-order',
          externalRef: `order:${order.id}`,
          reason: orderLabel(order),
          metadata: { orderId: order.id, offerId: offer.id, refKey: offer.refKey },
        });
      }
      const granted = await grantDropUnlocks(tx, accountId, grants, now);
      if (granted.length !== grants.length) {
        // Another path granted one of these inside our lock window; never charge for it.
        throw AppError.conflict('DROP_ALREADY_OWNED', 'Part of that was already on your account. Nothing was charged; refresh and try again.');
      }
      return {
        order: orderDto(order),
        wallet: await CrownWalletService.view(tx, accountId, round?.id ?? null, settings.roundEarnCap, shared),
        replayed: false,
      };
    });
  },

  async orders(db: Db | PrismaClient, accountId: string, limit = 50): Promise<DropOrderDto[]> {
    const rows = await db.dropOrder.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map(orderDto);
  },
};
