import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV04C, classicOgV04D, classicOgV07D, classicOgV07E, classicOgV07F, classicOgV07G, classicOgV07H, classicOgV07J } from '@streets/rulesets';
import { calculateNetWorthCents, productNetWorthCents, startingStock } from '@streets/rules-engine';
import type { BattleReportDto, GameActionResult, HideoutV2Dto, ProduceCrackResult, ProductsDto, ProductTradeResult } from '@streets/shared';
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
    await app.prisma.economyLedgerEntry.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerUnlock.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerActiveFavor.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.combatIntel.deleteMany({ where: { OR: [{ observerId: { in: players } }, { targetId: { in: players } }] } });
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.raidBattle.deleteMany({ where: { attackerId: { in: players } } });
    for (let i = 0; i < players.length; i++) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 50, thugs: i === 0 ? 40 : 20, woundedThugs: 0, pistols: i === 0 ? 40 : 20, beer: 500, condoms: 5_000, crack: 0,
        turns: 144, cashCents: 50_000_000n, heat: 0, cityId,
        createdAt: new Date(Date.now() - 3 * 86_400_000), lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
        raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null, allianceId: null,
        hideoutWeaponPriority: 'POWER',
        hideoutSafeRoomSpecialization: null,
        hideoutLookoutsSpecialization: null,
        hideoutWorkshopSpecialization: null,
        hideoutBackOfficeSpecialization: null };
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

  it('locks in 0.7-G Hideout specializations permanently for the season', async () => {
    await app.prisma.round.update({
      where: { id: roundId },
      data: { rulesetId: classicOgV07G.meta.id, rulesetVersion: classicOgV07G.meta.version },
    });
    await app.prisma.roundPlayer.update({
      where: { id: players[0]! },
      data: {
        hideoutSafeRoomLevel: 3,
        hideoutLookoutsLevel: 3,
        hideoutWorkshopLevel: 5,
        hideoutBackOfficeLevel: 5,
        hideoutGarageLevel: 1,
        hideoutSafeRoomSpecialization: null,
        hideoutLookoutsSpecialization: null,
        hideoutWorkshopSpecialization: null,
        hideoutBackOfficeSpecialization: null,
      },
    });

    const vaultActionId = randomUUID();
    const vault = await post(0, '/hideout/specialization', {
      room: 'SAFE_ROOM',
      specialization: 'VAULT',
      actionId: vaultActionId,
    });
    expect(vault.statusCode, vault.body).toBe(200);
    expect(vault.json().result).toEqual({ room: 'SAFE_ROOM', specialization: 'VAULT', name: 'Vault' });

    // The normal replay guard answers the same intent without trying to choose twice.
    const replay = await post(0, '/hideout/specialization', {
      room: 'SAFE_ROOM',
      specialization: 'VAULT',
      actionId: vaultActionId,
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().result).toEqual(vault.json().result);

    const respec = await post(0, '/hideout/specialization', {
      room: 'SAFE_ROOM',
      specialization: 'PANIC_ROOM',
      actionId: randomUUID(),
    });
    expect(respec.statusCode).toBe(409);
    expect(respec.json().error.code).toBe('HIDEOUT_SPECIALIZATION_PERMANENT');

    for (const [room, specialization] of [
      ['LOOKOUTS', 'STREET_EYES'],
      ['WORKSHOP', 'DRUG_LAB'],
      ['BACK_OFFICE', 'CONNECTIONS'],
    ] as const) {
      const response = await post(0, '/hideout/specialization', {
        room,
        specialization,
        actionId: randomUUID(),
      });
      expect(response.statusCode, response.body).toBe(200);
    }

    const stored = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[0]! } });
    expect(stored).toMatchObject({
      hideoutSafeRoomSpecialization: 'VAULT',
      hideoutLookoutsSpecialization: 'STREET_EYES',
      hideoutWorkshopSpecialization: 'DRUG_LAB',
      hideoutBackOfficeSpecialization: 'CONNECTIONS',
    });

    const hideout = (await get(0, '/hideout')).json<HideoutV2Dto>();
    expect(hideout.rooms.find((room) => room.key === 'SAFE_ROOM')?.specialization?.selectedKey).toBe('VAULT');
    expect(hideout.rooms.find((room) => room.key === 'LOOKOUTS')?.specialization?.selectedKey).toBe('STREET_EYES');
    expect(hideout.rooms.find((room) => room.key === 'WORKSHOP')?.specialization?.selectedKey).toBe('DRUG_LAB');
    expect(hideout.rooms.find((room) => room.key === 'BACK_OFFICE')?.specialization?.selectedKey).toBe('CONNECTIONS');
    expect(hideout.assetProtection?.protectedProductCapacity).toBe(75);
    expect(hideout.security).toMatchObject({
      historyHours: 20,
      specializationHooks: {
        streetEyes: { warningHoursBonus: 12, active: true },
        armedWatch: { defenseBonusPercent: 5, active: false },
      },
    });
    expect(hideout.workshop?.outputBonusPercent).toBe(20);
    expect(hideout.garage?.runLimit).toBe(2);
    expect(hideout.garage?.relocationFeeDiscountPercent).toBe(5);
    expect(hideout.ledger).toMatchObject({
      historyDays: 60,
      specializationHooks: {
        bookkeeping: { historyDaysBonus: 30, active: false },
        connections: { takeBonusPercent: 2, active: true },
      },
    });
  });

  it('persists 0.7-F Armory priority through the Hideout API', async () => {
    await app.prisma.round.update({
      where: { id: roundId },
      data: { rulesetId: classicOgV07F.meta.id, rulesetVersion: classicOgV07F.meta.version },
    });
    await app.prisma.roundPlayer.update({
      where: { id: players[0]! },
      data: {
        hideoutWeaponPriority: 'POWER',
        pistols: 10,
        ak47s: 10,
        woundedThugs: 2,
        medicine: 10,
        hideoutWorkshopLevel: 5,
      },
    });

    const saved = await post(0, '/hideout/armory/priority', {
      priority: 'CONSERVE',
      actionId: randomUUID(),
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().result).toEqual({ priority: 'CONSERVE' });

    const stored = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[0]! } });
    expect(stored.hideoutWeaponPriority).toBe('CONSERVE');

    const hideout = (await get(0, '/hideout')).json<HideoutV2Dto>();
    expect(hideout.armory).toMatchObject({
      priority: 'CONSERVE',
      weapons: { pistols: 10, ak47s: 10, total: 20 },
    });
    expect(hideout.infirmary).toMatchObject({
      woundedThugs: 2,
      medicine: 10,
      medicineEfficiencyPercent: 15,
    });
  });

  it('records 0.7-E store and production economics in the Back Office ledger', async () => {
    await app.prisma.round.update({
      where: { id: roundId },
      data: { rulesetId: classicOgV07E.meta.id, rulesetVersion: classicOgV07E.meta.version },
    });
    await app.prisma.roundPlayer.update({
      where: { id: players[0]! },
      data: { hideoutBackOfficeLevel: 2, hideoutWorkshopLevel: 5, heat: 0, cashCents: 50_000_000n },
    });
    await give(0, { WEED: 20 });

    const sold = await post(0, '/products/trade', {
      product: 'WEED',
      direction: 'sell',
      quantity: 10,
      actionId: randomUUID(),
    });
    expect(sold.statusCode, sold.body).toBe(200);

    const produced = await post(0, '/produce-crack', {
      turns: 10,
      productType: 'METH',
      actionId: randomUUID(),
    });
    expect(produced.statusCode, produced.body).toBe(200);

    const ledgerRows = await app.prisma.economyLedgerEntry.findMany({
      where: { roundPlayerId: players[0]! },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledgerRows.some((row) => row.source === 'STORE_SELL' && row.amountCents > 0n)).toBe(true);
    expect(ledgerRows.some((row) => row.source === 'PRODUCE_CRACK' && row.amountCents < 0n)).toBe(true);

    const hideout = (await get(0, '/hideout')).json<HideoutV2Dto>();
    expect(hideout.ledger).toMatchObject({ backOfficeLevel: 2, historyDays: 7, rowLimit: 35 });
    expect(hideout.ledger!.windows.find((window) => window.days === 1)!.incomeCents).toBeGreaterThan(0);
    expect(hideout.ledger!.windows.find((window) => window.days === 1)!.expenseCents).toBeGreaterThan(0);
    expect(hideout.ledger!.entries.some((entry) => entry.source === 'STORE_SELL')).toBe(true);
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


  it('gates 0.7-H Pip purchases with permanent unlocks without blocking sales', async () => {
    await app.prisma.round.update({
      where: { id: roundId },
      data: { rulesetId: classicOgV07H.meta.id, rulesetVersion: classicOgV07H.meta.version },
    });

    await give(0, { METH: 5 });

    const lockedPage = (await get(0, '/products')).json<ProductsDto>();
    expect(lockedPage.products.find((product) => product.key === 'WEED')!.pip)
      .toMatchObject({ purchaseUnlocked: true });
    expect(lockedPage.products.find((product) => product.key === 'METH')!.pip)
      .toMatchObject({
        purchaseUnlocked: false,
        unlockName: 'Meth Counter Access',
      });

    const lockedBuy = await post(0, '/products/trade', {
      product: 'METH',
      direction: 'buy',
      quantity: 1,
      actionId: randomUUID(),
    });
    expect(lockedBuy.statusCode).toBe(409);
    expect(lockedBuy.json().error.code).toBe('PRODUCT_PURCHASE_LOCKED');

    const sale = await post(0, '/products/trade', {
      product: 'METH',
      direction: 'sell',
      quantity: 1,
      actionId: randomUUID(),
    });
    expect(sale.statusCode, sale.body).toBe(200);

    await app.prisma.playerUnlock.create({
      data: {
        roundPlayerId: players[0]!,
        key: 'PRODUCT_METH_ACCESS',
        sourceQuestKey: 'PIP_BULK_ORDER',
      },
    });

    const openPage = (await get(0, '/products')).json<ProductsDto>();
    expect(openPage.products.find((product) => product.key === 'METH')!.pip)
      .toMatchObject({ purchaseUnlocked: true });

    const bought = await post(0, '/products/trade', {
      product: 'METH',
      direction: 'buy',
      quantity: 1,
      actionId: randomUUID(),
    });
    expect(bought.statusCode, bought.body).toBe(200);
  });

  it("applies Pip's Connection to live product quotes and buys without changing sell prices", async () => {
    await app.prisma.round.update({
      where: { id: roundId },
      data: { rulesetId: classicOgV07J.meta.id, rulesetVersion: classicOgV07J.meta.version },
    });
    await app.prisma.playerActiveFavor.create({
      data: {
        roundPlayerId: players[0]!,
        category: 'UNDERWORLD',
        favorKey: 'PIP_CONNECTION',
        startedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 9 * 60_000),
      },
    });

    const page = (await get(0, '/products')).json<ProductsDto>();
    const weed = page.products.find((product) => product.key === 'WEED')!;
    expect(weed.pip).toMatchObject({
      buyCents: 720,
      sellCents: 240,
      favorDiscountPercent: 10,
    });

    const before = await row(0);
    const bought = await post(0, '/products/trade', {
      product: 'WEED',
      direction: 'buy',
      quantity: 10,
      actionId: randomUUID(),
    });
    expect(bought.statusCode, bought.body).toBe(200);
    expect(bought.json<GameActionResult<ProductTradeResult>>().result).toMatchObject({
      unitCents: 720,
      totalCents: 7_200,
      cashChangeCents: -7_200,
      favorDiscountPercent: 10,
    });
    expect((await row(0)).cashCents).toBe(before.cashCents - 7_200n);

    const sold = await post(0, '/products/trade', {
      product: 'WEED',
      direction: 'sell',
      quantity: 1,
      actionId: randomUUID(),
    });
    expect(sold.statusCode, sold.body).toBe(200);
    expect(sold.json<GameActionResult<ProductTradeResult>>().result).toMatchObject({
      unitCents: 240,
      totalCents: 240,
    });
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
