import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { crownPack } from '@streets/rulesets';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { queueDiscordRoleResync } from './discord-resync.service.js';
import { SupporterService } from './supporter.service.js';
import { queueDropOrderNotification } from './drop-notification.service.js';
import { CrownWalletService, lockCrownWallet } from './crown-wallet.service.js';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const ACTIVE_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

interface PlaySubscription {
  startTime?: string;
  subscriptionState?: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    latestSuccessfulOrderId?: string;
    autoRenewingPlan?: {
      autoRenewEnabled?: boolean;
      recurringPrice?: { currencyCode?: string; amountMicros?: string; units?: string; nanos?: number };
    };
  }>;
}

interface PlayProductPurchase {
  purchaseState?: number;
  acknowledgementState?: number;
  consumptionState?: number;
  orderId?: string;
  purchaseTimeMillis?: string;
  regionCode?: string;
  obfuscatedExternalAccountId?: string;
}

interface PubSubEnvelope {
  message?: { data?: string; messageId?: string };
  subscription?: string;
}

interface DeveloperNotification {
  packageName?: string;
  testNotification?: { version?: string };
  subscriptionNotification?: { purchaseToken?: string; notificationType?: number };
  oneTimeProductNotification?: { purchaseToken?: string; sku?: string; notificationType?: number };
  /** productType 2 is a one-time product; refundType 1 is a full refund, 2 a partial one. */
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
}

/** RTDN oneTimeProductNotification types. */
const ONE_TIME_PRODUCT_PURCHASED = 1;
/** RTDN voidedPurchaseNotification values. */
const VOIDED_ONE_TIME_PRODUCT = 2;
const VOIDED_FULL_REFUND = 1;

export type PlayNotificationOutcome = 'applied' | 'unmatched' | 'ignored' | 'test';

function configRequired() {
  if (!env.googlePlay.enabled) {
    throw new AppError(503, 'PLAY_BILLING_UNAVAILABLE', 'Google Play supporting is not available yet.');
  }
  return env.googlePlay;
}

function credentials(): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(configRequired().serviceAccountJsonBase64, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new AppError(503, 'PLAY_BILLING_MISCONFIGURED', 'Google Play supporting is temporarily unavailable.');
  }
}

async function playRequest<T>(url: string, method: 'GET' | 'POST' = 'GET', data?: unknown): Promise<T> {
  const auth = new GoogleAuth({ credentials: credentials(), scopes: [ANDROID_PUBLISHER_SCOPE] });
  const client = await auth.getClient();
  const response = await client.request<T>({ url, method, data });
  return response.data;
}

async function fetchSubscription(purchaseToken: string): Promise<PlaySubscription> {
  const config = configRequired();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}`
    + `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  try {
    return await playRequest<PlaySubscription>(url);
  } catch {
    throw new AppError(400, 'PLAY_PURCHASE_INVALID', 'Google Play could not verify that purchase.');
  }
}

async function fetchProduct(productId: string, purchaseToken: string): Promise<PlayProductPurchase> {
  const config = configRequired();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}`
    + `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  try {
    return await playRequest<PlayProductPurchase>(url);
  } catch {
    throw new AppError(400, 'PLAY_PURCHASE_INVALID', 'Google Play could not verify that purchase.');
  }
}

async function acknowledge(purchaseToken: string): Promise<void> {
  const config = configRequired();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}`
    + `/purchases/subscriptions/${encodeURIComponent(config.supporterProductId)}`
    + `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  await playRequest<unknown>(url, 'POST');
}

/**
 * Crown packs are consumables: consuming one (which also acknowledges it) lets
 * the player buy the same pack again. Only ever called after the credit commits.
 */
async function consumeProduct(productId: string, purchaseToken: string): Promise<void> {
  const config = configRequired();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}`
    + `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`;
  await playRequest<unknown>(url, 'POST');
}

async function cancel(purchaseToken: string): Promise<void> {
  const config = configRequired();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}`
    + `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}:cancel`;
  await playRequest<unknown>(url, 'POST', {
    cancellationContext: { cancellationType: 'USER_REQUESTED_STOP_RENEWALS' },
  });
}

function date(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizedStatus(state: string): string {
  return state.replace(/^SUBSCRIPTION_STATE_/, '').toLowerCase();
}

export function parseGooglePlayRtdn(body: unknown): { messageId: string | null; notification: DeveloperNotification } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('PLAY_RTDN_INVALID', 'Expected a Pub/Sub JSON envelope.');
  }
  const envelope = body as PubSubEnvelope;
  const encoded = envelope.message?.data;
  if (typeof encoded !== 'string' || !encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw AppError.badRequest('PLAY_RTDN_INVALID', 'The Pub/Sub message has no valid data.');
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('not an object');
    return {
      messageId: typeof envelope.message?.messageId === 'string' ? envelope.message.messageId : null,
      notification: decoded as DeveloperNotification,
    };
  } catch {
    throw AppError.badRequest('PLAY_RTDN_INVALID', 'The Pub/Sub message data is invalid.');
  }
}

function recurringPriceCents(price: NonNullable<NonNullable<PlaySubscription['lineItems']>[number]['autoRenewingPlan']>['recurringPrice']): number {
  if (!price) return 0;
  if (price.amountMicros && /^\d+$/.test(price.amountMicros)) return Math.round(Number(price.amountMicros) / 10_000);
  const units = price.units && /^-?\d+$/.test(price.units) ? Number(price.units) : 0;
  const nanos = typeof price.nanos === 'number' && Number.isFinite(price.nanos) ? price.nanos : 0;
  return Math.max(0, Math.round(units * 100 + nanos / 10_000_000));
}

async function applyPurchase(prisma: PrismaClient, accountId: string, purchaseToken: string, purchase: PlaySubscription, now: Date): Promise<void> {
  const config = configRequired();
  const line = purchase.lineItems?.find((item) => item.productId === config.supporterProductId);
  if (!line || !purchase.startTime || !purchase.subscriptionState) {
    throw AppError.badRequest('PLAY_PRODUCT_INVALID', 'That purchase is not the StreetsEmpire supporter subscription.');
  }
  const expectedAccount = GooglePlayBillingService.obfuscatedAccountId(accountId);
  if (!expectedAccount || purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== expectedAccount) {
    throw new AppError(403, 'PLAY_ACCOUNT_MISMATCH', 'That Google Play purchase belongs to another StreetsEmpire account.');
  }

  const existing = await prisma.googlePlaySupporterSubscription.findUnique({ where: { purchaseToken }, select: { accountId: true } });
  if (existing && existing.accountId !== accountId) {
    throw new AppError(403, 'PLAY_PURCHASE_CLAIMED', 'That Google Play purchase is already linked to another account.');
  }

  const state = purchase.subscriptionState;
  const active = ACTIVE_STATES.has(state);
  const periodEnd = date(line.expiryTime);
  const startedAt = date(purchase.startTime)!;
  const autoRenewing = line.autoRenewingPlan?.autoRenewEnabled ?? false;
  const latestOrderId = line.latestSuccessfulOrderId ?? purchase.latestOrderId ?? null;
  const price = line.autoRenewingPlan?.recurringPrice;
  const amountCents = recurringPriceCents(price);

  await prisma.$transaction(async (tx) => {
    await tx.googlePlaySupporterSubscription.upsert({
      where: { purchaseToken },
      create: {
        purchaseToken, accountId, productId: config.supporterProductId,
        status: normalizedStatus(state), currentPeriodEnd: periodEnd, autoRenewing, startedAt,
        endedAt: active ? null : periodEnd, latestOrderId,
        linkedPurchaseToken: purchase.linkedPurchaseToken ?? null, lastVerifiedAt: now,
      },
      update: {
        status: normalizedStatus(state), currentPeriodEnd: periodEnd, autoRenewing,
        endedAt: active ? null : periodEnd, latestOrderId,
        linkedPurchaseToken: purchase.linkedPurchaseToken ?? null, lastVerifiedAt: now,
      },
    });

    if (purchase.linkedPurchaseToken) {
      await tx.googlePlaySupporterSubscription.updateMany({
        where: { purchaseToken: purchase.linkedPurchaseToken, accountId },
        data: { status: 'replaced', endedAt: now, lastVerifiedAt: now },
      });
    }

    if (active && latestOrderId) {
      const paymentId = `google-play:${latestOrderId}`;
      const alreadyRecorded = await tx.supporterPayment.findUnique({ where: { providerPaymentId: paymentId }, select: { id: true } });
      if (!alreadyRecorded) {
        await tx.supporterPayment.create({
          data: {
            accountId, provider: 'google_play', providerPaymentId: paymentId, amountCents,
            currency: price?.currencyCode?.toLowerCase() ?? 'unknown', status: 'paid', paidAt: now,
          },
        });
        const granted = [
          ...await SupporterService.grant(tx, accountId),
          ...await SupporterService.grantDrops(tx, accountId, now.toISOString().slice(0, 7), now),
          ...await SupporterService.grantTenure(tx, accountId, now),
        ];
        if (granted.length) {
          await tx.adminAuditLog.create({
            data: {
              actorAccountId: null, actorUsername: 'Google Play', action: 'account.grant-supporter',
              targetType: 'account', targetId: accountId, reason: `Verified Google Play order ${latestOrderId}`,
              after: { granted },
            },
          });
        }
      }
    }
    await queueDiscordRoleResync(tx, { accountIds: [accountId] }, 'Google Play supporter status change');
  });

  if (active && purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    try {
      await acknowledge(purchaseToken);
    } catch {
      throw new AppError(502, 'PLAY_ACKNOWLEDGEMENT_FAILED', 'The purchase was verified, but Google Play acknowledgement must be retried.');
    }
  }
}

export const GooglePlayBillingService = {
  obfuscatedAccountId(accountId: string): string | null {
    if (!env.googlePlay.enabled) return null;
    return createHmac('sha256', env.googlePlay.accountHashSecret).update(accountId).digest('hex');
  },

  /** Verify with Google before recording payment or granting any entitlement. */
  async verify(prisma: PrismaClient, accountId: string, purchaseToken: string, now = new Date()): Promise<void> {
    const purchase = await fetchSubscription(purchaseToken);
    await applyPurchase(prisma, accountId, purchaseToken, purchase, now);
  },

  /** Verify and credit one consumable Crown pack. Product, price and account are server-resolved. */
  async verifyCrownPack(prisma: PrismaClient, accountId: string, productId: string, purchaseToken: string, now = new Date()): Promise<void> {
    const config = configRequired();
    if (!config.crownPacksConfigured) throw new AppError(503, 'PLAY_CROWN_PACKS_UNAVAILABLE', 'Google Play Crown packs are not configured yet.');
    const packId = Object.entries(config.crownPackProductIds).find(([, id]) => id === productId)?.[0];
    const pack = packId ? crownPack(packId) : null;
    if (!pack) throw AppError.badRequest('PLAY_PRODUCT_INVALID', 'That Google Play product is not a StreetsEmpire Crown pack.');
    const purchase = await fetchProduct(productId, purchaseToken);
    if (purchase.obfuscatedExternalAccountId !== GooglePlayBillingService.obfuscatedAccountId(accountId)) {
      throw new AppError(403, 'PLAY_ACCOUNT_MISMATCH', 'That Google Play purchase belongs to another StreetsEmpire account.');
    }
    if (purchase.purchaseState !== 0) throw AppError.conflict('PLAY_PURCHASE_PENDING', 'Google Play has not confirmed that purchase yet.');
    const purchasedAt = purchase.purchaseTimeMillis && /^\d+$/.test(purchase.purchaseTimeMillis)
      ? new Date(Number(purchase.purchaseTimeMillis)) : now;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.googlePlayCrownPackOrder.findUnique({ where: { purchaseToken } });
      if (existing?.accountId && existing.accountId !== accountId) throw new AppError(403, 'PLAY_PURCHASE_CLAIMED', 'That Google Play purchase is already linked to another account.');
      const order = await tx.googlePlayCrownPackOrder.upsert({
        where: { purchaseToken },
        create: { purchaseToken, accountId, productId, packId: pack.id, crowns: pack.crowns, status: 'pending', orderId: purchase.orderId ?? null, currency: pack.currency, amountCents: pack.priceCents, purchasedAt, lastVerifiedAt: now },
        update: { accountId, productId, lastVerifiedAt: now, orderId: purchase.orderId ?? null, purchasedAt },
      });
      if (order.status === 'credited') return;
      await CrownWalletService.apply(tx, {
        accountId, kind: 'PAID_GRANT', delta: pack.crowns, source: `play-pack:${pack.id}`,
        externalRef: `play-pack:${purchaseToken}`, reason: `${pack.crowns} Crowns`,
        metadata: { purchaseToken, orderId: order.orderId, provider: 'google_play' },
      });
      await tx.googlePlayCrownPackOrder.update({ where: { purchaseToken }, data: { status: 'credited', creditedAt: now, lastVerifiedAt: now } });
      await queueDropOrderNotification(tx, accountId, `play-crown-pack:${purchaseToken}`, 'Crowns added to your wallet', `${pack.crowns.toLocaleString('en-US')} Crowns are ready to spend in The Drop.`);
    });
    // consumptionState 1 is already consumed. A failed consume is retried by the
    // next verify of this token; the credit above is idempotent, so it never pays twice.
    if (purchase.consumptionState !== 1) {
      try { await consumeProduct(productId, purchaseToken); }
      catch { throw new AppError(502, 'PLAY_CONSUME_FAILED', 'Your Crowns were added, but Google Play must finish the purchase. Reopen the app to retry.'); }
    }
  },

  /**
   * A voided (refunded or charged-back) Crown pack, from RTDN. Like Stripe: a
   * full refund takes the Crowns back while they are unspent; a partial refund,
   * or Crowns already spent, holds the wallet for support instead of going
   * negative. Runs even with Crown packs switched off, so refunds always land.
   */
  async refundCrownPack(prisma: PrismaClient, purchaseToken: string, full: boolean, at = new Date()): Promise<PlayNotificationOutcome> {
    return prisma.$transaction(async (tx) => {
      const order = await tx.googlePlayCrownPackOrder.findUnique({ where: { purchaseToken } });
      if (!order) return 'unmatched';
      if (order.status === 'refunded') return 'ignored';
      if (!order.accountId || (order.status !== 'credited' && order.status !== 'refund_review')) {
        await tx.googlePlayCrownPackOrder.update({ where: { purchaseToken }, data: { status: 'refunded', refundedAt: at, lastVerifiedAt: at } });
        return 'applied';
      }
      const wallet = await lockCrownWallet(tx, order.accountId);
      if (full && wallet.balance >= order.crowns) {
        await CrownWalletService.apply(tx, {
          accountId: order.accountId,
          kind: 'REVERSAL',
          delta: -order.crowns,
          source: 'refund',
          externalRef: `play-refund:${purchaseToken}`,
          reason: `Refunded ${order.packId} pack (Google Play)`,
          metadata: { purchaseToken, orderId: order.orderId, provider: 'google_play' },
          allowHeld: true,
        });
        await tx.googlePlayCrownPackOrder.update({ where: { purchaseToken }, data: { status: 'refunded', refundedAt: at, lastVerifiedAt: at } });
        return 'applied';
      }
      await CrownWalletService.hold(tx, order.accountId, `Refund on Google Play Crown pack ${order.orderId ?? purchaseToken} needs review.`, at);
      await tx.googlePlayCrownPackOrder.update({ where: { purchaseToken }, data: { status: 'refund_review', refundedAt: at, lastVerifiedAt: at } });
      return 'applied';
    });
  },

  async verifyRtdnAuthorization(authorization: string | undefined): Promise<void> {
    const config = env.googlePlay.rtdn;
    if (!config.enabled) throw AppError.notFound('NOT_FOUND', 'Not found.');
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
    if (!match) throw new AppError(401, 'PLAY_RTDN_UNAUTHENTICATED', 'A Pub/Sub identity token is required.');
    try {
      const ticket = await new OAuth2Client().verifyIdToken({ idToken: match[1]!, audience: config.audience });
      const payload = ticket.getPayload();
      if (payload?.email_verified !== true || payload.email?.toLowerCase() !== config.serviceAccountEmail) throw new Error('unexpected service account');
    } catch {
      throw new AppError(401, 'PLAY_RTDN_UNAUTHENTICATED', 'The Pub/Sub identity token is invalid.');
    }
  },

  async handleRtdn(prisma: PrismaClient, body: unknown, now = new Date()): Promise<{ outcome: PlayNotificationOutcome; messageId: string | null }> {
    const { notification, messageId } = parseGooglePlayRtdn(body);
    if (notification.packageName !== configRequired().packageName) return { outcome: 'ignored', messageId };
    if (notification.testNotification) return { outcome: 'test', messageId };
    const voided = notification.voidedPurchaseNotification;
    if (voided?.purchaseToken) {
      // Voided subscriptions keep their supporter rewards, which are never taken back.
      if (voided.productType !== VOIDED_ONE_TIME_PRODUCT) return { outcome: 'ignored', messageId };
      const outcome = await GooglePlayBillingService.refundCrownPack(prisma, voided.purchaseToken, voided.refundType === VOIDED_FULL_REFUND, now);
      return { outcome, messageId };
    }
    const purchaseToken = notification.subscriptionNotification?.purchaseToken;
    const productNotification = notification.oneTimeProductNotification;
    if (productNotification?.purchaseToken && productNotification.sku) {
      // A cancelled pending purchase has nothing to credit, and with packs switched
      // off there is nothing to sell; answering keeps Pub/Sub from retrying.
      if (productNotification.notificationType !== ONE_TIME_PRODUCT_PURCHASED || !env.googlePlay.crownPacksConfigured) {
        return { outcome: 'ignored', messageId };
      }
      const direct = await prisma.googlePlayCrownPackOrder.findUnique({ where: { purchaseToken: productNotification.purchaseToken }, select: { accountId: true } });
      if (!direct?.accountId) return { outcome: 'unmatched', messageId };
      await GooglePlayBillingService.verifyCrownPack(prisma, direct.accountId, productNotification.sku, productNotification.purchaseToken, now);
      return { outcome: 'applied', messageId };
    }
    if (!purchaseToken) return { outcome: 'ignored', messageId };

    const purchase = await fetchSubscription(purchaseToken);
    const direct = await prisma.googlePlaySupporterSubscription.findUnique({ where: { purchaseToken }, select: { accountId: true } });
    const linked = !direct && purchase.linkedPurchaseToken
      ? await prisma.googlePlaySupporterSubscription.findUnique({ where: { purchaseToken: purchase.linkedPurchaseToken }, select: { accountId: true } })
      : null;
    const accountId = direct?.accountId ?? linked?.accountId;
    // The authenticated app claims a first purchase because the account hash is intentionally irreversible.
    if (!accountId) return { outcome: 'unmatched', messageId };
    await applyPurchase(prisma, accountId, purchaseToken, purchase, now);
    return { outcome: 'applied', messageId };
  },

  async cancelSubscription(purchaseToken: string): Promise<void> {
    await cancel(purchaseToken);
  },
};
