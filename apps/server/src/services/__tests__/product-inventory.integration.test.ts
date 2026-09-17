import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV03D, classicOgV04A } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { ProductsDto } from '@streets/shared';
import { lockRoundPlayer } from '../../utils/db.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.4.0-A gate: the hybrid product inventory. Crack stays on its column, other
 * products are rows, changes are locked and never go negative, and a round
 * without a catalog is untouched. Opt in with PRODUCT_INTEGRATION=1.
 */
describe.runIf(process.env.PRODUCT_INTEGRATION === '1')('product inventory with PostgreSQL', () => {
  let app: FastifyInstance;
  const rounds: Record<'products' | 'legacy', string> = { products: '', legacy: '' };
  const players: Record<'products' | 'legacy', string> = { products: '', legacy: '' };
  let accountId = '';
  let cookie = '';

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = `prod_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    for (const [kind, rules] of [['products', classicOgV04A], ['legacy', classicOgV03D]] as const) {
      const round = await app.prisma.round.create({ data: {
        name: `Products fixture ${kind}`, slug: `products-${kind}-${randomUUID()}`,
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      } });
      rounds[kind] = round.id;
      const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId, cityId, displayName: name, publicPimpId: 6000,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players[kind] = player.id;
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of Object.values(rounds)) if (id) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: { in: Object.values(players) } } });
    await app.prisma.roundPlayer.updateMany({ where: { id: { in: Object.values(players) } }, data: { crack: 100 } });
  });

  const adjust = (kind: 'products' | 'legacy', changes: Record<string, number>, rules = kind === 'products' ? classicOgV04A : classicOgV03D) =>
    app.prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, players[kind]);
      return ProductInventoryService.adjust(tx, players[kind], rules, changes);
    });

  it('reads crack from its column and every other product from rows, starting at zero', async () => {
    expect(await ProductInventoryService.read(app.prisma, players.products, classicOgV04A))
      .toEqual({ CRACK: 100, WEED: 0, ECSTASY: 0, COCAINE: 0, METH: 0, HEROIN: 0 });
    expect(await ProductInventoryService.read(app.prisma, players.legacy, classicOgV03D)).toEqual({ CRACK: 100 });
  });

  it('writes crack to the column and new products to rows', async () => {
    const after = await adjust('products', { ECSTASY: 25, CRACK: -40 });
    expect(after).toMatchObject({ ECSTASY: 25, CRACK: 60 });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players.products } })).crack).toBe(60);
    const rows = await app.prisma.playerProduct.findMany({ where: { roundPlayerId: players.products } });
    expect(rows.map((row) => [row.productKey, row.quantity])).toEqual([['ECSTASY', 25]]);
  });

  it('refuses the whole change when any product would go negative, or is not in the round', async () => {
    await adjust('products', { ECSTASY: 5 });
    await expect(adjust('products', { ECSTASY: 10, CRACK: -101 })).rejects.toMatchObject({ code: 'NOT_ENOUGH_PRODUCT' });
    await expect(adjust('products', { PILLS: 1 })).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    await expect(adjust('legacy', { ECSTASY: 1 })).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    await expect(adjust('products', { ECSTASY: 0.5 })).rejects.toThrow('whole number');
    expect(await ProductInventoryService.read(app.prisma, players.products, classicOgV04A)).toMatchObject({ ECSTASY: 5, CRACK: 100 });
    expect(await app.prisma.playerProduct.count({ where: { roundPlayerId: players.legacy } })).toBe(0);
  });

  it('serializes concurrent spending, so stock cannot be spent twice', async () => {
    await adjust('products', { METH: 10 });
    const results = await Promise.allSettled([adjust('products', { METH: -6 }), adjust('products', { METH: -6 })]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await ProductInventoryService.read(app.prisma, players.products, classicOgV04A)).METH).toBe(4);
  });

  it('never stores negative stock, even if code bypasses the service', async () => {
    await adjust('products', { WEED: 1 });
    await expect(app.prisma.playerProduct.updateMany({ where: { roundPlayerId: players.products, productKey: 'WEED' }, data: { quantity: -1 } })).rejects.toThrow();
  });

  it('shows the catalog only on rounds that have one', async () => {
    const spy = vi.spyOn(RoundService, 'requireCurrent');
    spy.mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: rounds.products } }));
    const products = (await app.inject({ method: 'GET', url: '/api/game/products', headers: { cookie } })).json<ProductsDto>();
    expect(products.enabled).toBe(true);
    expect(products.products.map((row) => [row.key, row.quantity])).toEqual([['CRACK', 100], ['WEED', 0], ['ECSTASY', 0], ['COCAINE', 0], ['METH', 0], ['HEROIN', 0]]);

    spy.mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: rounds.legacy } }));
    expect((await app.inject({ method: 'GET', url: '/api/game/products', headers: { cookie } })).json<ProductsDto>()).toEqual({ enabled: false, products: [] });
  });
});
