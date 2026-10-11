import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SUPPORTER_COSMETICS } from '@streets/rulesets';
import type { StripeApi, StripeEvent } from '../stripe.client.js';
import { SupporterBillingService } from '../supporter-billing.service.js';

const NOW = 1_760_000_000;
const ALL = Object.keys(SUPPORTER_COSMETICS);

type Row = Record<string, any>;

/** An in-memory stand-in for the tables supporter billing touches. */
function fakeDb(accountIds: string[] = ['acc_1']) {
  const state = {
    memberships: [] as Row[],
    payments: [] as Row[],
    events: new Set<string>(),
    unlocks: [] as Row[],
    audit: [] as Row[],
  };
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
  const db: Row = {
    state,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    account: { findUnique: async ({ where }: Row) => (accountIds.includes(where.id) ? { id: where.id } : null) },
    stripeWebhookEvent: {
      findUnique: async ({ where }: Row) => (state.events.has(where.id) ? { id: where.id } : null),
      create: async ({ data }: Row) => { state.events.add(data.id); return data; },
    },
    supporterMembership: {
      findUnique: async ({ where }: Row) => state.memberships.find((row) => matches(row, where)) ?? null,
      create: async ({ data }: Row) => {
        const row = { cancelAtPeriodEnd: false, currentPeriodEnd: null, endedAt: null, startedAt: new Date(NOW * 1000), ...data };
        state.memberships.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => Object.assign(state.memberships.find((row) => matches(row, where))!, data),
    },
    supporterPayment: {
      upsert: async ({ where, create }: Row) => {
        const found = state.payments.find((row) => row.stripeInvoiceId === where.stripeInvoiceId);
        if (found) return found;
        const row = { id: `pay_${state.payments.length + 1}`, ...create };
        state.payments.push(row);
        return row;
      },
      findFirst: async ({ where }: Row) =>
        state.payments.filter((row) => matches(row, where)).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0] ?? null,
      update: async ({ where, data }: Row) => Object.assign(state.payments.find((row) => row.id === where.id)!, data),
    },
    accountCosmeticUnlock: {
      findMany: async ({ where }: Row) => state.unlocks.filter((row) => row.accountId === where.accountId && where.key.in.includes(row.key)),
      create: async ({ data }: Row) => { state.unlocks.push(data); return data; },
      findFirst: async ({ where }: Row) => state.unlocks.find((row) => row.accountId === where.accountId) ?? null,
    },
    adminAuditLog: { create: async ({ data }: Row) => { state.audit.push(data); return data; } },
  };
  return db as Row & { state: typeof state };
}

let eventCount = 0;
function event(type: string, object: Row, created = NOW): StripeEvent {
  eventCount += 1;
  return { id: `evt_${eventCount}`, type, created, data: { object } };
}

const paidCheckout = () => event('checkout.session.completed', {
  id: 'cs_1', mode: 'subscription', payment_status: 'paid', client_reference_id: 'acc_1', customer: 'cus_1', subscription: 'sub_1',
});

function fakeApi(overrides: Partial<StripeApi> = {}): StripeApi {
  return {
    createCheckoutSession: vi.fn(async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' })),
    createPortalSession: vi.fn(async () => ({ url: 'https://billing.stripe.test/p_1' })),
    cancelSubscription: vi.fn(async () => undefined),
    retrieveCharge: vi.fn(async () => ({ id: 'ch_1', customer: 'cus_1' })),
    ...overrides,
  };
}

const handle = (db: Row, stripeEvent: StripeEvent, api?: StripeApi) =>
  SupporterBillingService.handleEvent(db as unknown as PrismaClient, stripeEvent, api);

describe('SupporterBillingService.handleEvent', () => {
  it('grants the rewards the moment a checkout is paid, and records Stripe as the actor', async () => {
    const db = fakeDb();

    expect(await handle(db, paidCheckout())).toBe('granted');

    expect(db.state.memberships[0]).toMatchObject({ accountId: 'acc_1', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', status: 'active' });
    expect(db.state.unlocks.map((row) => row.key)).toEqual(ALL);
    expect(db.state.audit[0]).toMatchObject({ actorAccountId: null, actorUsername: 'Stripe', action: 'account.grant-supporter', targetId: 'acc_1' });
  });

  it('applies a redelivered event only once', async () => {
    const db = fakeDb();
    const once = paidCheckout();
    await handle(db, once);

    expect(await handle(db, once)).toBe('duplicate');
    expect(db.state.audit).toHaveLength(1);
  });

  it('does not grant for a checkout that is still waiting on payment', async () => {
    const db = fakeDb();
    const pending = event('checkout.session.completed', { mode: 'subscription', payment_status: 'unpaid', client_reference_id: 'acc_1', customer: 'cus_1', subscription: 'sub_1' });

    expect(await handle(db, pending)).toBe('applied');
    expect(db.state.memberships[0]?.status).toBe('incomplete');
    expect(db.state.unlocks).toEqual([]);
  });

  it('handles the first invoice arriving before the checkout event, in the newer payload shape', async () => {
    const db = fakeDb();
    const invoice = event('invoice.paid', {
      id: 'in_1', customer: 'cus_1', amount_paid: 500, currency: 'usd', status_transitions: { paid_at: NOW - 5 },
      parent: { subscription_details: { subscription: 'sub_1', metadata: { accountId: 'acc_1' } } },
    });

    expect(await handle(db, invoice)).toBe('granted');
    expect(db.state.payments[0]).toMatchObject({ accountId: 'acc_1', stripeInvoiceId: 'in_1', amountCents: 500, status: 'paid' });
    expect(await handle(db, paidCheckout())).toBe('applied');
    expect(db.state.unlocks).toHaveLength(ALL.length);
  });

  it('records renewals and treats a free trial invoice as no payment', async () => {
    const db = fakeDb();
    await handle(db, paidCheckout());
    const trial = event('invoice.paid', { id: 'in_0', customer: 'cus_1', subscription: 'sub_1', amount_paid: 0, currency: 'usd' });
    const renewal = event('invoice.paid', { id: 'in_2', customer: 'cus_1', subscription: 'sub_1', amount_paid: 500, currency: 'usd' });

    expect(await handle(db, trial)).toBe('applied');
    expect(await handle(db, renewal)).toBe('applied');
    expect(db.state.payments.map((row) => row.stripeInvoiceId)).toEqual(['in_2']);
  });

  it('ignores invoices that are not for a subscription and leaves unknown customers unmatched', async () => {
    const db = fakeDb();
    expect(await handle(db, event('invoice.paid', { id: 'in_9', customer: 'cus_9', amount_paid: 900, currency: 'usd' }))).toBe('ignored');
    expect(await handle(db, event('invoice.paid', { id: 'in_8', customer: 'cus_8', subscription: 'sub_8', amount_paid: 900, currency: 'usd' }))).toBe('unmatched');
    expect(db.state.payments).toEqual([]);
  });

  it('keeps the membership status current, ignores a late older event, and keeps rewards after it ends', async () => {
    const db = fakeDb();
    await handle(db, paidCheckout());
    const periodEnd = NOW + 30 * 86_400;

    await handle(db, event('customer.subscription.updated', {
      id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true,
      items: { data: [{ current_period_end: periodEnd }] },
    }, NOW + 60));
    expect(db.state.memberships[0]).toMatchObject({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: new Date(periodEnd * 1000) });

    await handle(db, event('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'past_due' }, NOW + 30));
    expect(db.state.memberships[0]?.status).toBe('active');

    await handle(db, event('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1', status: 'canceled', ended_at: periodEnd }, NOW + 120));
    expect(db.state.memberships[0]).toMatchObject({ status: 'canceled', endedAt: new Date(periodEnd * 1000) });
    expect(db.state.unlocks).toHaveLength(ALL.length);
  });

  it('marks refunds and disputes on the payment without taking rewards back', async () => {
    const db = fakeDb();
    await handle(db, paidCheckout());
    await handle(db, event('invoice.paid', { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', amount_paid: 500, currency: 'usd' }));
    await handle(db, event('invoice.paid', { id: 'in_2', customer: 'cus_1', subscription: 'sub_1', amount_paid: 500, currency: 'usd' }, NOW + 100));

    expect(await handle(db, event('charge.refunded', { id: 'ch_2', customer: 'cus_1', refunded: true }))).toBe('applied');
    const api = fakeApi();
    expect(await handle(db, event('charge.dispute.created', { id: 'dp_1', charge: 'ch_1' }), api)).toBe('applied');

    expect(api.retrieveCharge).toHaveBeenCalledWith('ch_1');
    expect(db.state.payments.map((row) => [row.stripeInvoiceId, row.status])).toEqual([['in_1', 'disputed'], ['in_2', 'refunded']]);
    expect(db.state.unlocks).toHaveLength(ALL.length);
  });

  it('does not mark an event handled when applying it fails, so Stripe retries it', async () => {
    const db = fakeDb();
    db.adminAuditLog.create = async () => { throw new Error('database went away'); };
    const failing = paidCheckout();

    await expect(handle(db, failing)).rejects.toThrow('database went away');
    expect(db.state.events.has(failing.id)).toBe(false);
  });
});

describe('SupporterBillingService.startCheckout', () => {
  it('opens a subscription checkout tied to the account', async () => {
    const db = fakeDb();
    const api = fakeApi();

    const result = await SupporterBillingService.startCheckout(db as unknown as PrismaClient, { id: 'acc_1', email: 'vito@example.test' }, api);

    expect(result.url).toBe('https://checkout.stripe.test/cs_1');
    expect(api.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      client_reference_id: 'acc_1',
      metadata: { accountId: 'acc_1' },
      subscription_data: { metadata: { accountId: 'acc_1' } },
      customer_email: 'vito@example.test',
    }));
  });

  it('refuses a second subscription and reuses the Stripe customer after one ended', async () => {
    const db = fakeDb();
    await handle(db, paidCheckout());
    await expect(SupporterBillingService.startCheckout(db as unknown as PrismaClient, { id: 'acc_1', email: 'v@example.test' }, fakeApi()))
      .rejects.toMatchObject({ code: 'ALREADY_SUPPORTING' });

    db.state.memberships[0]!.status = 'canceled';
    const api = fakeApi();
    await SupporterBillingService.startCheckout(db as unknown as PrismaClient, { id: 'acc_1', email: 'v@example.test' }, api);
    expect(api.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }));
    expect(api.createCheckoutSession).toHaveBeenCalledWith(expect.not.objectContaining({ customer_email: expect.anything() }));
  });
});
