import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DROP_ITEMS } from '@streets/rulesets';

/**
 * The Drop against PostgreSQL: the wallet row lock under concurrent spends,
 * idempotent grants and purchases, the HTTP surface and round independence.
 * Opt in with DROP_INTEGRATION=1. It does not create or end rounds, so it is
 * safe to point at the dev database; it removes its own accounts afterwards.
 */
describe.runIf(process.env.DROP_INTEGRATION === '1')('The Drop with PostgreSQL', () => {
  let app: FastifyInstance;
  const accountIds: string[] = [];

  async function makeAccount(): Promise<{ id: string; cookie: string }> {
    const name = `drop_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID(), ageConfirmed: true } });
    expect(registered.statusCode, registered.body).toBe(201);
    const id = registered.json().account.id as string;
    accountIds.push(id);
    return { id, cookie: registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
  }

  const wallet = async () => (await import('../crown-wallet.service.js')).CrownWalletService;
  const grant = async (accountId: string, crowns: number, ref = randomUUID()) =>
    app.prisma.$transaction(async (tx) => (await wallet()).apply(tx, { accountId, kind: 'ADJUSTMENT', delta: crowns, source: 'admin', externalRef: `test:${ref}` }));

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.dropOrder.deleteMany({ where: { accountId: { in: accountIds } } });
    await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app.close();
  });

  it('lets only one of two racing spends through when the balance covers one', async () => {
    const { id } = await makeAccount();
    await grant(id, 100);
    const spend = (ref: string) => app.prisma.$transaction(async (tx) =>
      (await wallet()).apply(tx, { accountId: id, kind: 'SPEND', delta: -80, source: 'drop-order', externalRef: `test:${ref}` }));
    const results = await Promise.allSettled([spend(randomUUID()), spend(randomUUID())]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const row = await app.prisma.crownWallet.findUniqueOrThrow({ where: { accountId: id } });
    expect(row.balance).toBe(20);
    const ledger = await app.prisma.crownLedgerEntry.aggregate({ where: { accountId: id }, _sum: { delta: true } });
    expect(ledger._sum.delta).toBe(row.balance);
  });

  it('never double-credits a replayed grant, even when the replays race', async () => {
    const { id } = await makeAccount();
    const ref = randomUUID();
    await Promise.allSettled([grant(id, 50, ref), grant(id, 50, ref), grant(id, 50, ref)]);
    const row = await app.prisma.crownWallet.findUniqueOrThrow({ where: { accountId: id } });
    expect(row.balance).toBe(50);
  });

  it('buys once over HTTP, replays a double tap and keeps ownership off the round', async () => {
    const { id, cookie } = await makeAccount();
    await grant(id, 10_000);
    const store = await app.inject({ method: 'GET', url: '/api/drop', headers: { cookie } });
    expect(store.statusCode, store.body).toBe(200);
    const offer = (store.json().offers as Array<{ id: string; kind: string; refKey: string; state: string; priceCrowns: number }>)
      .find((candidate) => candidate.kind === 'ITEM' && candidate.state === 'AVAILABLE')!;
    expect(offer).toBeTruthy();
    const actionId = randomUUID();
    const buy = () => app.inject({ method: 'POST', url: '/api/drop/purchase', headers: { cookie }, payload: { offerId: offer.id, actionId } });
    const [first, second] = await Promise.all([buy(), buy()]);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(first.json().order.id).toBe(second.json().order.id);
    const row = await app.prisma.crownWallet.findUniqueOrThrow({ where: { accountId: id } });
    expect(row.balance).toBe(10_000 - offer.priceCrowns);
    const unlocks = await app.prisma.accountCosmeticUnlock.findMany({ where: { accountId: id, key: offer.refKey } });
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0]).toMatchObject({ sourceQuestKey: 'drop', title: DROP_ITEMS[offer.refKey]!.name });

    const again = await app.inject({ method: 'POST', url: '/api/drop/purchase', headers: { cookie }, payload: { offerId: offer.id, actionId: randomUUID() } });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code ?? again.json().code).toBe('DROP_ALREADY_OWNED');
  });

  it('refuses a purchase the balance cannot cover, with nothing granted', async () => {
    const { id, cookie } = await makeAccount();
    const store = await app.inject({ method: 'GET', url: '/api/drop', headers: { cookie } });
    const offer = (store.json().offers as Array<{ id: string; kind: string; refKey: string }>).find((candidate) => candidate.kind === 'ITEM')!;
    const response = await app.inject({ method: 'POST', url: '/api/drop/purchase', headers: { cookie }, payload: { offerId: offer.id, actionId: randomUUID() } });
    expect(response.statusCode).toBe(409);
    expect(await app.prisma.accountCosmeticUnlock.count({ where: { accountId: id, key: offer.refKey } })).toBe(0);
    expect(await app.prisma.dropOrder.count({ where: { accountId: id } })).toBe(0);
  });

  it('shows the storefront signed out without any private data', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/drop' });
    expect(response.statusCode).toBe(200);
    expect(response.json().wallet).toBeNull();
    const wallet = await app.inject({ method: 'GET', url: '/api/drop/wallet' });
    expect(wallet.statusCode).toBe(401);
  });

  it('charges paid supporters 10% less, and free trials the full price', async () => {
    const { discountedDropPrice } = await import('@streets/rulesets');
    for (const [status, discounted] of [['active', true], ['trialing', false]] as const) {
      const { id, cookie } = await makeAccount();
      await grant(id, 10_000);
      await app.prisma.supporterMembership.create({ data: { accountId: id, stripeCustomerId: `cus_test_${randomUUID()}`, status } });
      const store = await app.inject({ method: 'GET', url: '/api/drop', headers: { cookie } });
      expect(store.json().discount).toEqual(discounted ? { percent: 10, reason: 'SUPPORTER', endsAt: null } : null);
      const offer = (store.json().offers as Array<{ id: string; kind: string; state: string; priceCrowns: number; basePriceCrowns: number }>)
        .find((candidate) => candidate.kind === 'ITEM' && candidate.state === 'AVAILABLE')!;
      expect(offer.priceCrowns).toBe(discounted ? discountedDropPrice(offer.basePriceCrowns, 10) : offer.basePriceCrowns);
      const bought = await app.inject({ method: 'POST', url: '/api/drop/purchase', headers: { cookie }, payload: { offerId: offer.id, actionId: randomUUID() } });
      expect(bought.statusCode, bought.body).toBe(200);
      expect(bought.json().order.priceCrowns).toBe(offer.priceCrowns);
      const row = await app.prisma.crownWallet.findUniqueOrThrow({ where: { accountId: id } });
      expect(row.balance).toBe(10_000 - offer.priceCrowns);
    }
  });
});
