import type { Account, PrismaClient, SupporterMembership } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { SUPPORTER_DROP_SOURCE, supporterDropFor, supporterMonth } from '@streets/rulesets';
import type { SupporterMembershipDto, SupporterRedirectDto, SupporterStatusDto } from '@streets/shared';
import { env } from '../config/env.js';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { stripeApi, type StripeApi, type StripeEvent } from './stripe.client.js';
import { SupporterService } from './supporter.service.js';

/** Statuses that count as supporting right now. past_due is still retrying a payment. */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);
/** A new checkout is refused while one of these is running; the billing portal manages it instead. */
const RUNNING_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);
/** Shown as the actor on audit entries written for a Stripe payment. */
export const STRIPE_AUDIT_ACTOR = 'Stripe';

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : null;
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

export function membershipDto(row: SupporterMembership): SupporterMembershipDto {
  return {
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
}

/**
 * Gives the rewards the account is missing, plus the drop for the month the
 * payment landed in, and records it in the audit log as Stripe.
 */
async function grantRewards(tx: Db, accountId: string, reason: string, paidAt: Date): Promise<string[]> {
  const granted = await SupporterService.grant(tx, accountId);
  const drop = await SupporterService.grantDrop(tx, accountId, supporterMonth(paidAt), paidAt);
  if (drop) granted.push(drop);
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
      if (data.mode !== 'subscription') return 'ignored';
      const customerId = id(data.customer);
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
    const drop = supporterDropFor(month);
    const [since, membership, profile, drops] = await Promise.all([
      SupporterService.since(prisma, accountId),
      prisma.supporterMembership.findUnique({ where: { accountId } }),
      prisma.accountProfile.findUnique({ where: { accountId }, select: { showOnSupporterList: true } }),
      prisma.accountCosmeticUnlock.findMany({
        where: { accountId, sourceRulesetId: SUPPORTER_DROP_SOURCE },
        select: { key: true, title: true, sourceRulesetVersion: true },
        orderBy: { sourceRulesetVersion: 'desc' },
      }),
    ]);
    return {
      checkoutEnabled: env.stripe.enabled,
      hasRewards: since !== null,
      since: since?.toISOString() ?? null,
      membership: membership ? membershipDto(membership) : null,
      listed: since !== null && (profile?.showOnSupporterList ?? false),
      drop: drop ? { month, name: drop.name, held: drops.some((row) => row.key === drop.key) } : null,
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
      success_url: `${env.frontendOrigin}/account?supporter=thanks`,
      cancel_url: `${env.frontendOrigin}/account?supporter=cancelled`,
    });
    return { url: session.url };
  },

  /** Stripe's billing portal, where a supporter updates their card or cancels. */
  async openPortal(prisma: PrismaClient, accountId: string, api: StripeApi = liveStripe()): Promise<SupporterRedirectDto> {
    const membership = await prisma.supporterMembership.findUnique({ where: { accountId } });
    if (!membership) throw AppError.notFound('NO_SUPPORTER_BILLING', 'There is no supporter billing on this account yet.');
    return api.createPortalSession({ customer: membership.stripeCustomerId, return_url: `${env.frontendOrigin}/account` });
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

  /** Read before an account is erased, since deleting it outright removes the membership. */
  async subscriptionToCancel(prisma: PrismaClient, accountId: string): Promise<string | null> {
    const membership = await prisma.supporterMembership.findUnique({ where: { accountId }, select: { stripeSubscriptionId: true, status: true } });
    return membership?.stripeSubscriptionId && membership.status !== 'canceled' ? membership.stripeSubscriptionId : null;
  },

  /**
   * Stops billing a deleted account. Runs after the deletion commits; a failure is
   * logged for an admin to cancel in the Stripe dashboard, and never undoes the deletion.
   */
  async cancelAfterErasure(subscriptionId: string | null, log: FastifyBaseLogger, api?: StripeApi): Promise<void> {
    if (!subscriptionId) return;
    try {
      await (api ?? liveStripe()).cancelSubscription(subscriptionId);
    } catch (error) {
      log.error({ err: error, subscriptionId }, 'Could not cancel the Stripe subscription of a deleted account; cancel it in the Stripe dashboard.');
    }
  },
};
