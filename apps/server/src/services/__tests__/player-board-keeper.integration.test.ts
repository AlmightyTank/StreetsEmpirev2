import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { classicOgV26JBoard, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { PlayerBoardService, type BoardRound } from '../player-board.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';

/**
 * The Board G, live: guns, low-riders and ammo. A locked buyer can read a gun's row but not buy
 * it, a buyer takes at most one keeper delivery a day, the keepers' shelves never change, only
 * clean items can be listed, item rows move with the columns, and neither rank rises.
 * Opt in with PLAYER_BOARD_INTEGRATION=1.
 */
describe.runIf(process.env.PLAYER_BOARD_INTEGRATION === '1')('The Board keeper goods with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const rules: Ruleset = classicOgV26JBoard;
  const accounts: string[] = [];
  let round: BoardRound;
  const ids = { seller: '', buyer: '' };

  const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code);
  const post = (itemKey: string, quantity: number, unitPriceCents: number) =>
    PlayerBoardService.post(prisma, round, rules, ids.seller, { itemKey, quantity, unitPriceCents, durationHours: 48 });
  const fill = (offerId: string, quantity?: number, now = new Date()) => PlayerBoardService.fill(prisma, round, rules, ids.buyer, offerId, undefined, now, quantity);
  const guns = (id: string, model: string) => prisma.playerGun.findMany({ where: { roundPlayerId: id, model }, orderBy: { createdAt: 'asc' } });
  const row = (id: string) => prisma.roundPlayer.findUniqueOrThrow({ where: { id }, select: {
    pistols: true, ak47s: true, lowRiders: true, ammo: true, playerBoardEscrow: true, netWorthCents: true,
    pistolStock: true, ak47Stock: true, lowRiderStock: true, ammoStock: true,
  } });
  const worth = async (id: string) => { await PlayerStateService.settle(prisma, id); return (await row(id)).netWorthCents; };

  beforeAll(async () => {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    round = await prisma.round.create({ data: {
      name: 'Board keeper fixture', slug: `board-keeper-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
    } });
    for (const [index, key] of (['seller', 'buyer'] as const).entries()) {
      const name = `keeper_${randomUUID().slice(0, 6)}`;
      const account = await prisma.account.create({ data: { username: name, usernameNormalized: name, email: `${name}@example.invalid`, passwordHash: 'integration-fixture' } });
      accounts.push(account.id);
      ids[key] = (await prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId: account.id, cityId: city.id, displayName: name, publicPimpId: 8100 + index,
        reputation: { create: ReputationService.seedFor(rules) } } })).id;
    }
  });

  afterAll(async () => {
    if (round?.id) await prisma.round.delete({ where: { id: round.id } });
    await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.playerBoardOffer.deleteMany({ where: { roundId: round.id } });
    for (const id of Object.values(ids)) {
      await prisma.playerGun.deleteMany({ where: { roundPlayerId: id } });
      await prisma.playerVehicle.deleteMany({ where: { roundPlayerId: id } });
      await prisma.roundPlayer.update({ where: { id }, data: {
        cashCents: 5_000_001n, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0, lowRiders: 0, ammo: 0, playerBoardEscrow: {},
        shotgunUnlocked: false, tek9Unlocked: false, ak47Unlocked: false,
      } });
    }
    // The seller's armory: 4 clean AKs, one battered AK, 20 clean pistols, 2 clean low-riders and a hot one, and 5,000 rounds.
    await prisma.roundPlayer.update({ where: { id: ids.seller }, data: { ak47s: 5, pistols: 20, lowRiders: 3, ammo: 5_000, ak47Unlocked: true } });
    await prisma.playerGun.createMany({ data: [
      { roundPlayerId: ids.seller, model: 'AK47', quantity: 4, origin: { kind: 'PURCHASED' } },
      { roundPlayerId: ids.seller, model: 'AK47', quantity: 1, condition: 40, origin: { kind: 'PURCHASED' } },
      { roundPlayerId: ids.seller, model: 'PISTOL', quantity: 20, origin: { kind: 'PURCHASED' } },
    ] });
    await prisma.playerVehicle.createMany({ data: [
      { roundPlayerId: ids.seller, model: 'LOW_RIDER', quantity: 2, origin: { kind: 'PURCHASED' } },
      { roundPlayerId: ids.seller, model: 'LOW_RIDER', quantity: 1, origin: { kind: 'STOLEN', hotUntil: new Date(Date.now() + 86_400_000).toISOString() } },
    ] });
  });

  it('lists only clean, ready items and moves the item rows with the column', async () => {
    expect(await code(post('AK47', 5, 330_000))).toBe('NOT_ENOUGH_TO_LIST'); // one is battered
    expect(await code(post('LOW_RIDER', 3, 420_000))).toBe('NOT_ENOUGH_TO_LIST'); // one is hot
    const { offer } = await post('AK47', 4, 330_000);
    expect((await row(ids.seller)).ak47s).toBe(1);
    expect((await row(ids.seller)).playerBoardEscrow).toEqual({ AK47: 4 });
    expect((await guns(ids.seller, 'AK47')).map((gun) => [gun.quantity, gun.condition])).toEqual([[1, 40]]);
    await PlayerBoardService.cancel(prisma, round, ids.seller, offer.id);
    expect((await row(ids.seller)).ak47s).toBe(5);
    expect((await guns(ids.seller, 'AK47')).reduce((sum, gun) => sum + gun.quantity, 0)).toBe(5);
  });

  it('shows a locked buyer the row and refuses the sale until they unlock it', async () => {
    const { offer } = await post('AK47', 2, 330_000);
    const book = await PlayerBoardService.book(prisma, round, rules, ids.buyer, 'KEEPER');
    expect(book.rows.find((r) => r.id === offer.id)).toMatchObject({ category: 'KEEPER', name: 'AK-47', locked: true, dailyLeft: 2 });
    expect(await code(fill(offer.id, 1))).toBe('WEAPON_LOCKED');
    await prisma.roundPlayer.update({ where: { id: ids.buyer }, data: { ak47Unlocked: true } });
    expect(await code(fill(offer.id, 1))).toBe('OK');
    const unlocked = await PlayerBoardService.book(prisma, round, rules, ids.buyer, 'KEEPER');
    expect(unlocked.rows.find((r) => r.id === offer.id)).toMatchObject({ locked: false, dailyLeft: 1 });
  });

  it('caps a buyer at one keeper delivery a day and leaves the shelves alone', async () => {
    await prisma.roundPlayer.update({ where: { id: ids.buyer }, data: { ak47Unlocked: true } });
    const shelves = await row(ids.buyer);
    const { offer } = await post('AK47', 4, 330_000);
    await fill(offer.id, 2);
    expect(await code(fill(offer.id, 1))).toBe('BOARD_DAILY_LIMIT');
    const after = await row(ids.buyer);
    expect([after.ak47Stock, after.pistolStock, after.lowRiderStock, after.ammoStock]).toEqual([shelves.ak47Stock, shelves.pistolStock, shelves.lowRiderStock, shelves.ammoStock]);
    // A day later the allowance is back.
    await prisma.playerBoardFill.updateMany({ where: { buyerId: ids.buyer }, data: { createdAt: new Date(Date.now() - 86_400_001) } });
    expect(await code(fill(offer.id, 2))).toBe('OK');
    expect((await row(ids.buyer)).ak47s).toBe(4);
  });

  it('gives the buyer a fresh Board stack and keeps every unit between the two players and escrow', async () => {
    const total = async () => {
      const [seller, buyer] = [await row(ids.seller), await row(ids.buyer)];
      return seller.pistols + buyer.pistols + ((seller.playerBoardEscrow as Record<string, number>).PISTOL ?? 0);
    };
    const before = await total();
    const { offer } = await post('PISTOL', 20, 4_800);
    await fill(offer.id, 15);
    expect(await total()).toBe(before);
    const bought = await guns(ids.buyer, 'PISTOL');
    expect(bought.map((gun) => [gun.quantity, gun.condition, gun.origin])).toEqual([[15, 100, { kind: 'BOARD' }]]);
    expect((await prisma.playerArmorySummary.findUniqueOrThrow({ where: { roundPlayerId: ids.buyer } })).pistolCount).toBe(15);
    expect(await code(fill(offer.id, 36))).toBe('NOT_ENOUGH_LEFT');
  });

  it('trades low-riders and ammo', async () => {
    const car = await post('LOW_RIDER', 2, 420_000);
    await fill(car.offer.id, 1);
    expect((await row(ids.buyer)).lowRiders).toBe(1);
    expect(await prisma.playerVehicle.count({ where: { roundPlayerId: ids.buyer, model: 'LOW_RIDER' } })).toBe(1);
    const rounds = await post('AMMO', 1_000, 8);
    await fill(rounds.offer.id, 500);
    expect((await row(ids.buyer)).ammo).toBe(500);
    expect((await row(ids.seller)).ammo).toBe(4_000);
  });

  it('will not let a seller ask for a gun they have not unlocked', async () => {
    await prisma.roundPlayer.update({ where: { id: ids.seller }, data: { ak47Unlocked: false } });
    const asked = PlayerBoardService.post(prisma, round, rules, ids.seller, { itemKey: 'PISTOL', quantity: 20, priceKind: 'BARTER', lotSize: 20, askItems: [{ key: 'AK47', quantity: 1 }], durationHours: 12 });
    expect(await code(asked)).toBe('WEAPON_LOCKED');
  });

  it('raises neither rank on a gun sale', async () => {
    await prisma.roundPlayer.update({ where: { id: ids.buyer }, data: { ak47Unlocked: true } });
    for (const price of [326_667, 355_072, 250_000, 500_000]) {
      await prisma.playerBoardFill.deleteMany({ where: { buyerId: ids.buyer } });
      const sellerBefore = await worth(ids.seller);
      const { offer } = await post('AK47', 1, price);
      const buyerBefore = await worth(ids.buyer);
      await fill(offer.id, 1);
      expect(await worth(ids.seller), `seller @${price}`).toBeLessThanOrEqual(sellerBefore);
      expect(await worth(ids.buyer), `buyer @${price}`).toBeLessThanOrEqual(buyerBefore);
      // Give the seller back a clean AK for the next round of the loop.
      await prisma.roundPlayer.update({ where: { id: ids.seller }, data: { ak47s: { increment: 1 } } });
      await prisma.playerGun.create({ data: { roundPlayerId: ids.seller, model: 'AK47', quantity: 1, origin: { kind: 'PURCHASED' } } });
    }
  });
});
