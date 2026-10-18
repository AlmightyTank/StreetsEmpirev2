import type { Account, CrownPackOrder, PrismaClient } from '@prisma/client';
import { CROWN_PACKS, crownPack } from '@streets/rulesets';
import type { CrownPackOrderDto, CrownPacksDto, SupporterRedirectDto } from '@streets/shared';
import { env } from '../config/env.js';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { CrownWalletService, lockCrownWallet } from './crown-wallet.service.js';
import { DropSettingsService, requireDropEnabled, switchesFor } from './drop-settings.service.js';
import { stripeApi, type StripeApi, type StripeEvent } from './stripe.client.js';

/**
 * The Drop, Slice D: real-money Crown packs through Stripe Checkout, as
 * one-time payments (never a subscription). The server fixes the pack's price
 * and Crowns; the browser only names a pack id. Crowns are credited once, and
 * only from a signed Stripe event (or an admin reconcile that reads the session
 * back from Stripe) whose account, pack, amount and currency all match the
 * order we created. A redirect URL alone never moves a balance.
 *
 * Refunds take unspent Crowns back. When they were already spent, the wallet
 * is put on hold for support instead of going negative, and nothing else on
 * the account is touched.
 */

export type CrownPackOutcome = 'duplicate' | 'ignored' | 'unmatched' | 'applied' | 'granted';

type Obj = Record<string, unknown>;
const PENDING_LIMIT_PER_HOUR = 5;

function obj(value: unknown): Obj | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function id(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  return text(obj(value)?.id);
}

function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function packOrderDto(order: CrownPackOrder): CrownPackOrderDto {
  return {
    id: order.id,
    packId: order.packId,
    crowns: order.crowns,
    amountCents: order.amountCents,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    creditedAt: order.creditedAt?.toISOString() ?? null,
  };
}

function liveStripe(): StripeApi {
  if (!env.drop.crownPacksConfigured) throw new AppError(503, 'CROWN_PACKS_UNAVAILABLE', 'Crown packs are not on sale yet.');
  return stripeApi(env.stripe.secretKey);
}

/**
 * Credit a paid checkout session once. The session must match the order on
 * account, pack, amount and currency; anything else is left for an admin.
 */
async function creditSession(tx: Db, order: CrownPackOrder, session: Obj, at: Date): Promise<CrownPackOutcome> {
  const meta = obj(session.metadata);
  const paymentIntent = id(session.payment_intent);
  const amount = cents(session.amount_total);
  const currency = text(session.currency);
  if (!order.accountId) return 'unmatched';
  if (text(meta?.accountId) !== order.accountId || text(meta?.packId) !== order.packId
    || amount !== order.amountCents || currency !== order.currency || session.mode !== 'payment') {
    return 'unmatched';
  }
  if (paymentIntent && !order.providerPaymentId) {
    await tx.crownPackOrder.update({ where: { id: order.id }, data: { providerPaymentId: paymentIntent, lastEventAt: at } });
  }
  if (session.payment_status !== 'paid') return 'applied';
  if (order.status !== 'pending' && order.status !== 'failed' && order.status !== 'expired') return 'duplicate';
  const credit = await CrownWalletService.apply(tx, {
    accountId: order.accountId,
    kind: 'PAID_GRANT',
    delta: order.crowns,
    source: `pack:${order.packId}`,
    externalRef: `pack:${order.id}`,
    reason: `${order.crowns} Crowns`,
    metadata: { orderId: order.id, provider: order.provider, amountCents: order.amountCents, currency: order.currency },
  });
  await tx.crownPackOrder.update({
    where: { id: order.id },
    data: { status: 'credited', creditedAt: at, lastEventAt: at, ...(paymentIntent ? { providerPaymentId: paymentIntent } : {}) },
  });
  return credit.applied ? 'granted' : 'duplicate';
}

/** Full refund: take the Crowns back if they are still there, otherwise hold the wallet for support. */
async function refund(tx: Db, order: CrownPackOrder, full: boolean, at: Date): Promise<CrownPackOutcome> {
  if (!order.accountId) return 'unmatched';
  if (order.status === 'refunded') return 'duplicate';
  if (order.status !== 'credited' && order.status !== 'disputed' && order.status !== 'refund_review') {
    await tx.crownPackOrder.update({ where: { id: order.id }, data: { status: 'refunded', refundedAt: at, lastEventAt: at } });
    return 'applied';
  }
  const wallet = await lockCrownWallet(tx, order.accountId);
  if (full && wallet.balance >= order.crowns) {
    await CrownWalletService.apply(tx, {
      accountId: order.accountId,
      kind: 'REVERSAL',
      delta: -order.crowns,
      source: 'refund',
      externalRef: `refund:${order.id}`,
      reason: `Refunded ${order.packId} pack`,
      metadata: { orderId: order.id },
      allowHeld: true,
    });
    await tx.crownPackOrder.update({ where: { id: order.id }, data: { status: 'refunded', refundedAt: at, lastEventAt: at } });
    return 'applied';
  }
  await CrownWalletService.hold(tx, order.accountId, `Refund on Crown pack order ${order.id} needs review.`, at);
  await tx.crownPackOrder.update({ where: { id: order.id }, data: { status: 'refund_review', refundedAt: at, lastEventAt: at } });
  return 'applied';
}

export const CrownPackService = {
  async packs(prisma: PrismaClient, platform: string | null = null): Promise<CrownPacksDto> {
    const settings = await DropSettingsService.get(prisma);
    const switches = switchesFor(settings);
    // Google Play needs its own billing review before packs are sold in the app.
    const android = platform === 'android';
    const available = switches.checkout && !android;
    return {
      available,
      unavailableReason: available ? null
        : android ? 'Crown packs are not sold in the Android app yet. You can still earn Crowns by playing.'
          : !env.drop.crownPacksConfigured ? 'Crown packs are not on sale yet. You can earn Crowns by playing.'
            : 'Crown pack checkout is paused right now.',
      packs: CROWN_PACKS.map((pack) => ({ id: pack.id, name: pack.name, priceCents: pack.priceCents, currency: pack.currency, crowns: pack.crowns, featured: pack.featured ?? false })),
    };
  },

  async orders(db: Db | PrismaClient, accountId: string, limit = 25): Promise<CrownPackOrderDto[]> {
    const rows = await db.crownPackOrder.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map(packOrderDto);
  },

  /** Opens Stripe Checkout for one fixed pack. The order row exists before Stripe hears about it. */
  async startCheckout(prisma: PrismaClient, account: Pick<Account, 'id' | 'email'>, packId: string, api?: StripeApi): Promise<SupporterRedirectDto> {
    requireDropEnabled();
    const settings = await DropSettingsService.get(prisma);
    if (!switchesFor(settings).checkout) throw new AppError(503, 'CROWN_PACKS_UNAVAILABLE', 'Crown pack checkout is not open right now.');
    const pack = crownPack(packId);
    if (!pack) throw AppError.badRequest('CROWN_PACK_UNKNOWN', 'Pick one of the Crown packs.', { packId: 'Unknown pack.' });
    const recent = await prisma.crownPackOrder.count({
      where: { accountId: account.id, status: 'pending', createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= PENDING_LIMIT_PER_HOUR) {
      throw AppError.conflict('CROWN_PACK_TOO_MANY', 'You have several checkouts open already. Finish or close one, then try again in a while.');
    }
    const stripe = api ?? liveStripe();
    const order = await prisma.crownPackOrder.create({
      data: { accountId: account.id, packId: pack.id, crowns: pack.crowns, amountCents: pack.priceCents, currency: pack.currency },
    });
    const metadata = { kind: 'crown-pack', accountId: account.id, packId: pack.id, orderId: order.id };
    const session = await stripe.createCheckoutSession({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: pack.currency,
          unit_amount: pack.priceCents,
          product_data: { name: `${pack.crowns.toLocaleString('en-US')} Crowns (${pack.name} pack)`, description: 'StreetsEmpire Crowns for cosmetics in The Drop. No gameplay advantage.' },
        },
      }],
      client_reference_id: account.id,
      metadata,
      payment_intent_data: { metadata },
      customer_email: account.email,
      success_url: `${env.frontendOrigin}/game/drop/wallet?crowns=thanks`,
      cancel_url: `${env.frontendOrigin}/game/drop/crowns?crowns=cancelled`,
    });
    await prisma.crownPackOrder.update({ where: { id: order.id }, data: { checkoutSessionId: session.id } });
    return { url: session.url };
  },

  /**
   * One verified Stripe event, inside the webhook's transaction. Returns null
   * when the event is not about a Crown pack, so supporter billing handles it.
   */
  async applyStripeEvent(tx: Db, event: StripeEvent): Promise<CrownPackOutcome | null> {
    const data = event.data.object;
    const at = new Date(event.created * 1000);
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const meta = obj(data.metadata);
        if (text(meta?.kind) !== 'crown-pack') return null;
        const orderId = text(meta?.orderId);
        const sessionId = text(data.id);
        const order = (orderId ? await tx.crownPackOrder.findUnique({ where: { id: orderId } }) : null)
          ?? (sessionId ? await tx.crownPackOrder.findUnique({ where: { checkoutSessionId: sessionId } }) : null);
        if (!order || (sessionId && order.checkoutSessionId && order.checkoutSessionId !== sessionId)) return 'unmatched';
        if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
          if (order.status !== 'pending') return 'ignored';
          await tx.crownPackOrder.update({
            where: { id: order.id },
            data: { status: event.type === 'checkout.session.expired' ? 'expired' : 'failed', lastEventAt: at },
          });
          return 'applied';
        }
        return creditSession(tx, order, data, at);
      }
      case 'charge.refunded': {
        const paymentIntent = id(data.payment_intent);
        if (!paymentIntent) return null;
        const order = await tx.crownPackOrder.findUnique({ where: { providerPaymentId: paymentIntent } });
        if (!order) return null;
        return refund(tx, order, data.refunded === true, at);
      }
      case 'charge.dispute.created': {
        const paymentIntent = id(data.payment_intent);
        if (!paymentIntent) return null;
        const order = await tx.crownPackOrder.findUnique({ where: { providerPaymentId: paymentIntent } });
        if (!order) return null;
        if (order.accountId) await CrownWalletService.hold(tx, order.accountId, `Dispute on Crown pack order ${order.id}.`, at);
        await tx.crownPackOrder.update({ where: { id: order.id }, data: { status: 'disputed', lastEventAt: at } });
        return 'applied';
      }
      default:
        return null;
    }
  },

  /**
   * Admin reconcile for a pending order: read the session back from Stripe and
   * credit it if Stripe says it was paid. Same checks and idempotency as the webhook.
   */
  async reconcile(prisma: PrismaClient, orderId: string, api?: StripeApi): Promise<{ outcome: CrownPackOutcome; order: CrownPackOrderDto }> {
    const order = await prisma.crownPackOrder.findUnique({ where: { id: orderId } });
    if (!order) throw AppError.notFound('CROWN_PACK_ORDER_NOT_FOUND', 'That Crown pack order was not found.');
    if (!order.checkoutSessionId) throw AppError.conflict('CROWN_PACK_NO_SESSION', 'That order never reached Stripe.');
    const session = await (api ?? liveStripe()).retrieveCheckoutSession(order.checkoutSessionId);
    const outcome = await prisma.$transaction(async (tx) => {
      const fresh = await tx.crownPackOrder.findUniqueOrThrow({ where: { id: orderId } });
      return creditSession(tx, fresh, session, new Date());
    });
    return { outcome, order: packOrderDto(await prisma.crownPackOrder.findUniqueOrThrow({ where: { id: orderId } })) };
  },
};
