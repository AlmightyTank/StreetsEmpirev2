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
    profiles: [] as Row[],
    resyncs: [] as Row[],
  };
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return (value.in as unknown[]).includes(row[key]);
    return row[key] === value;
  });
  const db: Row = {
    state,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    account: {
      findUnique: async ({ where }: Row) => (accountIds.includes(where.id) ? { id: where.id, isActive: true } : null),
      findMany: async ({ where }: Row) => accountIds
        .filter((id) => !where.id?.in || where.id.in.includes(id))
        .map((id) => ({ id, discordId: `discord_${id}` }))
        .filter((row) => where.discordId?.not !== null || row.discordId !== null),
    },
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
    googlePlaySupporterSubscription: {
      findFirst: async () => null,
      findMany: async () => [],
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
      findMany: async ({ where }: Row) => state.payments.filter((row) => matches(row, where)),
      update: async ({ where, data }: Row) => Object.assign(state.payments.find((row) => row.id === where.id)!, data),
    },
    accountCosmeticUnlock: {
      findMany: async ({ where }: Row) => state.unlocks.filter((row) => matches(row, where)),
      create: async ({ data }: Row) => { state.unlocks.push(data); return data; },
      findFirst: async ({ where }: Row) => state.unlocks.find((row) => matches(row, where)) ?? null,
    },
    accountProfile: {
      findUnique: async ({ where }: Row) => state.profiles.find((row) => row.accountId === where.accountId) ?? null,
      upsert: async ({ where, create, update }: Row) => {
        const found = state.profiles.find((row) => row.accountId === where.accountId);
        if (found) return Object.assign(found, update);
        state.profiles.push({ ...create });
        return create;
      },
    },
    discordResyncRequest: {
      create: async ({ data }: Row) => { state.resyncs.push(data); return data; },
      createMany: async ({ data }: Row) => { state.resyncs.push(...data); return { count: data.length }; },
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

  it('does not grant a trial checkout before its first paid invoice', async () => {
    const db = fakeDb();
    const trial = event('checkout.session.completed', {
      mode: 'subscription', payment_status: 'no_payment_required', client_reference_id: 'acc_1',
      customer: 'cus_trial', subscription: 'sub_trial',
    });

    expect(await handle(db, trial)).toBe('applied');
    expect(db.state.memberships[0]).toMatchObject({ status: 'incomplete', stripeSubscriptionId: 'sub_trial' });
    expect(db.state.unlocks).toEqual([]);
    expect(db.state.payments).toEqual([]);
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

describe('monthly drops and the thank-you list', () => {
  const OCTOBER_2026 = Date.UTC(2026, 9, 14) / 1000;

  it("adds the drop for the month a payment lands in", async () => {
    const db = fakeDb();
    await handle(db, event('invoice.paid', {
      id: 'in_oct', customer: 'cus_1', amount_paid: 500, currency: 'usd', status_transitions: { paid_at: OCTOBER_2026 },
      subscription_details: { metadata: { accountId: 'acc_1' } }, subscription: 'sub_1',
    }, OCTOBER_2026));

    expect(db.state.unlocks.map((row) => row.key)).toEqual([...ALL, 'supporter-drop-2026-10']);
    expect(db.state.audit[0]?.after).toEqual({ granted: [...ALL, 'supporter-drop-2026-10'] });
  });

  it('grants the 3-month tenure badge on the third distinct paid month, across a gap', async () => {
    const db = fakeDb();
    const invoice = (id: string, paidAt: number) => event('invoice.paid', {
      id, customer: 'cus_1', amount_paid: 500, currency: 'usd', status_transitions: { paid_at: paidAt },
      subscription_details: { metadata: { accountId: 'acc_1' } }, subscription: 'sub_1',
    }, paidAt);

    await handle(db, invoice('in_oct', Date.UTC(2026, 9, 15) / 1000));
    await handle(db, invoice('in_nov', Date.UTC(2026, 10, 15) / 1000));
    expect(db.state.unlocks.map((row) => row.key)).not.toContain('supporter-tenure-3');

    // December skipped (cancelled), January paid: the count continues, not resets.
    await handle(db, invoice('in_jan', Date.UTC(2027, 0, 15) / 1000));
    const keys = db.state.unlocks.map((row) => row.key);
    expect(keys).toContain('supporter-tenure-3');
    expect(keys).not.toContain('supporter-tenure-6');
    expect(db.state.audit.at(-1)?.after.granted).toContain('supporter-tenure-3');

    const status = await SupporterBillingService.status(db as unknown as PrismaClient, 'acc_1', new Date(Date.UTC(2027, 0, 20)));
    expect(status.dropsHeld.filter((drop) => drop.name.includes('Steadfast'))).toEqual([
      { month: '2027-01', name: 'Steadfast · 3 Months' },
    ]);
  });

  it('reports the drop and lets only a supporter join the list', async () => {
    const db = fakeDb();
    const prisma = db as unknown as PrismaClient;
    await expect(SupporterBillingService.setListed(prisma, 'acc_1', true)).rejects.toMatchObject({ code: 'NOT_A_SUPPORTER' });
    await expect(SupporterBillingService.setReleaseNotesCredit(prisma, 'acc_1', true)).rejects.toMatchObject({ code: 'NOT_A_SUPPORTER' });

    await handle(db, paidCheckout());
    expect((await SupporterBillingService.status(prisma, 'acc_1', new Date(OCTOBER_2026 * 1000))).releaseNotesCreditOptIn).toBe(false);

    const listed = await SupporterBillingService.setListed(prisma, 'acc_1', true);
    expect(listed.listed).toBe(true);

    const credited = await SupporterBillingService.setReleaseNotesCredit(prisma, 'acc_1', true);
    expect(credited.releaseNotesCreditOptIn).toBe(true);

    const status = await SupporterBillingService.status(prisma, 'acc_1', new Date(OCTOBER_2026 * 1000));
    expect(status.drop).toEqual({ month: '2026-10', name: 'Supporter · October 2026', held: false });
    expect(status.releaseNotesCreditOptIn).toBe(true);
    expect((await SupporterBillingService.setReleaseNotesCredit(prisma, 'acc_1', false)).releaseNotesCreditOptIn).toBe(false);
    expect((await SupporterBillingService.setListed(prisma, 'acc_1', false)).listed).toBe(false);
  });

  it('shows staged next-drop previews only to supporters during the early window', async () => {
    const previewAt = new Date(Date.UTC(2026, 11, 26, 12));
    const nonSupporter = await SupporterBillingService.status(fakeDb() as unknown as PrismaClient, 'acc_1', previewAt);
    expect(nonSupporter.supporterPreview).toBeNull();

    const db = fakeDb();
    await handle(db, paidCheckout());
    const supporter = await SupporterBillingService.status(db as unknown as PrismaClient, 'acc_1', previewAt);

    expect(supporter.supporterPreview).toMatchObject({
      month: '2027-01',
      name: 'Supporter · January 2027',
      availableAt: '2027-01-01T00:00:00.000Z',
      items: [expect.objectContaining({ name: 'Supporter · January 2027', kind: 'TITLE_BADGE', rarity: 'epic' })],
    });
  });

  it('gift checkout grants only the current bundle to the recipient and tenure credit to the payer', async () => {
    const db = fakeDb(['gifter', 'recipient']);
    db.state.payments.push(
      { id: 'old_1', accountId: 'gifter', stripeInvoiceId: 'old_1', stripeCustomerId: 'cus_old', amountCents: 500, currency: 'usd', status: 'paid', paidAt: new Date(Date.UTC(2026, 7, 10)) },
      { id: 'old_2', accountId: 'gifter', stripeInvoiceId: 'old_2', stripeCustomerId: 'cus_old', amountCents: 500, currency: 'usd', status: 'paid', paidAt: new Date(Date.UTC(2026, 8, 10)) },
    );

    const result = await handle(db, event('checkout.session.completed', {
      id: 'cs_gift', mode: 'payment', payment_status: 'paid', customer: 'cus_gift', amount_total: 500, currency: 'usd',
      metadata: { gifterAccountId: 'gifter', recipientAccountId: 'recipient' },
    }, OCTOBER_2026));

    expect(result).toBe('granted');
    expect(db.state.payments.at(-1)).toMatchObject({ accountId: 'gifter', stripeInvoiceId: 'gift:cs_gift', status: 'paid' });
    expect(db.state.unlocks.map((row) => [row.accountId, row.key])).toEqual([
      ['recipient', 'supporter-drop-2026-10'],
      ['gifter', 'supporter-tenure-3'],
    ]);
    expect(db.state.unlocks.map((row) => row.key)).not.toContain('supporter-drop-2026-09');
    expect(db.state.unlocks.map((row) => row.key)).not.toEqual(expect.arrayContaining(ALL));
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
      payment_method_collection: 'always',
        subscription_data: {
          metadata: { accountId: 'acc_1' },
          trial_period_days: 3,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        },
      customer_email: 'vito@example.test',
    }));
  });

  it('opens a one-time gift checkout with gifter and recipient metadata', async () => {
    const db = fakeDb(['gifter', 'recipient']);
    const api = fakeApi();

    const result = await SupporterBillingService.startGiftCheckout(db as unknown as PrismaClient, { id: 'gifter', email: 'gift@example.test' }, 'recipient', api);

    expect(result.url).toBe('https://checkout.stripe.test/cs_1');
    expect(api.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment',
      client_reference_id: 'gifter',
      metadata: { gifterAccountId: 'gifter', recipientAccountId: 'recipient' },
      customer_email: 'gift@example.test',
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
