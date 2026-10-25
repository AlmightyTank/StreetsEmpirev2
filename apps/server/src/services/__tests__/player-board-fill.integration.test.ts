import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { classicOgV26J, classicOgV26JBoard, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { PlayerBoardService, type BoardRound } from '../player-board.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { StashService } from '../stash.service.js';

/**
 * The Board E, live, on a round pinned to the opt-in ruleset: a fill moves the whole stack, the
 * buyer pays the sticker, the seller keeps 92% rounded down and the rest leaves the round. The
 * same action cannot fill twice, two buyers cannot share an offer, a sold offer cannot be
 * cancelled, items are conserved and neither side's rank rises.
 * Opt in with PLAYER_BOARD_INTEGRATION=1.
 */
describe.runIf(process.env.PLAYER_BOARD_INTEGRATION === '1')('The Board fills with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const rules: Ruleset = classicOgV26JBoard;
  const accounts: string[] = [];
  const rounds: string[] = [];
  let round: BoardRound;
  const ids = { seller: '', buyer: '', rival: '' };

  async function makeRound(ruleset: Ruleset): Promise<BoardRound> {
    const created = await prisma.round.create({ data: {
      name: 'Board fill fixture', slug: `board-fill-${randomUUID()}`,
      rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
    } });
    rounds.push(created.id);
    return created;
  }

  async function makePlayer(roundId: string, index: number): Promise<string> {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const name = `fill_${randomUUID().slice(0, 6)}`;
    const account = await prisma.account.create({ data: { username: name, usernameNormalized: name, email: `${name}@example.invalid`, passwordHash: 'integration-fixture' } });
    accounts.push(account.id);
    return (await prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId: account.id, cityId: city.id, displayName: name, publicPimpId: 7800 + index,
      reputation: { create: ReputationService.seedFor(rules) } } })).id;
  }

  const row = (id: string) => prisma.roundPlayer.findUniqueOrThrow({ where: { id }, select: { cashCents: true, scavengedComponents: true, playerBoardEscrow: true, netWorthCents: true } });
  const worth = async (id: string) => { await PlayerStateService.settle(prisma, id); return (await row(id)).netWorthCents; };
  const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code);
  const post = (unitPriceCents = 550, quantity = 10, itemKey = 'SCRAP_METAL', durationHours = 12, now = new Date()) =>
    PlayerBoardService.post(prisma, round, rules, ids.seller, { itemKey, quantity, unitPriceCents, durationHours }, now);
  const fill = (offerId: string, buyer = ids.buyer, actionId?: string, now = new Date()) =>
    PlayerBoardService.fill(prisma, round, rules, buyer, offerId, actionId, now);
  const units = async (key: string) => {
    let total = 0;
    for (const id of Object.values(ids)) {
      const player = await row(id);
      total += ((player.scavengedComponents as Record<string, number>)[key] ?? 0) + ((player.playerBoardEscrow as Record<string, number>)[key] ?? 0);
    }
    return total;
  };

  beforeAll(async () => {
    round = await makeRound(rules);
    ids.seller = await makePlayer(round.id, 1);
    ids.buyer = await makePlayer(round.id, 2);
    ids.rival = await makePlayer(round.id, 3);
  });

  afterAll(async () => {
    for (const id of rounds) await prisma.round.delete({ where: { id } });
    await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await prisma.playerBoardOffer.deleteMany({ where: { roundId: round.id } });
    await prisma.economyLedgerEntry.deleteMany({ where: { roundPlayerId: { in: Object.values(ids) } } });
    for (const id of Object.values(ids)) {
      await prisma.roundPlayer.update({ where: { id }, data: { cashCents: 100_001n, playerBoardEscrow: {}, scavengedComponents: { SCRAP_METAL: 50, RADIO: 3 } } });
    }
  });

  it('ships switched on, and leaves the default ruleset off', () => {
    expect(rules.playerBoard?.enabled).toBe(true);
    expect(classicOgV26J.playerBoard.enabled).toBe(false);
  });

  it('will not fill on a round that keeps the Board off', async () => {
    const dark = await makeRound(classicOgV26J);
    expect(await code(PlayerBoardService.fill(prisma, dark, classicOgV26J, ids.buyer, 'any'))).toBe('BOARD_CLOSED');
  });

  it('moves the whole stack, charges the sticker, pays the seller 92% rounded down and deletes the rest', async () => {
    const { offer } = await post(579, 7); // $40.53; the seller keeps $37.28, $3.25 leaves the round
    const sellerBefore = await row(ids.seller);
    const result = await fill(offer.id);
    expect(result).toMatchObject({ offerId: offer.id, itemKey: 'SCRAP_METAL', quantity: 7, unitPriceCents: 579, paidCents: 4_053 });

    const buyer = await row(ids.buyer);
    const seller = await row(ids.seller);
    expect(buyer.cashCents).toBe(100_001n - 4_053n);
    expect(buyer.scavengedComponents).toEqual({ SCRAP_METAL: 57, RADIO: 3 });
    expect(seller.cashCents - sellerBefore.cashCents).toBe(3_728n);
    expect(seller.playerBoardEscrow).toEqual({});
    expect((100_001n - buyer.cashCents) - (seller.cashCents - sellerBefore.cashCents)).toBe(325n);

    const stored = await prisma.playerBoardOffer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(stored).toMatchObject({ status: 'SOLD', buyerId: ids.buyer, proceedsCents: 3_728 });
    const ledger = await prisma.economyLedgerEntry.findMany({ where: { source: { in: ['PLAYER_BOARD_BUY', 'PLAYER_BOARD_SALE'] }, roundPlayerId: { in: [ids.buyer, ids.seller] } } });
    expect(ledger.map((entry) => [entry.roundPlayerId, entry.source, entry.amountCents]).sort()).toEqual([
      [ids.buyer, 'PLAYER_BOARD_BUY', -4_053n],
      [ids.seller, 'PLAYER_BOARD_SALE', 3_728n],
    ].sort());
  });

  it('does not let the same action fill twice, and a retry returns the first receipt', async () => {
    const { offer } = await post();
    const actionId = randomUUID();
    const first = await fill(offer.id, ids.buyer, actionId);
    const again = await fill(offer.id, ids.buyer, actionId);
    expect(again).toEqual(first);
    expect((await row(ids.buyer)).cashCents).toBe(100_001n - 5_500n);
    expect(await code(fill(offer.id, ids.buyer, randomUUID()))).toBe('OFFER_NOT_OPEN');
  });

  it('lets exactly one of two racing buyers have an offer', async () => {
    const { offer } = await post(550, 20);
    const before = await units('SCRAP_METAL');
    const results = await Promise.all([fill(offer.id, ids.buyer), fill(offer.id, ids.rival)].map(code));
    expect(results.sort()).toEqual(['OFFER_NOT_OPEN', 'OK']);
    expect(await units('SCRAP_METAL')).toBe(before);
    const cash = (await row(ids.buyer)).cashCents + (await row(ids.rival)).cashCents;
    expect(cash).toBe(2n * 100_001n - 11_000n);
  });

  it('cannot cancel a sold offer, or buy your own', async () => {
    const { offer } = await post();
    expect(await code(fill(offer.id, ids.seller))).toBe('CANNOT_BUY_OWN');
    await fill(offer.id);
    expect(await code(PlayerBoardService.cancel(prisma, round, ids.seller, offer.id))).toBe('OFFER_NOT_OPEN');
    expect((await row(ids.seller)).scavengedComponents).toEqual({ SCRAP_METAL: 40, RADIO: 3 });
  });

  it('cannot buy an expired offer, and the stack goes home instead', async () => {
    const t0 = new Date();
    const { offer } = await post(550, 10, 'SCRAP_METAL', 12, t0);
    expect(await code(fill(offer.id, ids.buyer, undefined, new Date(t0.getTime() + 12 * 3_600_000)))).toBe('OFFER_NOT_OPEN');
    expect((await row(ids.seller)).scavengedComponents).toEqual({ SCRAP_METAL: 50, RADIO: 3 });
    expect((await row(ids.buyer)).cashCents).toBe(100_001n);
  });

  it('refuses a buyer who cannot pay or has no stash room, and changes nothing', async () => {
    const { offer } = await post(3_400, 2, 'RADIO');
    await prisma.roundPlayer.update({ where: { id: ids.buyer }, data: { cashCents: 6_799n } });
    expect(await code(fill(offer.id))).toBe('NOT_ENOUGH_CASH');

    await prisma.roundPlayer.update({ where: { id: ids.buyer }, data: { cashCents: 100_001n, scavengedComponents: { SCRAP_METAL: 50 } } });
    const realPage = StashService.page.bind(StashService);
    vi.spyOn(StashService, 'page').mockImplementation(async (db, id) => ({ ...(await realPage(db, id)), columns: 1, rows: 1, totalCells: 1, usedCells: 1, items: [{ key: 'SCRAP_METAL', quantity: 50, x: 0, y: 0, width: 1, height: 1 }] }));
    expect(await code(fill(offer.id))).toBe('STASH_FULL');
    vi.restoreAllMocks();

    expect((await prisma.playerBoardOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe('OPEN');
    expect(await row(ids.buyer)).toMatchObject({ cashCents: 100_001n, scavengedComponents: { SCRAP_METAL: 50 } });
    expect(await code(fill(offer.id))).toBe('OK');
  });

  it('raises neither rank at the floor, the cap, or anywhere between', async () => {
    for (const price of [534, 556, 579]) {
      await prisma.roundPlayer.update({ where: { id: ids.seller }, data: { scavengedComponents: { SCRAP_METAL: 50 }, playerBoardEscrow: {} } });
      const { offer } = await post(price, 50);
      const sellerBefore = await worth(ids.seller);
      const buyerBefore = await worth(ids.buyer);
      await fill(offer.id);
      expect(await worth(ids.seller), `seller at ${price}`).toBeLessThanOrEqual(sellerBefore);
      expect(await worth(ids.buyer), `buyer at ${price}`).toBeLessThanOrEqual(buyerBefore);
    }
  });

  describe('drugs', () => {
    const stock = async (id: string) => ProductInventoryService.read(prisma, id, rules);
    const drugs = async (key: string) => {
      let total = 0;
      for (const id of Object.values(ids)) total += (await stock(id))[key]! + (((await row(id)).playerBoardEscrow as Record<string, number>)[key] ?? 0);
      return total;
    };
    const give = async (id: string, crack: number, weed: number) => {
      await prisma.roundPlayer.update({ where: { id }, data: { crack } });
      await prisma.playerProduct.upsert({ where: { roundPlayerId_productKey: { roundPlayerId: id, productKey: 'WEED' } }, create: { roundPlayerId: id, productKey: 'WEED', quantity: weed }, update: { quantity: weed } });
    };

    beforeEach(async () => {
      for (const id of Object.values(ids)) await give(id, 200, 100);
    });

    it('escrows crack from the column and weed from inventory, and cancel puts them back', async () => {
      const crack = await post(400, 50, 'CRACK');
      const weed = await post(347, 40, 'WEED');
      expect((await stock(ids.seller))).toMatchObject({ CRACK: 150, WEED: 60 });
      expect((await row(ids.seller)).playerBoardEscrow).toEqual({ CRACK: 50, WEED: 40 });
      await PlayerBoardService.cancel(prisma, round, ids.seller, crack.offer.id);
      await PlayerBoardService.cancel(prisma, round, ids.seller, weed.offer.id);
      expect((await stock(ids.seller))).toMatchObject({ CRACK: 200, WEED: 100 });
      expect((await row(ids.seller)).playerBoardEscrow).toEqual({});
    });

    it('fills a drug into the buyer\'s inventory with no stash check, and refuses one over the cap', async () => {
      expect(await code(post(435, 10, 'CRACK'))).toBe('PRICE_OUTSIDE_BAND');
      expect(await code(post(400, 201, 'CRACK'))).toBe('NOT_ENOUGH_TO_LIST');
      const { offer } = await post(434, 100, 'CRACK');
      const before = await drugs('CRACK');
      vi.spyOn((await import('../stash.service.js')).StashService, 'page').mockRejectedValue(new Error('drugs never touch the stash'));
      const result = await fill(offer.id);
      vi.restoreAllMocks();
      expect(result).toMatchObject({ itemKey: 'CRACK', name: 'Crack', quantity: 100, paidCents: 43_400 });
      expect((await stock(ids.buyer)).CRACK).toBe(300);
      expect((await row(ids.buyer)).cashCents).toBe(100_001n - 43_400n);
      expect((await row(ids.seller)).cashCents).toBe(100_001n - 300n + 39_928n);
      expect(await drugs('CRACK')).toBe(before);
    });

    it('shows drugs under the Drugs filter, ahead of parts under All', async () => {
      await post(550, 5, 'SCRAP_METAL');
      await post(320, 10, 'WEED');
      await post(400, 10, 'CRACK');
      const all = await PlayerBoardService.book(prisma, round, rules, ids.buyer, 'ALL');
      expect(all.rows.map((r) => [r.itemKey, r.category])).toEqual([['CRACK', 'PRODUCT'], ['WEED', 'PRODUCT'], ['SCRAP_METAL', 'PART']]);
      expect((await PlayerBoardService.book(prisma, round, rules, ids.buyer, 'PRODUCTS')).rows.map((r) => r.itemKey)).toEqual(['CRACK', 'WEED']);
      expect((await PlayerBoardService.book(prisma, round, rules, ids.buyer, 'PARTS')).rows.map((r) => r.itemKey)).toEqual(['SCRAP_METAL']);
      const listable = all.listable.filter((r) => r.category === 'PRODUCT').map((r) => [r.key, r.held, r.floorCents, r.capCents]);
      expect(listable).toEqual([['CRACK', 200, 400, 434], ['WEED', 100, 320, 347]]);
    });

    it('hands an expired drug stack home', async () => {
      const t0 = new Date();
      await post(320, 30, 'WEED', 12, t0);
      await PlayerBoardService.expireDue(prisma, round, new Date(t0.getTime() + 12 * 3_600_000));
      expect((await stock(ids.seller)).WEED).toBe(100);
      expect((await row(ids.seller)).playerBoardEscrow).toEqual({});
    });

    it('raises neither rank on a drug fill at the floor or the cap', async () => {
      for (const [key, price] of [['CRACK', 400], ['CRACK', 434], ['WEED', 320], ['WEED', 347]] as const) {
        const { offer } = await post(price, 20, key);
        const sellerBefore = await worth(ids.seller);
        const buyerBefore = await worth(ids.buyer);
        await fill(offer.id);
        expect(await worth(ids.seller), `seller ${key} @${price}`).toBeLessThanOrEqual(sellerBefore);
        expect(await worth(ids.buyer), `buyer ${key} @${price}`).toBeLessThanOrEqual(buyerBefore);
      }
    });
  });

  it('keeps every part between the two players and escrow across posts, fills and cancels', async () => {
    const before = await units('SCRAP_METAL');
    const a = await post(550, 5);
    const b = await post(560, 8);
    const c = await post(570, 9);
    await fill(a.offer.id);
    await fill(b.offer.id, ids.rival);
    await PlayerBoardService.cancel(prisma, round, ids.seller, c.offer.id);
    expect(await units('SCRAP_METAL')).toBe(before);
  });
});
