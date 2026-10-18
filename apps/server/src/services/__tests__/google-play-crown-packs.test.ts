import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const HASH_SECRET = 'play-hash-secret-for-tests-0123456789';
const playEnv = vi.hoisted(() => ({ crownPacksConfigured: true }));
const playCalls = vi.hoisted(() => ({ requests: [] as Array<{ url: string; method: string }>, product: {} as Record<string, unknown> }));

vi.mock('../../config/env.js', async (original) => {
  const actual = await original<typeof import('../../config/env.js')>();
  return {
    env: {
      ...actual.env,
      drop: { ...actual.env.drop, enabled: true },
      googlePlay: {
        ...actual.env.googlePlay,
        enabled: true,
        packageName: 'dev.streetsempire.app',
        serviceAccountJsonBase64: Buffer.from('{}').toString('base64'),
        accountHashSecret: HASH_SECRET,
        crownPackProductIds: { starter: 'crowns_starter', street: 'crowns_street', boss: 'crowns_boss', kingpin: 'crowns_kingpin', empire: 'crowns_empire' },
        get crownPacksConfigured() { return playEnv.crownPacksConfigured; },
      },
    },
  };
});
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return {
        request: async ({ url, method = 'GET' }: { url: string; method?: string }) => {
          playCalls.requests.push({ url, method });
          return { data: method === 'GET' ? playCalls.product : {} };
        },
      };
    }
  },
  OAuth2Client: class {},
}));

const { GooglePlayBillingService } = await import('../google-play-billing.service.js');

type Row = Record<string, any>;
const ACCOUNT = 'acc_play';
const TOKEN = 'play-token-1';
const accountHash = createHmac('sha256', HASH_SECRET).update(ACCOUNT).digest('hex');

/** Just the tables a Play Crown pack touches. Transactions run inline. */
function fakeDb() {
  const state = { wallets: new Map<string, Row>(), ledger: [] as Row[], playOrders: new Map<string, Row>() };
  const db: Row = {
    state,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    $executeRaw: async (_strings: TemplateStringsArray, accountId: string) => {
      if (!state.wallets.has(accountId)) state.wallets.set(accountId, { accountId, balance: 0, version: 0, heldAt: null, holdReason: null });
      return 1;
    },
    $queryRaw: async (_strings: TemplateStringsArray, accountId: string) => [{ ...state.wallets.get(accountId)! }],
    dropSettings: { findUnique: async () => null },
    crownWallet: { update: async ({ where, data }: Row) => Object.assign(state.wallets.get(where.accountId)!, data) },
    crownLedgerEntry: {
      findUnique: async ({ where }: Row) => state.ledger.find((row) => row.externalRef === where.externalRef) ?? null,
      create: async ({ data }: Row) => { const row = { id: `led_${state.ledger.length + 1}`, createdAt: new Date(), ...data }; state.ledger.push(row); return row; },
    },
    googlePlayCrownPackOrder: {
      findUnique: async ({ where }: Row) => state.playOrders.get(where.purchaseToken) ?? null,
      upsert: async ({ where, create, update }: Row) => {
        const existing = state.playOrders.get(where.purchaseToken);
        const row = existing ? Object.assign(existing, update) : { ...create };
        state.playOrders.set(where.purchaseToken, row);
        return row;
      },
      update: async ({ where, data }: Row) => Object.assign(state.playOrders.get(where.purchaseToken)!, data),
    },
  };
  return db;
}

const prisma = (db: Row) => db as unknown as PrismaClient;
const rtdn = (notification: Record<string, unknown>) => ({
  message: { messageId: 'm1', data: Buffer.from(JSON.stringify({ packageName: 'dev.streetsempire.app', ...notification })).toString('base64') },
});

async function buyStarter(db: Row) {
  playCalls.product = { purchaseState: 0, consumptionState: 0, acknowledgementState: 0, orderId: 'GPA.1', obfuscatedExternalAccountId: accountHash };
  await GooglePlayBillingService.verifyCrownPack(prisma(db), ACCOUNT, 'crowns_starter', TOKEN);
}

beforeEach(() => {
  playEnv.crownPacksConfigured = true;
  playCalls.requests = [];
});

describe('Google Play Crown packs', () => {
  it('stays shut while DROP_CROWN_PACKS_ENABLED is off', async () => {
    playEnv.crownPacksConfigured = false;
    await expect(GooglePlayBillingService.verifyCrownPack(prisma(fakeDb()), ACCOUNT, 'crowns_starter', TOKEN))
      .rejects.toMatchObject({ code: 'PLAY_CROWN_PACKS_UNAVAILABLE' });
    expect(playCalls.requests).toHaveLength(0);
  });

  it('credits once, then consumes the pack so it can be bought again', async () => {
    const db = fakeDb();
    await buyStarter(db);
    expect(db.state.wallets.get(ACCOUNT).balance).toBe(500);
    const consume = playCalls.requests.filter((call) => call.method === 'POST');
    expect(consume).toHaveLength(1);
    expect(consume[0]!.url).toMatch(/\/purchases\/products\/crowns_starter\/tokens\/play-token-1:consume$/);

    // A retried verify after a failed consume never pays twice, and consumes again.
    await buyStarter(db);
    expect(db.state.wallets.get(ACCOUNT).balance).toBe(500);
    expect(playCalls.requests.filter((call) => call.method === 'POST')).toHaveLength(2);
  });

  it('does not consume a purchase Google already shows as consumed', async () => {
    const db = fakeDb();
    playCalls.product = { purchaseState: 0, consumptionState: 1, obfuscatedExternalAccountId: accountHash };
    await GooglePlayBillingService.verifyCrownPack(prisma(db), ACCOUNT, 'crowns_starter', TOKEN);
    expect(playCalls.requests.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('takes unspent Crowns back on a full refund, once', async () => {
    const db = fakeDb();
    await buyStarter(db);
    const voided = rtdn({ voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: 'GPA.1', productType: 2, refundType: 1 } });
    expect(await GooglePlayBillingService.handleRtdn(prisma(db), voided)).toMatchObject({ outcome: 'applied' });
    expect(db.state.wallets.get(ACCOUNT).balance).toBe(0);
    expect(db.state.playOrders.get(TOKEN).status).toBe('refunded');
    expect(await GooglePlayBillingService.handleRtdn(prisma(db), voided)).toMatchObject({ outcome: 'ignored' });
    expect(db.state.ledger.filter((row: Row) => row.kind === 'REVERSAL')).toHaveLength(1);
  });

  it('holds the wallet when the refunded Crowns are already spent', async () => {
    const db = fakeDb();
    await buyStarter(db);
    db.state.wallets.get(ACCOUNT).balance = 120;
    const voided = rtdn({ voidedPurchaseNotification: { purchaseToken: TOKEN, productType: 2, refundType: 1 } });
    await GooglePlayBillingService.handleRtdn(prisma(db), voided);
    expect(db.state.wallets.get(ACCOUNT)).toMatchObject({ balance: 120 });
    expect(db.state.wallets.get(ACCOUNT).heldAt).toBeInstanceOf(Date);
    expect(db.state.playOrders.get(TOKEN).status).toBe('refund_review');
  });

  it('holds the wallet for review on a partial refund', async () => {
    const db = fakeDb();
    await buyStarter(db);
    await GooglePlayBillingService.handleRtdn(prisma(db), rtdn({ voidedPurchaseNotification: { purchaseToken: TOKEN, productType: 2, refundType: 2 } }));
    expect(db.state.wallets.get(ACCOUNT).balance).toBe(500);
    expect(db.state.wallets.get(ACCOUNT).heldAt).toBeInstanceOf(Date);
  });

  it('still takes refunds back after packs are switched off', async () => {
    const db = fakeDb();
    await buyStarter(db);
    playEnv.crownPacksConfigured = false;
    await GooglePlayBillingService.handleRtdn(prisma(db), rtdn({ voidedPurchaseNotification: { purchaseToken: TOKEN, productType: 2, refundType: 1 } }));
    expect(db.state.wallets.get(ACCOUNT).balance).toBe(0);
  });

  it('answers a cancelled pending purchase without crediting', async () => {
    const db = fakeDb();
    db.state.playOrders.set(TOKEN, { purchaseToken: TOKEN, accountId: ACCOUNT, status: 'pending' });
    const cancelled = rtdn({ oneTimeProductNotification: { purchaseToken: TOKEN, sku: 'crowns_starter', notificationType: 2 } });
    expect(await GooglePlayBillingService.handleRtdn(prisma(db), cancelled)).toMatchObject({ outcome: 'ignored' });
    expect(playCalls.requests).toHaveLength(0);
  });
});
