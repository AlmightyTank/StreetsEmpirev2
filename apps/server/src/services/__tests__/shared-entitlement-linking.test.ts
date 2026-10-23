import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedEnv = vi.hoisted(() => ({ appEnvironment: 'beta', sharedEntitlements: { databaseUrl: 'postgresql://shared/test' } }));
vi.mock('../../config/env.js', () => ({ env: mockedEnv }));

const { SharedEntitlementLinkingService } = await import('../shared-entitlement-linking.service.js');
type Row = Record<string, any>;

function databases() {
  const state = { accounts: new Map<string, Row>(), links: new Map<string, Row>(), wallets: new Map<string, Row>(), ledger: new Map<string, Row>(), unlocks: new Map<string, Row>() };
  let sequence = 0;
  const shared: Row = {
    $transaction: async (fn: (tx: Row) => unknown) => fn(shared),
    sharedEntitlementAccount: {
      create: async ({ data }: Row) => { const row = { id: `shared-${++sequence}`, ...data }; state.accounts.set(data.identityKey, row); return row; },
      update: async ({ where, data }: Row) => { const row = [...state.accounts.values()].find((item) => item.id === where.id)!; state.accounts.delete(row.identityKey); Object.assign(row, data); state.accounts.set(row.identityKey, row); return row; },
      updateMany: async ({ where, data }: Row) => { const row = state.accounts.get(where.identityKey); if (!row) return { count: 0 }; state.accounts.delete(row.identityKey); Object.assign(row, data); state.accounts.set(row.identityKey, row); return { count: 1 }; },
      findUnique: async ({ where, include }: Row) => { const row = state.accounts.get(where.identityKey); if (!row) return null; return include?.links ? { ...row, links: [...state.links.values()].filter((link) => link.accountId === row.id) } : row; },
    },
    sharedEntitlementLink: {
      findUnique: async ({ where, include }: Row) => {
        const key = `${where.environment_localAccountId.environment}:${where.environment_localAccountId.localAccountId}`;
        const row = state.links.get(key); if (!row) return null;
        if (!include?.account) return row;
        const account = [...state.accounts.values()].find((item) => item.id === row.accountId)!;
        return { ...row, account: { id: account.id, identityKey: account.identityKey, links: [...state.links.values()].filter((link) => link.accountId === account.id) } };
      },
      create: async ({ data }: Row) => { const row = { id: `link-${++sequence}`, ...data }; state.links.set(`${data.environment}:${data.localAccountId}`, row); return row; },
    },
    sharedCrownWallet: {
      create: async ({ data }: Row) => { const row = { balance: 0, version: 0, heldAt: null, holdReason: null, ...data }; state.wallets.set(data.accountId, row); return row; },
      findUniqueOrThrow: async ({ where }: Row) => state.wallets.get(where.accountId),
      update: async ({ where, data }: Row) => Object.assign(state.wallets.get(where.accountId)!, data),
    },
    sharedCrownLedgerEntry: {
      findUnique: async ({ where }: Row) => state.ledger.get(where.externalRef) ?? null,
      create: async ({ data }: Row) => { const row = { id: `ledger-${++sequence}`, ...data }; state.ledger.set(data.externalRef, row); return row; },
    },
    sharedCosmeticUnlock: {
      upsert: async ({ where, create }: Row) => { const key = `${where.accountId_key.accountId}:${where.accountId_key.key}`; if (!state.unlocks.has(key)) state.unlocks.set(key, create); return state.unlocks.get(key); },
    },
  };
  const local: Row = {
    account: { findUnique: async ({ where }: Row) => ({ id: where.id, username: `player-${where.id}` }) },
    crownWallet: { findUnique: async () => ({ balance: 0, heldAt: null, holdReason: null }) },
    accountCosmeticUnlock: { findMany: async () => [] },
  };
  return { shared, local, state };
}

describe('player shared entitlement linking', () => {
  beforeEach(() => { mockedEnv.appEnvironment = 'beta'; });

  it.each([
    ['beta', 'production'],
    ['production', 'beta'],
  ] as const)('links from %s and redeems on %s', async (startEnvironment, completeEnvironment) => {
    const { shared, local, state } = databases();
    mockedEnv.appEnvironment = startEnvironment;
    const started = await SharedEntitlementLinkingService.start(local as never, shared as never, `${startEnvironment}-account`, new Date('2026-10-23T12:00:00Z'));

    mockedEnv.appEnvironment = completeEnvironment;
    const completed = await SharedEntitlementLinkingService.complete(local as never, shared as never, `${completeEnvironment}-account`, started.code, new Date('2026-10-23T12:01:00Z'));

    expect(completed.linked).toBe(true);
    expect([...state.links.values()].map((link) => link.environment).sort()).toEqual(['beta', 'production']);
    expect([...state.accounts.values()]).toHaveLength(1);
    await expect(SharedEntitlementLinkingService.complete(local as never, shared as never, `${completeEnvironment}-account`, started.code))
      .rejects.toMatchObject({ code: 'SHARED_LINK_CODE_INVALID' });
  });
});
