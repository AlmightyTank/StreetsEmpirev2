import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV04C, classicOgV04D, classicOgV07D } from '@streets/rulesets';
import { calculateNetWorthCents, productNetWorthCents, startingStock } from '@streets/rules-engine';
import type { BattleReportDto, GameActionResult, ProduceCrackResult, ProductsDto, ProductTradeResult } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.4.0-D gate, live: Pip deals every product off its own shelf, Produce cooks
 * the recipe asked for, raids take a mix and conserve every unit, recon reads a
 * stash level, and net worth counts every product in integer cents.
 * Opt in with PRODUCT_INTEGRATION=1.
 */
describe.runIf(process.env.PRODUCT_INTEGRATION === '1')('product economy with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV04D;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Product economy fixture', slug: `economy-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (let i = 0; i < 2; i++) {
      const name = `economy_${i}_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[i]!, cityId, displayName: name, publicPimpId: 7200 + i,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rules.meta.id, rulesetVersion: rules.meta.version } });
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rules.meta.id, rulesetVersion: rules.meta.version } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.productShelf.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.workSupplyPolicy.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.combatIntel.deleteMany({ where: { OR: [{ observerId: { in: players } }, { targetId: { in: players } }] } });
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.raidBattle.deleteMany({ where: { attackerId: { in: players } } });
    for (let i = 0; i < players.length; i++) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 50, thugs: i === 0 ? 40 : 20, woundedThugs: 0, pistols: i === 0 ? 40 : 20, beer: 500, condoms: 5_000, crack: 0,
        turns: 144, cashCents: 50_000_000n, heat: 0, cityId,
        createdAt: new Date(Date.now() - 3 * 86_400_000), lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
        raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null, allianceId: null };
      await app.prisma.roundPlayer.update({ where: { id: players[i]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const post = (who: number, url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[who]! }, payload });
  const get = (who: number, url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[who]! } });
  const row = (who: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[who]! } });
  const stock = (who: number) => ProductInventoryService.read(app.prisma, players[who]!, rules);
  const give = (who: number, products: Record<string, number>) => app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, players[who]!, rules, products));

  it("buys and sells at Pip's counter off a shelf that runs out, and counts product in net worth", async () => {
    const page = (await get(0, '/products')).json<ProductsDto>();
    expect(page.economy).toBe(true);
    const weed = page.products.find((product) => product.key === 'WEED')!;
    expect(weed.pip).toMatchObject({ buyCents: 800, sellCents: 240, stock: 400, cap: 400 });
    expect(page.products.find((product) => product.key === 'CRACK')!.pip).toBeNull();

    const before = await row(0);
    const bought = await post(0, '/products/trade', { product: 'WEED', direction: 'buy', quantity: 300, actionId: randomUUID() });
    expect(bought.statusCode, bought.body).toBe(200);
    const result = bought.json<GameActionResult<ProductTradeResult>>();
    expect(result.result).toMatchObject({ quantityAfter: 300, stockAfter: 100, totalCents: 240_000 });
    const after = await row(0);
    expect(after.cashCents).toBe(before.cashCents - 240_000n);
    // Integer cents: stored worth is exactly the column worth plus the rows' value.
    expect(after.netWorthCents).toBe(calculateNetWorthCents(after, rules) + productNetWorthCents({ WEED: 300 }, rules));
    expect(result.after.netWorthCents - result.before.netWorthCents).toBe(-240_000 * rules.economy.netWorth.cashWeightPercent / 100 + 300 * 240);

    expect((await post(0, '/products/trade', { product: 'WEED', direction: 'buy', quantity: 101, actionId: randomUUID() })).json().error.code).toBe('OUT_OF_STOCK');
    expect((await post(0, '/products/trade', { product: 'CRACK', direction: 'buy', quantity: 1, actionId: randomUUID() })).json().error.code).toBe('USE_PIP_PRODUCT');

    const sold = await post(0, '/products/trade', { product: 'WEED', direction: 'sell', quantity: 300, actionId: randomUUID() });
    expect(sold.statusCode, sold.body).toBe(200);
    expect((await stock(0)).WEED).toBe(0);
    // A round trip always loses money: no loop.
    expect((await row(0)).cashCents).toBe(before.cashCents - 240_000n + 72_000n);
  });

  it('cooks the recipe asked for into its own stock, charges its ingredients, and adds its Heat', async () => {
    const cooked = await post(0, '/produce-crack', { turns: 10, productType: 'METH', actionId: randomUUID() });
    expect(cooked.statusCode, cooked.body).toBe(200);
    const result = cooked.json<GameActionResult<ProduceCrackResult>>().result;
    expect(result).toMatchObject({ productType: 'METH', productName: 'Meth', crackProduced: 0 });
    expect(result.productProduced).toBeGreaterThan(0);
    expect((await stock(0)).METH).toBe(result.productProduced);
    expect(result.ingredientCents).toBe((result.productProduced - (result.hideoutBonusProduct ?? 0)) * rules.products.METH.economy.production.ingredientCentsPerUnit);
    expect(result.heat!.added).toBeGreaterThanOrEqual(Math.round(result.productProduced * rules.products.METH.economy.production.heatPerUnit) - 1);

    expect((await post(0, '/produce-crack', { turns: 1, productType: 'COCAINE', actionId: randomUUID() })).json().error.code).toBe('UNKNOWN_RECIPE');
  });

  it('applies the same 0.7-D Workshop output and ingredient-efficiency path to every cookable product', async () => {
    await app.prisma.round.update({
      where: { id: roundId },
      data: { rulesetId: classicOgV07D.meta.id, rulesetVersion: classicOgV07D.meta.version },
    });
    await app.prisma.roundPlayer.update({
      where: { id: players[0]! },
      data: { hideoutWorkshopLevel: 5, heat: 0, cashCents: 50_000_000n },
    });

    for (const [productType, baseIngredient, effectiveIngredient] of [
      ['METH', 700, 644],
      ['ECSTASY', 1_500, 1_380],
    ] as const) {
      const response = await post(0, '/produce-crack', {
        turns: 10,
        productType,
        actionId: randomUUID(),
      });
      expect(response.statusCode, response.body).toBe(200);
      const result = response.json<GameActionResult<ProduceCrackResult>>().result;
      expect(result.productType).toBe(productType);
      expect(result.hideoutIngredientEfficiencyPercent).toBe(8);
      expect(result.ingredientCentsPerUnit).toBe(effectiveIngredient);
      expect(result.hideoutBonusProduct).toBeGreaterThanOrEqual(0);
      const baseOutput = result.productProduced - (result.hideoutBonusProduct ?? 0);
      expect(result.ingredientCents).toBe(baseOutput * effectiveIngredient);
      expect(result.hideoutIngredientSavingsCents).toBe(baseOutput * (baseIngredient - effectiveIngredient));
    }
  });

  it('raids take a mix of products and conserve every unit; recon reads a level, not a count', async () => {
    await give(1, { WEED: 400, COCAINE: 100 });
    await app.prisma.roundPlayer.update({ where: { id: players[1]! }, data: { crack: 500 } });

    const recon = await post(0, '/combat/recon', { roundId, targetPublicPimpId: 7201, actionId: randomUUID() });
    expect(recon.statusCode, recon.body).toBe(200);
    expect(recon.json().intel).toMatchObject({ crack: null, estimatedMaxCrackLoot: null, productStash: { level: 'heavy', primary: 'Crack' } });

    const beforeA = { ...(await stock(0)) };
    const beforeD = { ...(await stock(1)) };
    const raid = await post(0, '/combat/raid', { roundId, targetPublicPimpId: 7201, attackingThugs: 40, actionId: randomUUID() });
    expect(raid.statusCode, raid.body).toBe(200);
    const report = raid.json<BattleReportDto>();
    const afterA = await stock(0);
    const afterD = await stock(1);
    for (const key of ['CRACK', 'WEED', 'COCAINE']) {
      expect(afterA[key]! - beforeA[key]!).toBe(beforeD[key]! - afterD[key]!);
    }
    expect(report.crackChange).toBe(afterA.CRACK! - beforeA.CRACK!);
    for (const line of report.productChanges ?? []) expect(line.change).toBe(afterA[line.product]! - beforeA[line.product]!);
    if (report.won) expect(afterA.WEED! + afterA.COCAINE!).toBeGreaterThan(0);

    const stored = await row(1);
    expect(stored.netWorthCents).toBe(calculateNetWorthCents(stored, rules) + productNetWorthCents(afterD, rules));
  });

  it('leaves a 0.4.0-C round without a counter, recipes or product value', async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: classicOgV04C.meta.id, rulesetVersion: classicOgV04C.meta.version } });
    expect((await get(0, '/products')).json<ProductsDto>().economy).toBe(false);
    expect((await post(0, '/products/trade', { product: 'WEED', direction: 'buy', quantity: 1, actionId: randomUUID() })).json().error.code).toBe('PRODUCT_ECONOMY_DISABLED');
    const cooked = await post(0, '/produce-crack', { turns: 2, productType: 'METH', actionId: randomUUID() });
    expect(cooked.statusCode, cooked.body).toBe(200);
    expect(cooked.json<GameActionResult<ProduceCrackResult>>().result.crackProduced).toBeGreaterThan(0);
    await give(0, { WEED: 100 });
    const snapshot = await get(0, '/me');
    const stored = await row(0);
    expect(BigInt(snapshot.json().player.netWorthCents)).toBe(calculateNetWorthCents(stored, classicOgV04C));
  });
});
