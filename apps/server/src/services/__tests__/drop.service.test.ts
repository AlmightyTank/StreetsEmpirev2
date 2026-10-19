import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { CROWN_EARN_RULES, DROP_BUNDLES, DROP_ITEMS, bundleListPrice, dropDailyWindow, dropWeeklyWindow, featuredCollectionFor, discountedDropPrice } from '@streets/rulesets';
import type { StripeEvent } from '../stripe.client.js';

vi.mock('../round.service.js', () => ({ RoundService: { getCurrent: async () => null } }));

const { CrownWalletService } = await import('../crown-wallet.service.js');
const { CrownPackService } = await import('../crown-pack.service.js');
const { DropPurchaseService } = await import('../drop-purchase.service.js');
const { resolveOffer, rotationAt, loadCatalog } = await import('../drop-catalog.service.js');
const { DEFAULT_DROP_SETTINGS } = await import('../drop-settings.service.js');
const { CrownEarnService } = await import('../crown-earn.service.js');

type Row = Record<string, any>;

/** An in-memory stand-in for the tables The Drop touches. Transactions run inline. */
function fakeDb() {
  const state = {
    wallets: new Map<string, Row>(),
    ledger: [] as Row[],
    orders: [] as Row[],
    packOrders: [] as Row[],
    unlocks: [] as Row[],
    offers: [] as Row[],
    catalog: [] as Row[],
    memberships: [] as Row[],
    birthDates: new Map<string, Date>(),
  };
  let id = 0;
  const next = (prefix: string) => `${prefix}_${++id}`;
  const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return (value.in as unknown[]).includes(row[key]);
    if (value && typeof value === 'object' && 'startsWith' in value) return String(row[key]).startsWith(value.startsWith);
    return row[key] === value;
  });
  const db: Row = {
    state,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    $executeRaw: async (_strings: TemplateStringsArray, accountId: string) => {
      if (!state.wallets.has(accountId)) state.wallets.set(accountId, { accountId, balance: 0, version: 0, heldAt: null, holdReason: null });
      return 1;
    },
    $queryRaw: async (_strings: TemplateStringsArray, accountId: string) => {
      const wallet = state.wallets.get(accountId);
      return wallet ? [{ ...wallet }] : [];
    },
    crownWallet: {
      findUnique: async ({ where }: Row) => state.wallets.get(where.accountId) ?? null,
      update: async ({ where, data }: Row) => Object.assign(state.wallets.get(where.accountId)!, data),
    },
    crownLedgerEntry: {
      findUnique: async ({ where }: Row) => state.ledger.find((row) => row.externalRef === where.externalRef) ?? null,
      findMany: async ({ where }: Row) => state.ledger.filter((row) => matches(row, where)),
      create: async ({ data }: Row) => {
        if (state.ledger.some((row) => row.externalRef === data.externalRef)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { id: next('led'), createdAt: new Date(), ...data };
        state.ledger.push(row);
        return row;
      },
      aggregate: async ({ where }: Row) => ({ _sum: { delta: state.ledger.filter((row) => matches(row, where)).reduce((sum, row) => sum + row.delta, 0) || null } }),
    },
    crownPackOrder: {
      findUnique: async ({ where }: Row) => state.packOrders.find((row) => matches(row, where)) ?? null,
      findUniqueOrThrow: async ({ where }: Row) => state.packOrders.find((row) => matches(row, where))!,
      update: async ({ where, data }: Row) => Object.assign(state.packOrders.find((row) => row.id === where.id)!, data),
    },
    dropSettings: { findUnique: async () => null },
    dropCatalogEntry: { findMany: async () => state.catalog },
    dropOffer: { findMany: async () => state.offers },
    dropOrder: {
      findUnique: async ({ where }: Row) => state.orders.find((row) => row.accountId === where.accountId_actionId.accountId && row.actionId === where.accountId_actionId.actionId) ?? null,
      create: async ({ data }: Row) => {
        const row = { id: next('ord'), createdAt: new Date(), ...data };
        state.orders.push(row);
        return row;
      },
    },
    account: { findUnique: async ({ where }: Row) => (state.birthDates.has(where.id) ? { birthDate: state.birthDates.get(where.id) } : null) },
    supporterMembership: { findMany: async ({ where }: Row) => state.memberships.filter((row) => matches(row, { accountId: where.accountId, status: where.status })) },
    googlePlaySupporterSubscription: { findMany: async () => [] },
    accountCosmeticUnlock: {
      findMany: async ({ where }: Row) => state.unlocks.filter((row) => matches(row, where)),
      create: async ({ data }: Row) => { state.unlocks.push(data); return data; },
    },
  };
  return db;
}

const prisma = (db: Row) => db as unknown as PrismaClient;
const credit = (db: Row, accountId: string, delta: number, ref: string) =>
  CrownWalletService.apply(db as never, { accountId, kind: 'ADJUSTMENT', delta, source: 'admin', externalRef: ref });

describe('Crown wallet', () => {
  it('applies a movement once per external ref', async () => {
    const db = fakeDb();
    expect((await credit(db, 'acc', 100, 'grant-1')).applied).toBe(true);
    expect((await credit(db, 'acc', 100, 'grant-1')).applied).toBe(false);
    expect(db.state.wallets.get('acc').balance).toBe(100);
    expect(db.state.ledger).toHaveLength(1);
    expect(db.state.ledger[0].balanceAfter).toBe(100);
  });

  it('never goes below zero and keeps whole Crowns', async () => {
    const db = fakeDb();
    await credit(db, 'acc', 50, 'g');
    await expect(CrownWalletService.apply(db as never, { accountId: 'acc', kind: 'SPEND', delta: -60, source: 'drop-order', externalRef: 's' }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_CROWNS' });
    await expect(credit(db, 'acc', 1.5, 'frac')).rejects.toMatchObject({ code: 'CROWNS_INVALID' });
    expect(db.state.wallets.get('acc').balance).toBe(50);
  });

  it('stops spends while held but still lets credits land', async () => {
    const db = fakeDb();
    await credit(db, 'acc', 50, 'g');
    await CrownWalletService.hold(db as never, 'acc', 'review');
    await expect(CrownWalletService.apply(db as never, { accountId: 'acc', kind: 'SPEND', delta: -10, source: 'drop-order', externalRef: 's' }))
      .rejects.toMatchObject({ code: 'CROWN_WALLET_HELD' });
    expect((await credit(db, 'acc', 5, 'g2')).applied).toBe(true);
  });
});

describe('Drop purchases', () => {
  const now = new Date('2026-10-18T12:00:00Z');

  async function liveOffers(db: Row) {
    return (await rotationAt(db as never, { ...DEFAULT_DROP_SETTINGS }, await loadCatalog(db as never), now)).offers;
  }

  it('keeps held holiday sets out of the catalog, the rotation and the storefront', async () => {
    const db = fakeDb();
    const catalog = await loadCatalog(db as never);
    expect(catalog.get('drop-naughty-list-van')?.state).toBe('DRAFT');
    expect(catalog.get('drop-naughty-list-bundle')?.state).toBe('DRAFT');
    expect(catalog.get('drop-snake-eyes-sedan')?.state).toBe('LIVE');
    for (let day = 0; day < 21; day++) {
      const offers = (await rotationAt(db as never, { ...DEFAULT_DROP_SETTINGS }, catalog, new Date(now.getTime() + day * 86_400_000))).offers;
      expect(offers.some((offer) => /graveyard-shift|naughty-list|heartbreaker|block-party/.test(offer.refKey))).toBe(false);
    }
  });

  it('releases a holiday set once an admin catalog entry makes it Live', async () => {
    const db = fakeDb();
    db.state.catalog.push({ key: 'drop-heartbreaker-thug', state: 'LIVE', priceCrowns: null, returnPolicy: 'MAY_RETURN', inDailyPool: true, homepageSlot: null });
    const catalog = await loadCatalog(db as never);
    expect(catalog.get('drop-heartbreaker-thug')?.state).toBe('LIVE');
    expect(catalog.get('drop-heartbreaker-hoe')?.state).toBe('DRAFT');
  });

  it('sells the featured collection and daily picks, and refuses an offer from yesterday', async () => {
    const db = fakeDb();
    const offers = await liveOffers(db);
    const featured = featuredCollectionFor(dropWeeklyWindow(now).index);
    expect(offers.filter((offer) => offer.slot === 'FEATURED').every((offer) =>
      (DROP_ITEMS[offer.refKey] ?? DROP_BUNDLES[offer.refKey])!.collection === featured)).toBe(true);
    expect(offers.filter((offer) => offer.slot === 'DAILY')).toHaveLength(DEFAULT_DROP_SETTINGS.dailyOfferCount);
    const yesterday = `rot:D:${dropDailyWindow(new Date(now.getTime() - 86_400_000)).key}:${Object.keys(DROP_ITEMS)[0]}`;
    await expect(resolveOffer(db as never, yesterday, now)).rejects.toMatchObject({ code: 'DROP_OFFER_EXPIRED' });
  });

  it('orders featured and permanent catalog offers by their curated homepage slots', async () => {
    const db = fakeDb();
    const featured = featuredCollectionFor(dropWeeklyWindow(now).index);
    const featuredKeys = Object.values(DROP_ITEMS).filter((item) => item.collection === featured).slice(0, 2).map((item) => item.key);
    db.state.catalog.push(
      { key: featuredKeys[0], kind: 'ITEM', homepageSlot: 2, state: 'LIVE' },
      { key: featuredKeys[1], kind: 'ITEM', homepageSlot: 1, state: 'LIVE' },
    );
    const offers = await liveOffers(db);
    const ordered = offers.filter((offer) => offer.slot === 'FEATURED' && featuredKeys.includes(offer.refKey));
    expect(ordered.map((offer) => offer.refKey)).toEqual([featuredKeys[1], featuredKeys[0]]);
  });

  it('debits, grants and records the order in one go, and replays a repeated action id', async () => {
    const db = fakeDb();
    const offer = (await liveOffers(db)).find((candidate) => candidate.kind === 'ITEM')!;
    await credit(db, 'acc', 5000, 'seed');
    const first = await DropPurchaseService.purchase(prisma(db), 'acc', { offerId: offer.id, actionId: 'action-0001' }, now);
    const again = await DropPurchaseService.purchase(prisma(db), 'acc', { offerId: offer.id, actionId: 'action-0001' }, now);
    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect(again.order.id).toBe(first.order.id);
    expect(db.state.wallets.get('acc').balance).toBe(5000 - offer.priceCrowns);
    expect(db.state.unlocks.map((row: Row) => row.key)).toEqual([offer.refKey]);
    expect(db.state.unlocks[0]).toMatchObject({ sourceQuestKey: 'drop', sourceRulesetId: 'drop' });
    await expect(DropPurchaseService.purchase(prisma(db), 'acc', { offerId: offer.id, actionId: 'action-0002' }, now))
      .rejects.toMatchObject({ code: 'DROP_ALREADY_OWNED' });
  });

  it('charges nothing and grants nothing without enough Crowns', async () => {
    const db = fakeDb();
    const offer = (await liveOffers(db)).find((candidate) => candidate.kind === 'ITEM')!;
    await credit(db, 'acc', offer.priceCrowns - 1, 'seed');
    await expect(DropPurchaseService.purchase(prisma(db), 'acc', { offerId: offer.id, actionId: 'action-0003' }, now))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_CROWNS' });
    // The fake has no rollback, so check the service refused before granting anything.
    expect(db.state.unlocks).toHaveLength(0);
    expect(db.state.wallets.get('acc').balance).toBe(offer.priceCrowns - 1);
  });

  it('cuts a bundle to the share the account is missing', async () => {
    const db = fakeDb();
    const bundleOffer = (await liveOffers(db)).find((candidate) => candidate.kind === 'BUNDLE')!;
    const bundle = DROP_BUNDLES[bundleOffer.refKey]!;
    const ownedKey = bundle.itemKeys[0]!;
    db.state.unlocks.push({ accountId: 'acc', key: ownedKey });
    await credit(db, 'acc', 10_000, 'seed');
    const result = await DropPurchaseService.purchase(prisma(db), 'acc', { offerId: bundleOffer.id, actionId: 'action-0004' }, now);
    const list = bundleListPrice(bundle);
    const missingList = list - DROP_ITEMS[ownedKey]!.priceCrowns;
    expect(result.order.priceCrowns).toBe(Math.ceil((bundle.priceCrowns * missingList) / list));
    expect(result.order.grantedKeys).toEqual(bundle.itemKeys.slice(1));
    expect(db.state.unlocks.filter((row: Row) => row.key === ownedKey)).toHaveLength(1);
  });

  it('takes the supporter discount off after the bundle cut, and records it', async () => {
    const db = fakeDb();
    db.state.memberships.push({ accountId: 'acc', status: 'active' });
    const bundleOffer = (await liveOffers(db)).find((candidate) => candidate.kind === 'BUNDLE')!;
    const bundle = DROP_BUNDLES[bundleOffer.refKey]!;
    const ownedKey = bundle.itemKeys[0]!;
    db.state.unlocks.push({ accountId: 'acc', key: ownedKey });
    await credit(db, 'acc', 10_000, 'seed');
    const result = await DropPurchaseService.purchase(prisma(db), 'acc', { offerId: bundleOffer.id, actionId: 'action-0005' }, now);
    const list = bundleListPrice(bundle);
    const cut = Math.ceil((bundle.priceCrowns * (list - DROP_ITEMS[ownedKey]!.priceCrowns)) / list);
    expect(result.order.priceCrowns).toBe(discountedDropPrice(cut, 10));
    expect(db.state.orders[0].metadata).toMatchObject({ discountPercent: 10, discountReason: 'SUPPORTER', priceBeforeDiscount: cut });
    expect(db.state.wallets.get('acc').balance).toBe(10_000 - discountedDropPrice(cut, 10));
  });

  it('gives the birthday week 15% instead of a supporter 10%, never both', async () => {
    const db = fakeDb();
    db.state.memberships.push({ accountId: 'acc', status: 'active' });
    const today = new Date(now.getTime());
    db.state.birthDates.set('acc', new Date(Date.UTC(1990, today.getUTCMonth(), today.getUTCDate())));
    const offer = (await liveOffers(db)).find((candidate) => candidate.kind === 'ITEM')!;
    await credit(db, 'acc', 10_000, 'seed');
    const result = await DropPurchaseService.purchase(prisma(db), 'acc', { offerId: offer.id, actionId: 'action-0007' }, now);
    expect(result.order.priceCrowns).toBe(discountedDropPrice(DROP_ITEMS[offer.refKey]!.priceCrowns, 15));
    expect(db.state.orders[0].metadata).toMatchObject({ discountPercent: 15, discountReason: 'BIRTHDAY' });
  });

  it('charges a free trial the full price', async () => {
    const db = fakeDb();
    db.state.memberships.push({ accountId: 'acc', status: 'trialing' });
    const offer = (await liveOffers(db)).find((candidate) => candidate.kind === 'ITEM')!;
    await credit(db, 'acc', 10_000, 'seed');
    const result = await DropPurchaseService.purchase(prisma(db), 'acc', { offerId: offer.id, actionId: 'action-0006' }, now);
    expect(result.order.priceCrowns).toBe(DROP_ITEMS[offer.refKey]!.priceCrowns);
  });
});

describe('Crown packs (Stripe)', () => {
  const at = 1_792_000_000;
  const order = (overrides: Row = {}) => ({
    id: 'cpo_1', accountId: 'acc', provider: 'stripe', packId: 'boss', crowns: 2800, amountCents: 2299, currency: 'usd',
    status: 'pending', checkoutSessionId: 'cs_1', providerPaymentId: null, ...overrides,
  });
  const event = (type: string, object: Row, idSuffix = '1'): StripeEvent => ({ id: `evt_${type}_${idSuffix}`, type, created: at, data: { object } });
  const paid = (overrides: Row = {}) => event('checkout.session.completed', {
    id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: 2299, currency: 'usd', payment_intent: 'pi_1',
    metadata: { kind: 'crown-pack', accountId: 'acc', packId: 'boss', orderId: 'cpo_1' }, ...overrides,
  });

  it('credits a verified paid checkout exactly once', async () => {
    const db = fakeDb();
    db.state.packOrders.push(order());
    expect(await CrownPackService.applyStripeEvent(db as never, paid())).toBe('granted');
    expect(await CrownPackService.applyStripeEvent(db as never, paid())).toBe('duplicate');
    expect(db.state.wallets.get('acc').balance).toBe(2800);
    expect(db.state.packOrders[0]).toMatchObject({ status: 'credited', providerPaymentId: 'pi_1' });
  });

  it('matches an early refund by Crown-pack metadata before checkout completes', async () => {
    const db = fakeDb();
    db.state.packOrders.push(order());
    expect(await CrownPackService.applyStripeEvent(db as never, event('charge.refunded', {
      id: 'ch_early', payment_intent: 'pi_early', refunded: true,
      metadata: { kind: 'crown-pack', orderId: 'cpo_1' },
    }))).toBe('applied');
    expect(await CrownPackService.applyStripeEvent(db as never, paid({ payment_intent: 'pi_early' }))).toBe('duplicate');
    expect(db.state.wallets.get('acc')?.balance ?? 0).toBe(0);
    expect(db.state.packOrders[0]).toMatchObject({ status: 'refunded', providerPaymentId: 'pi_early' });
  });

  it('credits nothing for an unpaid session, a tampered amount or another account', async () => {
    const db = fakeDb();
    db.state.packOrders.push(order());
    expect(await CrownPackService.applyStripeEvent(db as never, paid({ payment_status: 'unpaid' }))).toBe('applied');
    expect(await CrownPackService.applyStripeEvent(db as never, paid({ amount_total: 1 }))).toBe('unmatched');
    expect(await CrownPackService.applyStripeEvent(db as never, paid({ metadata: { kind: 'crown-pack', accountId: 'other', packId: 'boss', orderId: 'cpo_1' } }))).toBe('unmatched');
    expect(db.state.wallets.get('acc')?.balance ?? 0).toBe(0);
  });

  it('leaves events that are not about Crown packs to supporter billing', async () => {
    const db = fakeDb();
    expect(await CrownPackService.applyStripeEvent(db as never, event('checkout.session.completed', { id: 'cs_9', mode: 'subscription', metadata: {} }))).toBeNull();
    expect(await CrownPackService.applyStripeEvent(db as never, event('charge.refunded', { id: 'ch_9', refunded: true }))).toBeNull();
  });

  it('takes unspent Crowns back on a full refund', async () => {
    const db = fakeDb();
    db.state.packOrders.push(order());
    await CrownPackService.applyStripeEvent(db as never, paid());
    expect(await CrownPackService.applyStripeEvent(db as never, event('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', refunded: true }))).toBe('applied');
    expect(db.state.wallets.get('acc').balance).toBe(0);
    expect(db.state.packOrders[0].status).toBe('refunded');
    expect(db.state.ledger.at(-1)).toMatchObject({ kind: 'REVERSAL', delta: -2800 });
  });

  it('holds the wallet instead of going negative when refunded Crowns were spent', async () => {
    const db = fakeDb();
    db.state.packOrders.push(order());
    await CrownPackService.applyStripeEvent(db as never, paid());
    await CrownWalletService.apply(db as never, { accountId: 'acc', kind: 'SPEND', delta: -2000, source: 'drop-order', externalRef: 'order:x' });
    await CrownPackService.applyStripeEvent(db as never, event('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', refunded: true }));
    expect(db.state.wallets.get('acc')).toMatchObject({ balance: 800 });
    expect(db.state.wallets.get('acc').heldAt).toBeInstanceOf(Date);
    expect(db.state.packOrders[0].status).toBe('refund_review');
  });

  it('holds the wallet on a dispute', async () => {
    const db = fakeDb();
    db.state.packOrders.push(order());
    await CrownPackService.applyStripeEvent(db as never, paid());
    expect(await CrownPackService.applyStripeEvent(db as never, event('charge.dispute.created', { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_1' }))).toBe('applied');
    expect(db.state.wallets.get('acc').heldAt).toBeInstanceOf(Date);
    expect(db.state.packOrders[0].status).toBe('disputed');
  });
});

describe('Earning Crowns', () => {
  const day = new Date('2026-10-18T12:00:00Z');
  const earnDb = (checkIns = 0) => {
    const db = fakeDb();
    db.roundPlayer = { findUnique: async () => ({ accountId: 'acc', roundId: 'r1' }) };
    db.roundLoginCheckIn = { count: async () => checkIns };
    return db;
  };

  it('pays the first daily and weekly contract once per window', async () => {
    const db = earnDb();
    expect(await CrownEarnService.onQuestClaimed(db as never, 'p1', 'DAILY', 'q1', day)).toBe(CROWN_EARN_RULES.dailyContract);
    expect(await CrownEarnService.onQuestClaimed(db as never, 'p1', 'DAILY', 'q2', day)).toBe(0);
    expect(await CrownEarnService.onQuestClaimed(db as never, 'p1', 'DAILY', 'q3', new Date(day.getTime() + 86_400_000))).toBe(CROWN_EARN_RULES.dailyContract);
    expect(await CrownEarnService.onQuestClaimed(db as never, 'p1', 'WEEKLY', 'q4', day)).toBe(CROWN_EARN_RULES.weeklyContract);
    expect(await CrownEarnService.onQuestClaimed(db as never, 'p1', 'WEEKLY', 'q5', day)).toBe(0);
    expect(await CrownEarnService.onQuestClaimed(db as never, 'p1', 'STORY', 'q6', day)).toBe(0);
    expect(db.state.ledger.every((row: Row) => row.kind === 'EARN' && row.roundId === 'r1')).toBe(true);
  });

  it('caps event contracts and the whole round', async () => {
    const db = earnDb();
    for (const source of ['e1', 'e2', 'e3']) await CrownEarnService.onQuestClaimed(db as never, 'p1', 'EVENT', source, day);
    expect(db.state.wallets.get('acc').balance).toBe(CROWN_EARN_RULES.eventCap);
    // An admin grant is not play earnings and never counts toward the cap.
    await credit(db, 'acc', 1000, 'not-earned');
    db.state.ledger.push({ accountId: 'acc', roundId: 'r1', kind: 'EARN', source: 'milestone', delta: CROWN_EARN_RULES.roundCap - CROWN_EARN_RULES.eventCap - 2, externalRef: 'earn:seed' });
    expect(await CrownEarnService.onQuestClaimed(db as never, 'p1', 'WEEKLY', 'w1', day)).toBe(2);
    expect(await CrownEarnService.onQuestClaimed(db as never, 'p1', 'DAILY', 'd1', day)).toBe(0);
  });

  it('pays each check-in milestone once', async () => {
    const db = earnDb(12);
    expect(await CrownEarnService.onCheckIn(db as never, 'p1', day)).toBe(2 * CROWN_EARN_RULES.milestone);
    expect(await CrownEarnService.onCheckIn(db as never, 'p1', day)).toBe(0);
  });
});
