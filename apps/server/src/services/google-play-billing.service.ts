import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { queueDiscordRoleResync } from './discord-resync.service.js';
import { SupporterService } from './supporter.service.js';

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

interface PubSubEnvelope {
  message?: { data?: string; messageId?: string };
  subscription?: string;
}

interface DeveloperNotification {
  packageName?: string;
  testNotification?: { version?: string };
  subscriptionNotification?: { purchaseToken?: string; notificationType?: number };
}

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

async function acknowledge(purchaseToken: string): Promise<void> {
  const config = configRequired();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}`
    + `/purchases/subscriptions/${encodeURIComponent(config.supporterProductId)}`
    + `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
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
    const purchaseToken = notification.subscriptionNotification?.purchaseToken;
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
