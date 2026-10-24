import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DROP_ITEMS } from '@streets/rulesets';

const mockedEnv = vi.hoisted(() => ({
  appEnvironment: 'beta',
  sharedEntitlements: { enabled: true },
}));
vi.mock('../../config/env.js', () => ({ env: mockedEnv }));

const { linkSharedEntitlementAccount, requireSharedEntitlementAccount } = await import('../shared-entitlement-account.service.js');
const { applySharedCrownMovement, applySharedDropPurchase, configureSharedEntitlements, sharedEntitlementRuntime } = await import('../shared-entitlement-runtime.js');

type Row = Record<string, any>;

function sharedDb() {
  const state = {
    accounts: new Map<string, Row>(),
    links: new Map<string, Row>(),
    wallets: new Map<string, Row>(),
    ledger: new Map<string, Row>(),
    unlocks: new Map<string, Row>(),
    purchases: new Map<string, Row>(),
  };
  let sequence = 0;
  const keyForLink = (environment: string, localAccountId: string) => `${environment}:${localAccountId}`;
  const db: Row = {
    state,
    $transaction: async (fn: (tx: Row) => unknown) => fn(db),
    sharedEntitlementAccount: {
      upsert: async ({ where, create }: Row) => {
        let account = state.accounts.get(where.identityKey);
        if (!account) {
          account = { id: `shared-${++sequence}`, identityKey: create.identityKey };
          state.accounts.set(create.identityKey, account);
        }
        return { id: account.id };
      },
    },
    sharedEntitlementLink: {
      findUnique: async ({ where }: Row) => state.links.get(keyForLink(where.environment_localAccountId.environment, where.environment_localAccountId.localAccountId)) ?? null,
      upsert: async ({ where, create }: Row) => {
        const key = keyForLink(where.environment_localAccountId.environment, where.environment_localAccountId.localAccountId);
        let link = state.links.get(key);
        if (!link) {
          const inserted: Row = { ...create };
          state.links.set(key, inserted);
          link = inserted;
        }
        return link;
      },
    },
    sharedCrownWallet: {
      upsert: async ({ where, create, update }: Row) => {
        let wallet = state.wallets.get(where.accountId);
        if (!wallet) {
          const inserted: Row = { accountId: where.accountId, balance: 0, version: 0, heldAt: null, holdReason: null, ...create };
          state.wallets.set(where.accountId, inserted);
          wallet = inserted;
        } else Object.assign(wallet, update);
        return wallet;
      },
      findUnique: async ({ where }: Row) => state.wallets.get(where.accountId) ?? null,
      update: async ({ where, data }: Row) => Object.assign(state.wallets.get(where.accountId)!, data),
    },
    $queryRaw: async (_strings: TemplateStringsArray, accountId: string) => {
      const wallet = state.wallets.get(accountId);
      return wallet ? [{ balance: wallet.balance, version: wallet.version, heldAt: wallet.heldAt }] : [];
    },
    sharedCrownLedgerEntry: {
      findUnique: async ({ where }: Row) => state.ledger.get(where.externalRef) ?? null,
      create: async ({ data }: Row) => {
        if (state.ledger.has(data.externalRef)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        const entry = { id: `ledger-${++sequence}`, ...data };
        state.ledger.set(data.externalRef, entry);
        return entry;
      },
    },
    sharedCosmeticUnlock: {
      findFirst: async ({ where }: Row) => [...state.unlocks.values()].find((row) => row.accountId === where.accountId && row.source === where.source && where.key.in.includes(row.key)) ?? null,
      findMany: async ({ where }: Row) => [...state.unlocks.values()].filter((row) => row.accountId === where.accountId && row.source === where.source),
      upsert: async ({ where, create }: Row) => {
        const key = `${where.accountId_key.accountId}:${where.accountId_key.key}`;
        if (!state.unlocks.has(key)) state.unlocks.set(key, create);
        return state.unlocks.get(key);
      },
    },
    sharedEntitlementPurchase: {
      findUnique: async ({ where }: Row) => state.purchases.get(`${where.environment_localOrderId.environment}:${where.environment_localOrderId.localOrderId}`) ?? null,
      create: async ({ data }: Row) => {
        const key = `${data.environment}:${data.localOrderId}`;
        const purchase = { id: `purchase-${++sequence}`, ...data };
        state.purchases.set(key, purchase);
        return purchase;
      },
    },
  };
  return db;
}

function localDb() {
  const unlocks: Row[] = [];
  return {
    unlocks,
    accountCosmeticUnlock: {
      createMany: async ({ data }: Row) => {
        for (const row of data) if (!unlocks.some((entry) => entry.key === row.key)) unlocks.push(row);
        return { count: data.length };
      },
    },
  };
}

async function linkPair(db: Row) {
  const beta = await linkSharedEntitlementAccount(db as never, { identityKey: 'verified-player-1', environment: 'beta', localAccountId: 'beta-1' });
  const main = await linkSharedEntitlementAccount(db as never, { identityKey: 'verified-player-1', environment: 'production', localAccountId: 'main-1' });
  return { beta, main };
}

describe('shared entitlement linking and transfers', () => {
  beforeEach(() => {
    mockedEnv.appEnvironment = 'beta';
    configureSharedEntitlements(null);
  });

  it('links verified beta and production accounts idempotently and rejects conflicting relinks', async () => {
    const db = sharedDb();
    const first = await linkSharedEntitlementAccount(db as never, { identityKey: 'verified-player-1', environment: 'beta', localAccountId: 'beta-1' });
    const retry = await linkSharedEntitlementAccount(db as never, { identityKey: 'verified-player-1', environment: 'beta', localAccountId: 'beta-1' });
    const main = await linkSharedEntitlementAccount(db as never, { identityKey: 'verified-player-1', environment: 'production', localAccountId: 'main-1' });
    expect(first).toEqual(retry);
    expect(main).toEqual(first);
    expect(db.state.links.size).toBe(2);
    await expect(linkSharedEntitlementAccount(db as never, { identityKey: 'different-player', environment: 'beta', localAccountId: 'beta-1' }))
      .rejects.toMatchObject({ code: 'SHARED_ENTITLEMENT_LINK_CONFLICT' });
  });

  it('requires an explicit environment/account link and never guesses identity', async () => {
    const db = sharedDb();
    await expect(requireSharedEntitlementAccount(db as never, 'beta', 'unlinked-account'))
      .rejects.toMatchObject({ code: 'SHARED_ENTITLEMENT_LINK_REQUIRED' });
    await linkPair(db);
    await expect(requireSharedEntitlementAccount(db as never, 'beta', 'main-1'))
      .rejects.toMatchObject({ code: 'SHARED_ENTITLEMENT_LINK_REQUIRED' });
  });

  it('keeps unlinked accounts on their environment-local Drop and wallet', async () => {
    const db = sharedDb();
    configureSharedEntitlements(db as never);
    mockedEnv.appEnvironment = 'beta';

    // A missing link means callers use the local Drop/wallet services.
    expect(await applySharedCrownMovement({
      accountId: 'beta-unlinked',
      kind: 'EARN',
      delta: 25,
      source: 'daily-contract',
      externalRef: 'earn:daily:unlinked',
    })).toBeNull();
    const local = localDb();
    expect(await sharedEntitlementRuntime({ entitlements: db as never, prisma: local as never } as never, 'beta-unlinked')).toBeNull();
    expect(db.state.wallets.size).toBe(0);
    expect(db.state.ledger.size).toBe(0);
  });

  it('shares Crown credits and spends across environments and applies each request once', async () => {
    const db = sharedDb();
    const { beta, main } = await linkPair(db);
    configureSharedEntitlements(db as never);
    mockedEnv.appEnvironment = 'beta';
    const grant = { accountId: 'beta-1', kind: 'EARN', delta: 120, source: 'daily-contract', externalRef: 'earn:daily:player:2026-10-23' };
    expect(await applySharedCrownMovement(grant)).toEqual({ balance: 120, applied: true });
    expect(await applySharedCrownMovement(grant)).toEqual({ balance: 120, applied: false });

    mockedEnv.appEnvironment = 'production';
    const spend = { accountId: 'main-1', kind: 'SPEND', delta: -70, source: 'drop-order', externalRef: 'purchase:action-1' };
    expect(await applySharedCrownMovement(spend)).toEqual({ balance: 50, applied: true });
    expect(await applySharedCrownMovement(spend)).toEqual({ balance: 50, applied: false });
    expect(db.state.wallets.get(beta.id)?.balance).toBe(50);
    expect(db.state.wallets.get(main.id)?.balance).toBe(50);
    expect(db.state.ledger.size).toBe(2);
  });

  it('makes a Drop purchase visible in the other environment and blocks a second purchase there', async () => {
    const db = sharedDb();
    const { beta, main } = await linkPair(db);
    const wallet = { accountId: beta.id, balance: 5000, version: 0, heldAt: null, holdReason: null };
    db.state.wallets.set(beta.id, wallet);
    const key = Object.keys(DROP_ITEMS)[0]!;
    mockedEnv.appEnvironment = 'beta';
    const betaLocal = localDb();
    const betaRuntime = await sharedEntitlementRuntime({ entitlements: db as never, prisma: betaLocal as never } as never, 'beta-1');
    expect(betaRuntime?.accountId).toBe(beta.id);
    await applySharedDropPurchase(betaRuntime!, { actionId: 'buy-1', orderId: 'local-order-beta', refKey: key, price: 700, keys: [key], now: new Date('2026-10-23T12:00:00Z') });
    // A retry with the same action id is a no-op: no second ledger entry or debit.
    await applySharedDropPurchase(betaRuntime!, { actionId: 'buy-1', orderId: 'local-order-beta', refKey: key, price: 700, keys: [key], now: new Date('2026-10-23T12:00:01Z') });
    expect(wallet.balance).toBe(4300);
    expect(db.state.ledger.size).toBe(1);
    await expect(applySharedDropPurchase(betaRuntime!, { actionId: 'buy-1', orderId: 'local-order-beta', refKey: key, price: 800, keys: [key], now: new Date('2026-10-23T12:00:02Z') }))
      .rejects.toMatchObject({ code: 'ACTION_ID_REUSED' });

    mockedEnv.appEnvironment = 'production';
    const mainLocal = localDb();
    const mainRuntime = await sharedEntitlementRuntime({ entitlements: db as never, prisma: mainLocal as never } as never, 'main-1');
    expect(mainRuntime?.accountId).toBe(main.id);
    expect(mainLocal.unlocks.map((unlock) => unlock.key)).toContain(key);
    await expect(applySharedDropPurchase(mainRuntime!, { actionId: 'buy-2', orderId: 'local-order-main', refKey: key, price: 700, keys: [key], now: new Date('2026-10-23T12:01:00Z') }))
      .rejects.toMatchObject({ code: 'DROP_ALREADY_OWNED' });
    expect(wallet.balance).toBe(4300);
    expect(db.state.ledger.size).toBe(1);
  });
});
