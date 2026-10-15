import type { Account, GooglePlaySupporterSubscription, PrismaClient, SupporterMembership } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { SUPPORTER_DROP_SOURCE, SUPPORTER_TENURE_SOURCE, supporterDropFor, supporterMonth } from '@streets/rulesets';
import type { SupporterMembershipDto, SupporterRedirectDto, SupporterStatusDto } from '@streets/shared';
import { env } from '../config/env.js';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { stripeApi, type StripeApi, type StripeEvent } from './stripe.client.js';
import { SupporterService } from './supporter.service.js';
import { queueDiscordRoleResync } from './discord-resync.service.js';
import { GooglePlayBillingService } from './google-play-billing.service.js';

/** Statuses that count as supporting right now. past_due is still retrying a payment. */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);
/** A new checkout is refused while one of these is running; the billing portal manages it instead. */
const RUNNING_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);
/** Shown as the actor on audit entries written for a Stripe payment. */
export const STRIPE_AUDIT_ACTOR = 'Stripe';
const PREVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface SupporterSubscriptionsToCancel {
  stripeSubscriptionId: string | null;
  playPurchaseTokens: string[];
}

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : null;
}

function monthStart(month: string): Date {
  const [year, zeroMonth] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, zeroMonth! - 1, 1));
}

function nextMonth(month: string): string {
  const start = monthStart(month);
  start.setUTCMonth(start.getUTCMonth() + 1);
  return supporterMonth(start);
}

function previewFor(month: string, now: Date, hasRewards: boolean): SupporterStatusDto['supporterPreview'] {
  if (!hasRewards) return null;
  const bundle = supporterDropFor(month);
  if (!bundle?.length) return null;
  const availableAt = monthStart(month);
  const earlyAt = new Date(availableAt.getTime() - PREVIEW_WINDOW_MS);
  if (now < earlyAt || now >= availableAt) return null;
  return {
    month,
    name: bundle.length > 1 ? `${bundle[0]!.name} +${bundle.length - 1}` : bundle[0]!.name,
    availableAt: availableAt.toISOString(),
    items: bundle.map((item) => ({
      name: item.name,
      description: item.description,
      kind: item.kind,
      rarity: item.rarity,
      styleKey: item.styleKey ?? null,
    })),
  };
}

/** An id, whether Stripe sent it as a string or as an expanded object. */
function id(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  const id = obj(value)?.id;
  return typeof id === 'string' && id ? id : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function seconds(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function cents(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : 0;
}

/** The accountId we put on the checkout session and subscription metadata. */
function metadataAccount(value: unknown): string | null {
  return text(obj(value)?.accountId);
}

function giftMetadata(value: unknown): { gifterAccountId: string; recipientAccountId: string } | null {
  const meta = obj(value);
  const gifterAccountId = text(meta?.gifterAccountId);
  const recipientAccountId = text(meta?.recipientAccountId);
  return gifterAccountId && recipientAccountId ? { gifterAccountId, recipientAccountId } : null;
}

export function membershipDto(row: SupporterMembership): SupporterMembershipDto {
  return {
    provider: 'stripe',
    status: row.status,
    active: ACTIVE_STATUSES.has(row.status),
    paymentFailing: row.status === 'past_due' || row.status === 'unpaid',
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

function liveStripe(): StripeApi {
  if (!env.stripe.enabled) throw new AppError(503, 'SUPPORTING_UNAVAILABLE', 'Supporting is not open yet. Check back soon.');
  return stripeApi(env.stripe.secretKey);
}

/** Finds the account an event belongs to: our metadata first, then the Stripe customer or subscription. */
async function accountFor(
  tx: Db,
  refs: { accountId?: string | null; customerId?: string | null; subscriptionId?: string | null },
): Promise<string | null> {
  if (refs.accountId) {
    const account = await tx.account.findUnique({ where: { id: refs.accountId }, select: { id: true } });
    if (account) return account.id;
  }
  if (refs.customerId) {
    const membership = await tx.supporterMembership.findUnique({ where: { stripeCustomerId: refs.customerId }, select: { accountId: true } });
    if (membership) return membership.accountId;
  }
  if (refs.subscriptionId) {
    const membership = await tx.supporterMembership.findUnique({ where: { stripeSubscriptionId: refs.subscriptionId }, select: { accountId: true } });
    if (membership) return membership.accountId;
  }
  return null;
}

interface MembershipChange {
  customerId: string;
  subscriptionId?: string | null | undefined;
  status?: string | undefined;
  currentPeriodEnd?: Date | null | undefined;
  cancelAtPeriodEnd?: boolean | undefined;
  endedAt?: Date | null | undefined;
}

/**
 * Creates or updates the membership. Status fields from an event older than the
 * newest one already applied are ignored, since Stripe does not promise order.
 */
async function applyMembership(tx: Db, accountId: string, change: MembershipChange, eventAt: Date): Promise<void> {
  const existing = await tx.supporterMembership.findUnique({ where: { accountId } });
  // A late event about an old, replaced subscription must not touch the current one.
  if (existing?.stripeSubscriptionId && change.subscriptionId && existing.stripeSubscriptionId !== change.subscriptionId
    && existing.stripeEventAt && existing.stripeEventAt > eventAt) return;
  const stale = Boolean(existing?.stripeEventAt && existing.stripeEventAt > eventAt);
  const status = stale ? {} : {
    ...(change.status !== undefined ? { status: change.status } : {}),
    ...(change.currentPeriodEnd !== undefined ? { currentPeriodEnd: change.currentPeriodEnd } : {}),
    ...(change.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: change.cancelAtPeriodEnd } : {}),
    ...(change.endedAt !== undefined ? { endedAt: change.endedAt } : {}),
    stripeEventAt: eventAt,
  };
  if (!existing) {
    await tx.supporterMembership.create({
      data: {
        accountId,
        stripeCustomerId: change.customerId,
        stripeSubscriptionId: change.subscriptionId ?? null,
        status: change.status ?? 'incomplete',
        currentPeriodEnd: change.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: change.cancelAtPeriodEnd ?? false,
        endedAt: change.endedAt ?? null,
        stripeEventAt: eventAt,
      },
    });
    await queueDiscordRoleResync(tx, { accountIds: [accountId] }, 'Supporter status change');
    return;
  }
  await tx.supporterMembership.update({
    where: { accountId },
    data: {
      stripeCustomerId: change.customerId,
      ...(change.subscriptionId ? { stripeSubscriptionId: change.subscriptionId } : {}),
      ...status,
    },
  });
  await queueDiscordRoleResync(tx, { accountIds: [accountId] }, 'Supporter status change');
}

export function playMembershipDto(row: GooglePlaySupporterSubscription, now = new Date()): SupporterMembershipDto {
  const active = row.status === 'active' || row.status === 'in_grace_period'
    || (row.status === 'canceled' && Boolean(row.currentPeriodEnd && row.currentPeriodEnd > now));
  return {
    provider: 'google_play',
    status: row.status,
    active,
    paymentFailing: row.status === 'in_grace_period' || row.status === 'on_hold',
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: active && !row.autoRenewing,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

/**
 * Gives the rewards the account is missing, plus the drop for the month the
 * payment landed in, and records it in the audit log as Stripe.
 */
async function grantRewards(tx: Db, accountId: string, reason: string, paidAt: Date): Promise<string[]> {
  const granted = await SupporterService.grant(tx, accountId);
  const drops = await SupporterService.grantDrops(tx, accountId, supporterMonth(paidAt), paidAt);
  granted.push(...drops);
  granted.push(...await SupporterService.grantTenure(tx, accountId, paidAt));
  if (granted.length) {
    await tx.adminAuditLog.create({
      data: {
        actorAccountId: null,
        actorUsername: STRIPE_AUDIT_ACTOR,
        action: 'account.grant-supporter',
        targetType: 'account',
        targetId: accountId,
        reason,
        after: { granted },
      },
    });
  }
  await queueDiscordRoleResync(tx, { accountIds: [accountId] }, 'Supporter reward grant');
  return granted;
}

async function grantGift(tx: Db, gift: { gifterAccountId: string; recipientAccountId: string; stripeId: string; customerId: string; amountCents: number; currency: string; paidAt: Date }): Promise<string[]> {
  const recipient = await tx.account.findUnique({ where: { id: gift.recipientAccountId }, select: { id: true } });
  const gifter = await tx.account.findUnique({ where: { id: gift.gifterAccountId }, select: { id: true } });
  if (!recipient || !gifter || gift.amountCents <= 0) return [];
  await tx.supporterPayment.upsert({
    where: { stripeInvoiceId: gift.stripeId },
    create: {
      accountId: gift.gifterAccountId,
      providerPaymentId: gift.stripeId,
      stripeInvoiceId: gift.stripeId,
      stripeCustomerId: gift.customerId,
      amountCents: gift.amountCents,
      currency: gift.currency,
      status: 'paid',
      paidAt: gift.paidAt,
    },
    update: {},
  });
  const granted = [
    ...await SupporterService.grantDrops(tx, gift.recipientAccountId, supporterMonth(gift.paidAt), gift.paidAt),
    ...await SupporterService.grantTenure(tx, gift.gifterAccountId, gift.paidAt),
  ];
  if (granted.length) {
    await tx.adminAuditLog.create({
      data: {
        actorAccountId: gift.gifterAccountId,
        actorUsername: STRIPE_AUDIT_ACTOR,
        action: 'account.grant-supporter',
        targetType: 'account',
        targetId: gift.recipientAccountId,
        reason: `Supporter gift ${gift.stripeId}`,
        after: { granted, gifterAccountId: gift.gifterAccountId },
      },
    });
  }
  await queueDiscordRoleResync(tx, { accountIds: [gift.gifterAccountId, gift.recipientAccountId] }, 'Supporter gift grant');
  return granted;
}

/** The newest paid supporter payment from a customer, for marking a refund or dispute. */
async function markLatestPayment(tx: Db, customerId: string, status: 'refunded' | 'disputed'): Promise<boolean> {
  const payment = await tx.supporterPayment.findFirst({
    where: { stripeCustomerId: customerId, status: 'paid' },
    orderBy: { paidAt: 'desc' },
  });
  if (!payment) return false;
  await tx.supporterPayment.update({ where: { id: payment.id }, data: { status } });
  return true;
}

/** What one event did, for the webhook log line. */
export type StripeEventOutcome = 'duplicate' | 'ignored' | 'unmatched' | 'applied' | 'granted';

async function applyEvent(tx: Db, event: StripeEvent, context: { disputedCustomerId?: string | null }): Promise<StripeEventOutcome> {
  const data = event.data.object;
  const eventAt = new Date(event.created * 1000);

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const customerId = id(data.customer);
      const sessionId = text(data.id);
      const gift = giftMetadata(data.metadata);
      if (gift) {
        const paid = data.payment_status === 'paid';
        if (!paid || !sessionId) return 'applied';
        const granted = await grantGift(tx, {
          ...gift,
          stripeId: `gift:${sessionId}`,
          customerId: customerId ?? `checkout:${sessionId}`,
          amountCents: cents(data.amount_total),
          currency: text(data.currency) ?? 'usd',
          paidAt: eventAt,
        });
        return granted.length ? 'granted' : 'applied';
      }
      if (data.mode !== 'subscription') return 'ignored';
      if (!customerId) return 'ignored';
      const accountId = await accountFor(tx, { accountId: text(data.client_reference_id) ?? metadataAccount(data.metadata), customerId });
      if (!accountId) return 'unmatched';
      const paid = data.payment_status === 'paid';
      await applyMembership(tx, accountId, {
        customerId,
        subscriptionId: id(data.subscription),
        ...(paid ? { status: 'active' } : {}),
      }, eventAt);
      if (!paid) return 'applied';
      const granted = await grantRewards(tx, accountId, `Stripe checkout ${text(data.id) ?? ''}`.trim(), eventAt);
      return granted.length ? 'granted' : 'applied';
    }

    case 'invoice.paid': {
      const customerId = id(data.customer);
      const parent = obj(obj(data.parent)?.subscription_details);
      const details = obj(data.subscription_details) ?? parent;
      const subscriptionId = id(data.subscription) ?? id(parent?.subscription);
      const gift = giftMetadata(details?.metadata) ?? giftMetadata(data.metadata);
      if (gift) {
        const amount = cents(data.amount_paid);
        const invoiceId = text(data.id);
        const paidAt = seconds(obj(data.status_transitions)?.paid_at) ?? eventAt;
        if (!invoiceId || amount <= 0) return 'applied';
        const granted = await grantGift(tx, {
          ...gift,
          stripeId: invoiceId,
          customerId: customerId ?? `invoice:${invoiceId}`,
          amountCents: amount,
          currency: text(data.currency) ?? 'usd',
          paidAt,
        });
        return granted.length ? 'granted' : 'applied';
      }
      // Only subscription invoices for supporting; anything else on the Stripe account is not ours.
      if (!customerId || !subscriptionId) return 'ignored';
      const accountId = await accountFor(tx, { accountId: metadataAccount(details?.metadata), customerId, subscriptionId });
      if (!accountId) return 'unmatched';
      await applyMembership(tx, accountId, { customerId, subscriptionId, status: 'active' }, eventAt);
      const amount = cents(data.amount_paid);
      const invoiceId = text(data.id);
      // A free trial or 100% coupon is not a payment, so it records and grants nothing.
      if (amount <= 0 || !invoiceId) return 'applied';
      const paidAt = seconds(obj(data.status_transitions)?.paid_at) ?? eventAt;
      await tx.supporterPayment.upsert({
        where: { stripeInvoiceId: invoiceId },
        create: {
          accountId,
          providerPaymentId: invoiceId,
          stripeInvoiceId: invoiceId,
          stripeCustomerId: customerId,
          amountCents: amount,
          currency: text(data.currency) ?? 'usd',
          status: 'paid',
          paidAt,
        },
        update: {},
      });
      const granted = await grantRewards(tx, accountId, `Stripe invoice ${invoiceId}`, paidAt);
      return granted.length ? 'granted' : 'applied';
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const customerId = id(data.customer);
      const subscriptionId = text(data.id);
      if (!customerId || !subscriptionId) return 'ignored';
      const accountId = await accountFor(tx, { accountId: metadataAccount(data.metadata), customerId, subscriptionId });
      if (!accountId) return 'unmatched';
      // Newer API versions keep the billing period on the subscription item.
      const firstItem = obj((obj(data.items)?.data as unknown[] | undefined)?.[0]);
      await applyMembership(tx, accountId, {
        customerId,
        subscriptionId,
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : text(data.status) ?? 'incomplete',
        currentPeriodEnd: seconds(data.current_period_end) ?? seconds(firstItem?.current_period_end),
        cancelAtPeriodEnd: data.cancel_at_period_end === true || typeof data.cancel_at === 'number',
        endedAt: seconds(data.ended_at),
      }, eventAt);
      return 'applied';
    }

    case 'charge.refunded': {
      // Only a full refund marks the payment. Rewards are kept either way.
      const customerId = id(data.customer);
      if (!customerId || data.refunded !== true) return 'ignored';
      return await markLatestPayment(tx, customerId, 'refunded') ? 'applied' : 'unmatched';
    }

    case 'charge.dispute.created': {
      const customerId = context.disputedCustomerId;
      if (!customerId) return 'unmatched';
      return await markLatestPayment(tx, customerId, 'disputed') ? 'applied' : 'unmatched';
    }

    default:
      return 'ignored';
  }
}

/**
 * Supporter payments through Stripe Checkout. A paid checkout or invoice grants
 * the supporter rewards at once (SupporterService.grant, idempotent), and
 * subscription events keep the membership status current. Nothing here ever
 * takes rewards back: refunds and disputes are recorded for admins only.
 */
export const SupporterBillingService = {
  async status(prisma: PrismaClient, accountId: string, now = new Date()): Promise<SupporterStatusDto> {
    const month = supporterMonth(now);
    const bundle = supporterDropFor(month);
    const [since, membership, playMembership, profile, drops] = await Promise.all([
      SupporterService.since(prisma, accountId),
      prisma.supporterMembership.findUnique({ where: { accountId } }),
      prisma.googlePlaySupporterSubscription.findFirst({ where: { accountId }, orderBy: { lastVerifiedAt: 'desc' } }),
      prisma.accountProfile.findUnique({ where: { accountId }, select: { showOnSupporterList: true, releaseNotesCreditOptIn: true } }),
      prisma.accountCosmeticUnlock.findMany({
        where: { accountId, sourceRulesetId: { in: [SUPPORTER_DROP_SOURCE, SUPPORTER_TENURE_SOURCE] } },
        select: { key: true, title: true, sourceRulesetVersion: true },
        orderBy: { sourceRulesetVersion: 'desc' },
      }),
    ]);
    const hasRewards = since !== null;
    const playDto = playMembership ? playMembershipDto(playMembership, now) : null;
    const currentMembership: SupporterMembershipDto | null = playDto && (playDto.active || !membership)
      ? playDto
      : membership ? membershipDto(membership) : null;
    return {
      checkoutEnabled: env.stripe.enabled,
      playBilling: {
        enabled: env.googlePlay.enabled,
        obfuscatedAccountId: GooglePlayBillingService.obfuscatedAccountId(accountId),
      },
      hasRewards,
      since: since?.toISOString() ?? null,
      membership: currentMembership,
      listed: hasRewards && (profile?.showOnSupporterList ?? false),
      releaseNotesCreditOptIn: hasRewards && (profile?.releaseNotesCreditOptIn ?? false),
      drop: bundle?.length
        ? {
          month,
          name: bundle.length > 1 ? `${bundle[0]!.name} +${bundle.length - 1}` : bundle[0]!.name,
          held: bundle.every((item) => drops.some((row) => row.key === item.key)),
        }
        : null,
      supporterPreview: previewFor(nextMonth(month), now, hasRewards),
      dropsHeld: drops.map((row) => ({ month: row.sourceRulesetVersion, name: row.title })),
    };
  },

  /** Puts the account on the public thank-you list, or takes it off. Only supporters can be listed. */
  async setListed(prisma: PrismaClient, accountId: string, listed: boolean): Promise<SupporterStatusDto> {
    if (listed && !(await SupporterService.since(prisma, accountId))) {
      throw AppError.conflict('NOT_A_SUPPORTER', 'The thank-you list is for supporters. Support StreetsEmpire first.');
    }
    await prisma.accountProfile.upsert({
      where: { accountId },
      create: { accountId, showOnSupporterList: listed },
      update: { showOnSupporterList: listed },
    });
    return SupporterBillingService.status(prisma, accountId);
  },

  async setReleaseNotesCredit(prisma: PrismaClient, accountId: string, optIn: boolean): Promise<SupporterStatusDto> {
    if (optIn && !(await SupporterService.since(prisma, accountId))) {
      throw AppError.conflict('NOT_A_SUPPORTER', 'Release-notes credits are for supporters. Support StreetsEmpire first.');
    }
    await prisma.accountProfile.upsert({
      where: { accountId },
      create: { accountId, releaseNotesCreditOptIn: optIn },
      update: { releaseNotesCreditOptIn: optIn },
    });
    return SupporterBillingService.status(prisma, accountId);
  },

  /** A Stripe Checkout link for the supporter subscription, tied to this account. */
  async startCheckout(prisma: PrismaClient, account: Pick<Account, 'id' | 'email'>, api: StripeApi = liveStripe()): Promise<SupporterRedirectDto> {
    const membership = await prisma.supporterMembership.findUnique({ where: { accountId: account.id } });
    if (membership && RUNNING_STATUSES.has(membership.status)) {
      throw AppError.conflict('ALREADY_SUPPORTING', 'You already support StreetsEmpire. Use Manage support to change or cancel it.');
    }
    const session = await api.createCheckoutSession({
      mode: 'subscription',
      line_items: [{ price: env.stripe.supporterPriceId, quantity: 1 }],
      client_reference_id: account.id,
      metadata: { accountId: account.id },
      subscription_data: { metadata: { accountId: account.id } },
      // Reuse the Stripe customer from an earlier subscription so billing history stays together.
      ...(membership ? { customer: membership.stripeCustomerId } : { customer_email: account.email }),
      success_url: `${env.frontendOrigin}/game/supporter?supporter=thanks`,
      cancel_url: `${env.frontendOrigin}/game/supporter?supporter=cancelled`,
    });
    return { url: session.url };
  },

  /** One-time gift checkout: payer gets paid-month tenure credit; recipient gets only the current-month bundle. */
  async startGiftCheckout(prisma: PrismaClient, account: Pick<Account, 'id' | 'email'>, recipientAccountId: string, api: StripeApi = liveStripe()): Promise<SupporterRedirectDto> {
    if (recipientAccountId === account.id) {
      throw AppError.conflict('CANNOT_GIFT_SELF', 'Choose another player to gift a supporter month to.');
    }
    const recipient = await prisma.account.findUnique({ where: { id: recipientAccountId }, select: { id: true, isActive: true } });
    if (!recipient?.isActive) throw AppError.notFound('RECIPIENT_NOT_FOUND', 'That player account was not found.');
    const metadata = { gifterAccountId: account.id, recipientAccountId };
    const session = await api.createCheckoutSession({
      mode: 'payment',
      line_items: [{ price: env.stripe.supporterPriceId, quantity: 1 }],
      client_reference_id: account.id,
      metadata,
      customer_email: account.email,
      success_url: `${env.frontendOrigin}/game/supporter?supporter=gift-thanks`,
      cancel_url: `${env.frontendOrigin}/game/supporter?supporter=gift-cancelled`,
    });
    return { url: session.url };
  },

  /** Stripe's billing portal, where a supporter updates their card or cancels. */
  async openPortal(prisma: PrismaClient, accountId: string, api: StripeApi = liveStripe()): Promise<SupporterRedirectDto> {
    const membership = await prisma.supporterMembership.findUnique({ where: { accountId } });
    if (!membership) throw AppError.notFound('NO_SUPPORTER_BILLING', 'There is no supporter billing on this account yet.');
    return api.createPortalSession({ customer: membership.stripeCustomerId, return_url: `${env.frontendOrigin}/game/supporter` });
  },

  /**
   * Applies one verified webhook event exactly once. The event id is recorded in
   * the same transaction as its changes, so a failure rolls both back and Stripe's
   * retry applies it cleanly.
   */
  async handleEvent(prisma: PrismaClient, event: StripeEvent, api?: StripeApi): Promise<StripeEventOutcome> {
    const seen = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id }, select: { id: true } });
    if (seen) return 'duplicate';
    // A dispute names only the charge; look its customer up before taking any locks.
    let disputedCustomerId: string | null = null;
    if (event.type === 'charge.dispute.created') {
      const chargeId = id(event.data.object.charge);
      if (chargeId) disputedCustomerId = (await (api ?? liveStripe()).retrieveCharge(chargeId)).customer;
    }
    return prisma.$transaction(async (tx) => {
      if (await tx.stripeWebhookEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return 'duplicate' as const;
      const outcome = await applyEvent(tx, event, { disputedCustomerId });
      await tx.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
      return outcome;
    });
  },

  /** Read before an account is erased, since deleting it outright removes provider identifiers. */
  async subscriptionsToCancel(prisma: PrismaClient, accountId: string): Promise<SupporterSubscriptionsToCancel> {
    const [membership, playMemberships] = await Promise.all([
      prisma.supporterMembership.findUnique({ where: { accountId }, select: { stripeSubscriptionId: true, status: true } }),
      prisma.googlePlaySupporterSubscription.findMany({
        where: { accountId, autoRenewing: true, status: { notIn: ['expired', 'replaced'] } },
        select: { purchaseToken: true },
      }),
    ]);
    return {
      stripeSubscriptionId: membership?.stripeSubscriptionId && membership.status !== 'canceled'
        ? membership.stripeSubscriptionId
        : null,
      playPurchaseTokens: playMemberships.map((row) => row.purchaseToken),
    };
  },

  /**
   * Stops billing a deleted account. Runs after the deletion commits; a failure is
   * logged for an admin to cancel in the Stripe dashboard, and never undoes the deletion.
   */
  async cancelAfterErasure(subscriptions: SupporterSubscriptionsToCancel, log: FastifyBaseLogger, api?: StripeApi): Promise<void> {
    if (subscriptions.stripeSubscriptionId) {
      try {
        await (api ?? liveStripe()).cancelSubscription(subscriptions.stripeSubscriptionId);
      } catch (error) {
        log.error({ err: error, subscriptionId: subscriptions.stripeSubscriptionId }, 'Could not cancel the Stripe subscription of a deleted account; cancel it in the Stripe dashboard.');
      }
    }
    for (const purchaseToken of subscriptions.playPurchaseTokens) {
      try {
        await GooglePlayBillingService.cancelSubscription(purchaseToken);
      } catch (error) {
        log.error({ err: error, purchaseTokenSuffix: purchaseToken.slice(-8) }, 'Could not cancel the Google Play subscription of a deleted account; cancel it in Play Console.');
      }
    }
  },
};
