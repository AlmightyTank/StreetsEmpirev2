import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { classicOgV26J } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { PlayerBoardService, type BoardRound } from '../player-board.service.js';
import { ReputationService } from '../reputation.service.js';
import { StashService } from '../stash.service.js';

/**
 * The Board C, live: posting escrows parts and keeps the fee, cancel and expiry give the stack
 * back, a paused round does not eat a listing, and every refusal leaves the player untouched.
 * Opt in with PLAYER_BOARD_INTEGRATION=1.
 */
describe.runIf(process.env.PLAYER_BOARD_INTEGRATION === '1')('The Board escrow with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const closed = classicOgV26J;
  const rules = { ...closed, playerBoard: { ...closed.playerBoard, enabled: true } };
  const t0 = new Date('2030-01-01T12:00:00Z');
  const HOUR = 3_600_000;
  let round: BoardRound;
  let accountId = '';
  let playerId = '';

  const player = () => prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, select: { cashCents: true, scavengedComponents: true } });
  const parts = async () => (await player()).scavengedComponents as Record<string, number>;
  const escrowed = async (key: string) => (await prisma.playerBoardOffer.aggregate({
    where: { sellerId: playerId, itemKey: key, OR: [{ status: 'OPEN' }, { status: 'EXPIRED', returnedAt: null }] },
    _sum: { quantity: true },
  }))._sum.quantity ?? 0;
  const post = (input: Partial<{ itemKey: string; quantity: number; unitPriceCents: number; durationHours: number }> = {}, now = t0, ruleset = rules) =>
    PlayerBoardService.post(prisma, round, ruleset, playerId, { itemKey: 'SCRAP_METAL', quantity: 10, unitPriceCents: 550, durationHours: 12, ...input }, now);
  const code = async (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code);

  beforeAll(async () => {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const created = await prisma.round.create({ data: {
      name: 'Board escrow fixture', slug: `board-${randomUUID()}`,
      rulesetId: closed.meta.id, rulesetVersion: closed.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
    } });
    round = created;
    const name = `board_${randomUUID().slice(0, 6)}`;
    const account = await prisma.account.create({ data: { username: name, usernameNormalized: name, email: `${name}@example.invalid`, passwordHash: 'integration-fixture' } });
    accountId = account.id;
    playerId = (await prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId: round.id, accountId, cityId: city.id, displayName: name, publicPimpId: 7400,
      reputation: { create: ReputationService.seedFor(rules) } } })).id;
  });

  afterAll(async () => {
    if (round?.id) await prisma.round.delete({ where: { id: round.id } });
    if (accountId) await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    round = { ...round, pausedAt: null, pauseReason: null, pausedMinutesTotal: 0 };
    await prisma.playerBoardOffer.deleteMany({ where: { sellerId: playerId } });
    await prisma.economyLedgerEntry.deleteMany({ where: { roundPlayerId: playerId } });
    await prisma.roundPlayer.update({ where: { id: playerId }, data: {
      cashCents: 100_000n,
      scavengedComponents: { SCRAP_METAL: 50, RADIO: 3, SPECIALIST_CIRCUITRY: 1 },
    } });
  });

  it('stays shut while the ruleset keeps the Board off', async () => {
    expect(await code(post({}, t0, closed))).toBe('BOARD_CLOSED');
    expect(await parts()).toEqual({ SCRAP_METAL: 50, RADIO: 3, SPECIALIST_CIRCUITRY: 1 });
  });

  it('escrows the stack and keeps a 1% fee, never under $1', async () => {
    const small = await post();
    expect(small.feeCents).toBe(100); // 1% of $40 is 40c
    expect(small.offer).toMatchObject({ itemKey: 'SCRAP_METAL', quantity: 10, unitPriceCents: 550, status: 'OPEN', returned: true });
    expect(small.offer.expiresAt).toBe(new Date(t0.getTime() + 12 * HOUR).toISOString());

    const big = await post({ itemKey: 'SPECIALIST_CIRCUITRY', quantity: 1, unitPriceCents: 340_000, durationHours: 48 });
    expect(big.feeCents).toBe(2_500); // 1% of $2,500

    expect(await player()).toEqual({ cashCents: 100_000n - 100n - 2_500n, scavengedComponents: { SCRAP_METAL: 40, RADIO: 3 } });
    const ledger = await prisma.economyLedgerEntry.findMany({ where: { roundPlayerId: playerId }, orderBy: { createdAt: 'asc' } });
    expect(ledger.map((row) => [row.source, row.amountCents])).toEqual([['PLAYER_BOARD_FEE', -100n], ['PLAYER_BOARD_FEE', -2_500n]]);
  });

  it('refuses more than you hold, a key outside the catalog, a price outside the band, and an odd length', async () => {
    expect(await code(post({ quantity: 51 }))).toBe('NOT_ENOUGH_TO_LIST');
    expect(await code(post({ itemKey: 'FUEL_CAN', quantity: 1, unitPriceCents: 3_400 }))).toBe('NOT_ENOUGH_TO_LIST');
    for (const itemKey of ['AMMO_BOX', 'PISTOL', 'CRACK', 'toString', 'scrap_metal']) {
      expect(await code(post({ itemKey })), itemKey).toBe('NOT_LISTABLE');
    }
    expect(await code(post({ unitPriceCents: 533 }))).toBe('PRICE_OUTSIDE_BAND');
    expect(await code(post({ unitPriceCents: 580 }))).toBe('PRICE_OUTSIDE_BAND');
    expect(await code(post({ durationHours: 24 }))).toBe('INVALID_DURATION');
    expect(await code(post({ quantity: 0 }))).toBe('INVALID_QUANTITY');
    await prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 99n } });
    expect(await code(post())).toBe('NOT_ENOUGH_CASH');
    expect(await player()).toEqual({ cashCents: 99n, scavengedComponents: { SCRAP_METAL: 50, RADIO: 3, SPECIALIST_CIRCUITRY: 1 } });
    expect(await prisma.playerBoardOffer.count({ where: { sellerId: playerId } })).toBe(0);
  });

  it('caps a player at six open offers, and a closed one frees a slot', async () => {
    const offers = [];
    for (let i = 0; i < 6; i += 1) offers.push(await post({ quantity: 1 }));
    expect(await code(post({ quantity: 1 }))).toBe('TOO_MANY_OFFERS');
    expect((await parts()).SCRAP_METAL).toBe(44);
    await PlayerBoardService.cancel(prisma, round, playerId, offers[0]!.offer.id, t0);
    expect(await code(post({ quantity: 1 }))).toBe('OK');
  });

  it('returns the stack on cancel, keeps the fee, and a second cancel returns and charges nothing', async () => {
    const { offer } = await post({ quantity: 50 });
    expect((await parts()).SCRAP_METAL).toBeUndefined();
    const cancelled = await PlayerBoardService.cancel(prisma, round, playerId, offer.id, new Date(t0.getTime() + HOUR));
    expect(cancelled).toMatchObject({ feeCents: 0, returnedQuantity: 50, offer: { status: 'CANCELLED', returned: true } });
    const after = await player();
    expect(after).toEqual({ cashCents: 100_000n - 200n, scavengedComponents: { SCRAP_METAL: 50, RADIO: 3, SPECIALIST_CIRCUITRY: 1 } });

    expect(await code(PlayerBoardService.cancel(prisma, round, playerId, offer.id, new Date(t0.getTime() + 2 * HOUR)))).toBe('OFFER_NOT_OPEN');
    expect(await player()).toEqual(after);
  });

  it('lets only one of two racing cancels through', async () => {
    const { offer } = await post({ quantity: 20 });
    const results = await Promise.all([1, 2].map(() => code(PlayerBoardService.cancel(prisma, round, playerId, offer.id, t0))));
    expect(results.sort()).toEqual(['OFFER_NOT_OPEN', 'OK']);
    expect((await parts()).SCRAP_METAL).toBe(50);
  });

  it('will not cancel someone else\'s offer', async () => {
    const { offer } = await post();
    const stranger = await prisma.roundPlayer.findFirst({ where: { roundId: { not: round.id } }, select: { id: true } });
    if (stranger) expect(await code(PlayerBoardService.cancel(prisma, round, stranger.id, offer.id, t0))).toBe('OFFER_NOT_FOUND');
    expect(await code(PlayerBoardService.cancel(prisma, round, playerId, 'missing', t0))).toBe('OFFER_NOT_FOUND');
  });

  it('expires on the clock, returns the stack, keeps the fee, and cannot then be cancelled', async () => {
    const { offer } = await post({ quantity: 30 });
    const justBefore = new Date(t0.getTime() + 12 * HOUR - 1);
    expect((await PlayerBoardService.mine(prisma, round, playerId, justBefore))[0]!.status).toBe('OPEN');
    const at = new Date(t0.getTime() + 12 * HOUR);
    expect(await PlayerBoardService.expireDue(prisma, round, at)).toBe(1);
    expect((await PlayerBoardService.mine(prisma, round, playerId, at))[0]).toMatchObject({ id: offer.id, status: 'EXPIRED', returned: true });
    expect(await player()).toEqual({ cashCents: 100_000n - 120n, scavengedComponents: { SCRAP_METAL: 50, RADIO: 3, SPECIALIST_CIRCUITRY: 1 } }); // 1% of $120
    expect(await code(PlayerBoardService.cancel(prisma, round, playerId, offer.id, at))).toBe('OFFER_NOT_OPEN');
    expect(await PlayerBoardService.expireDue(prisma, round, at)).toBe(0);
  });

  it('does not let a pause eat a listing', async () => {
    const { offer } = await post({ quantity: 5 });
    // Paused two hours before the 12-hour mark and still paused well after it.
    round = { ...round, pausedAt: new Date(t0.getTime() + 10 * HOUR), pauseReason: 'maintenance' };
    const duringPause = new Date(t0.getTime() + 20 * HOUR);
    expect(await PlayerBoardService.expireDue(prisma, round, duringPause)).toBe(0);
    expect(await code(post({ quantity: 1 }, duringPause))).toBe('ROUND_PAUSED');
    expect(await code(PlayerBoardService.cancel(prisma, round, playerId, offer.id, duringPause))).toBe('ROUND_PAUSED');

    // Resumed after a 10-hour pause: the listing has the two hours it had left.
    round = { ...round, pausedAt: null, pauseReason: null, pausedMinutesTotal: 600 };
    const mine = await PlayerBoardService.mine(prisma, round, playerId, new Date(t0.getTime() + 21 * HOUR));
    expect(mine[0]).toMatchObject({ status: 'OPEN', expiresAt: new Date(t0.getTime() + 22 * HOUR).toISOString() });
    expect(await PlayerBoardService.expireDue(prisma, round, new Date(t0.getTime() + 22 * HOUR - 1))).toBe(0);
    expect(await PlayerBoardService.expireDue(prisma, round, new Date(t0.getTime() + 22 * HOUR))).toBe(1);
    expect((await parts()).SCRAP_METAL).toBe(50);
  });

  it('holds an expired stack that has no stash cell, then returns it once one is free', async () => {
    const { offer } = await post({ quantity: 50 });
    const realPage = StashService.page.bind(StashService);
    const full = vi.spyOn(StashService, 'page').mockImplementation(async (db, id) => {
      const stash = await realPage(db, id);
      return { ...stash, columns: 1, rows: 1, totalCells: 1, usedCells: 1, items: [{ key: 'RADIO', quantity: 3, x: 0, y: 0, width: 1, height: 1 }] };
    });
    expect(await code(PlayerBoardService.cancel(prisma, round, playerId, offer.id, t0))).toBe('STASH_FULL');

    const at = new Date(t0.getTime() + 12 * HOUR);
    await PlayerBoardService.expireDue(prisma, round, at);
    expect((await PlayerBoardService.mine(prisma, round, playerId, at))[0]).toMatchObject({ status: 'EXPIRED', returned: false });
    expect((await parts()).SCRAP_METAL).toBeUndefined();
    expect(await escrowed('SCRAP_METAL')).toBe(50);

    full.mockRestore();
    expect(await PlayerBoardService.expireDue(prisma, round, at)).toBe(1);
    expect((await parts()).SCRAP_METAL).toBe(50);
    expect(await escrowed('SCRAP_METAL')).toBe(0);
  });

  it('keeps every part either in the stash or in escrow', async () => {
    const total = async () => ((await parts()).SCRAP_METAL ?? 0) + await escrowed('SCRAP_METAL');
    const a = await post({ quantity: 7 });
    await post({ quantity: 11, durationHours: 48 });
    expect(await total()).toBe(50);
    await PlayerBoardService.cancel(prisma, round, playerId, a.offer.id, t0);
    expect(await total()).toBe(50);
    await PlayerBoardService.expireDue(prisma, round, new Date(t0.getTime() + 48 * HOUR));
    expect(await total()).toBe(50);
    expect((await parts()).SCRAP_METAL).toBe(50);
  });
});
