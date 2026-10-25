import type { PlayerBoardOffer, Prisma, PrismaClient, Round } from '@prisma/client';
import {
  isPlayerBoardPriceLegal,
  loadRuleset,
  playerBoardBand,
  playerBoardBarterQuote,
  playerBoardItemBookCents,
  playerBoardItemKind,
  playerBoardOfferExpiresAt,
  playerBoardPostingFeeCents,
  playerBoardSellerProceedsCents,
  type Ruleset,
} from '@streets/rules-engine';
import type {
  PlayerBoardAskDto,
  PlayerBoardDto,
  PlayerBoardFilterDto,
  PlayerBoardFillResult,
  PlayerBoardListableDto,
  PlayerBoardOfferDto,
  PlayerBoardOfferResult,
  PlayerBoardRowDto,
  PostPlayerBoardOfferInput,
  StashItemKeyDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { assertNotPaused } from './action.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { ProductInventoryService } from './product-inventory.service.js';
import { COMPONENTS, jsonObject } from './scavenging.service.js';

/**
 * The Board C: escrow. Posting moves a stack out of the seller's holdings (parts from
 * `scavengedComponents`, drugs from product inventory, F) into `playerBoardEscrow`, opens an offer for it, and charges the posting fee, which never comes back.
 * Both balances count toward net worth, so only the fee moves rank. Cancel and expiry return the
 * stack. An expired stack that needs a new stash cell when none is free stays held on the offer
 * (`returnedAt` null) and goes back the next time the seller's offers settle with room.
 * A fill (slice E) moves the whole stack from the seller's escrow to the buyer, pays the seller
 * after the tax, and deletes the tax from the round.
 */

export type BoardRound = Pick<Round, 'id' | 'name' | 'status' | 'endsAt' | 'pausedAt' | 'pauseReason' | 'pausedMinutesTotal' | 'rulesetId' | 'rulesetVersion'>;

/** Most recent of the viewer's offers returned by `mine`, open ones included. */
const MINE_LIMIT = 50;
/** Open offers the book reads at once: at most six per player, so this covers a busy round. */
const BOOK_LIMIT = 500;

/** The round's pinned ruleset, for the paths that move stacks without being handed one. */
function rulesFor(round: BoardRound): Ruleset {
  return loadRuleset(round.rulesetId, round.rulesetVersion);
}

function itemName(key: string, ruleset: Ruleset): string {
  return COMPONENTS.find((row) => row.key === key)?.name ?? ruleset.products?.[key]?.name ?? key;
}

/** A barter offer's stored basket as display lines; empty for cash. */
function askLines(offer: Pick<PlayerBoardOffer, 'askItems'>, ruleset: Ruleset): PlayerBoardAskDto[] {
  return Object.entries(jsonObject(offer.askItems as Prisma.JsonValue, {})).map(([key, quantity]) => ({ key, name: itemName(key, ruleset), quantity }));
}

const BARTER_REFUSALS: Record<string, string> = {
  EMPTY: 'Ask for at least one thing in trade.',
  TOO_MANY: 'Ask for fewer different things.',
  INVALID_QUANTITY: 'Ask for whole numbers of each thing.',
  NOT_LISTABLE: 'The Board does not trade one of those.',
  SAME_ITEM: 'You cannot ask for the same thing you are offering.',
  ASKS_TOO_MUCH: 'You are asking for more than your stack is worth on the Board.',
};

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function assertPlayable(round: BoardRound, now: Date): void {
  if (round.status !== 'ACTIVE' || round.endsAt.getTime() <= now.getTime()) {
    throw AppError.conflict('ROUND_ENDED', `${round.name} has ended.`);
  }
  assertNotPaused(round);
}

export function offerDto(offer: PlayerBoardOffer, round: Pick<BoardRound, 'pausedAt' | 'pausedMinutesTotal'>, now: Date, ruleset: Ruleset): PlayerBoardOfferDto {
  return {
    id: offer.id,
    itemKey: offer.itemKey,
    name: itemName(offer.itemKey, ruleset),
    quantity: offer.quantity,
    remainingQuantity: offer.remainingQuantity,
    priceKind: offer.priceKind,
    unitPriceCents: offer.unitPriceCents,
    ask: askLines(offer, ruleset),
    feeCents: offer.feeCents,
    durationHours: offer.durationHours,
    postedAt: offer.postedAt.toISOString(),
    expiresAt: playerBoardOfferExpiresAt(offer, round, now).toISOString(),
    status: offer.status,
    returned: offer.status !== 'EXPIRED' || offer.returnedAt !== null,
  };
}

async function partBalances(tx: Db, roundPlayerId: string): Promise<Record<string, number>> {
  const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { scavengedComponents: true } });
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
  return jsonObject(player.scavengedComponents, {});
}

/** Whether `quantity` of `key` can go back into the stash: onto its own stack, or into a free cell. */
async function canReturn(tx: Db, roundPlayerId: string, key: string, components: Record<string, number>): Promise<boolean> {
  if ((components[key] ?? 0) > 0) return true;
  const { StashService, canFitAdditionalStack } = await import('./stash.service.js');
  return canFitAdditionalStack(await StashService.page(tx, roundPlayerId), key as StashItemKeyDto);
}

function adjustBalance(balances: Record<string, number>, key: string, delta: number): void {
  balances[key] = (balances[key] ?? 0) + delta;
  if (balances[key]! <= 0) delete balances[key];
}

/** Units of an item the player holds: parts on the stash balance, drugs in product inventory. */
async function heldUnits(tx: Db, roundPlayerId: string, key: string, ruleset: Ruleset): Promise<number> {
  if (playerBoardItemKind(key, ruleset) === 'PRODUCT') return (await ProductInventoryService.read(tx, roundPlayerId, ruleset))[key] ?? 0;
  return (await partBalances(tx, roundPlayerId))[key] ?? 0;
}

/** Whether a stack can land: parts need their stash stack or a free cell; drugs take no cell. */
async function hasRoom(tx: Db, roundPlayerId: string, key: string, ruleset: Ruleset): Promise<boolean> {
  if (playerBoardItemKind(key, ruleset) === 'PRODUCT') return true;
  return canReturn(tx, roundPlayerId, key, await partBalances(tx, roundPlayerId));
}

/** Add to (or, negative, take from) what the player holds. */
async function moveHeld(tx: Db, roundPlayerId: string, key: string, delta: number, ruleset: Ruleset): Promise<void> {
  if (playerBoardItemKind(key, ruleset) === 'PRODUCT') {
    await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, { [key]: delta });
    return;
  }
  const components = await partBalances(tx, roundPlayerId);
  adjustBalance(components, key, delta);
  await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { scavengedComponents: components as Prisma.InputJsonValue } });
}

async function moveEscrow(tx: Db, roundPlayerId: string, key: string, delta: number): Promise<void> {
  const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { playerBoardEscrow: true } });
  const escrow = jsonObject(player.playerBoardEscrow, {});
  adjustBalance(escrow, key, delta);
  await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { playerBoardEscrow: escrow as Prisma.InputJsonValue } });
}

/** Escrow back to the seller. Both count toward net worth at book, so rank does not move. */
async function returnStack(tx: Db, roundPlayerId: string, key: string, quantity: number, ruleset: Ruleset): Promise<void> {
  await moveEscrow(tx, roundPlayerId, key, -quantity);
  await moveHeld(tx, roundPlayerId, key, quantity, ruleset);
}

/**
 * Expire the seller's due offers and hand back every held stack that now fits. The caller holds
 * the seller's row lock.
 */
async function settleSeller(tx: Db, round: BoardRound, sellerId: string, now: Date): Promise<void> {
  const open = await tx.playerBoardOffer.findMany({ where: { roundId: round.id, sellerId, status: 'OPEN', expiresAt: { lte: now } } });
  for (const offer of open) {
    if (playerBoardOfferExpiresAt(offer, round, now).getTime() > now.getTime()) continue;
    await tx.playerBoardOffer.updateMany({ where: { id: offer.id, status: 'OPEN' }, data: { status: 'EXPIRED', closedAt: now } });
  }
  const held = await tx.playerBoardOffer.findMany({
    where: { roundId: round.id, sellerId, status: 'EXPIRED', returnedAt: null },
    orderBy: { postedAt: 'asc' },
  });
  if (held.length === 0) return;
  const ruleset = rulesFor(round);
  for (const offer of held) {
    if (!(await hasRoom(tx, sellerId, offer.itemKey, ruleset))) continue;
    const claimed = await tx.playerBoardOffer.updateMany({ where: { id: offer.id, status: 'EXPIRED', returnedAt: null }, data: { returnedAt: now } });
    if (claimed.count === 1) await returnStack(tx, sellerId, offer.itemKey, offer.remainingQuantity, ruleset);
  }
}

export const PlayerBoardService = {
  /** `ruleset` is the round's pinned ruleset. */
  async post(prisma: PrismaClient, round: BoardRound, ruleset: Ruleset, roundPlayerId: string, input: PostPlayerBoardOfferInput, now = new Date()): Promise<PlayerBoardOfferResult> {
    const board = ruleset.playerBoard;
    if (!board?.enabled) throw AppError.conflict('BOARD_CLOSED', 'The Board is not open this round.');
    assertPlayable(round, now);

    const book = playerBoardItemBookCents(input.itemKey, ruleset);
    if (book === null) throw AppError.badRequest('NOT_LISTABLE', 'That cannot be listed on the Board.');
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
      throw AppError.badRequest('INVALID_QUANTITY', 'List at least one.');
    }
    if (!board.listingHours.includes(input.durationHours)) {
      throw AppError.badRequest('INVALID_DURATION', `Listings run for ${board.listingHours.join(' or ')} hours.`);
    }
    const barter = input.priceKind === 'BARTER';
    let price: { unitPriceCents: number; askItems?: Record<string, number>; askBookCents?: number; buyerFeeCents?: number };
    if (barter) {
      const ask: Record<string, number> = {};
      for (const line of input.askItems ?? []) {
        if (Object.hasOwn(ask, line.key)) throw AppError.badRequest('INVALID_BARTER', 'List each thing you ask for once.');
        ask[line.key] = line.quantity;
      }
      const quote = playerBoardBarterQuote(input.itemKey, input.quantity, ask, ruleset);
      if ('refusal' in quote) throw AppError.badRequest('INVALID_BARTER', BARTER_REFUSALS[quote.refusal]!);
      price = { unitPriceCents: 0, askItems: ask, askBookCents: quote.askBookCents, buyerFeeCents: quote.buyerFeeCents };
    } else {
      const unitPriceCents = input.unitPriceCents ?? Number.NaN;
      if (!isPlayerBoardPriceLegal(unitPriceCents, book, ruleset)) {
        const band = playerBoardBand(book, ruleset)!;
        throw AppError.badRequest('PRICE_OUTSIDE_BAND', `${itemName(input.itemKey, ruleset)} lists from ${dollars(band.floorCents)} to ${dollars(band.capCents)} each.`);
      }
      price = { unitPriceCents };
    }
    const feeCents = playerBoardPostingFeeCents(book * input.quantity, ruleset);

    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { roundId: true, cashCents: true } });
      if (!player || player.roundId !== round.id) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      await settleSeller(tx, round, roundPlayerId, now);

      const openCount = await tx.playerBoardOffer.count({ where: { roundId: round.id, sellerId: roundPlayerId, status: 'OPEN' } });
      if (openCount >= board.maxOpenOffers) {
        throw AppError.conflict('TOO_MANY_OFFERS', `You can have ${board.maxOpenOffers} offers up at once. Cancel one or wait for it to close.`);
      }
      const held = await heldUnits(tx, roundPlayerId, input.itemKey, ruleset);
      if (held < input.quantity) {
        throw AppError.badRequest('NOT_ENOUGH_TO_LIST', `You only have ${held} ${itemName(input.itemKey, ruleset).toLowerCase()}.`);
      }
      if (player.cashCents < BigInt(feeCents)) {
        throw AppError.badRequest('NOT_ENOUGH_CASH', `The posting fee is ${dollars(feeCents)}.`);
      }

      await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { cashCents: player.cashCents - BigInt(feeCents) } });
      await moveHeld(tx, roundPlayerId, input.itemKey, -input.quantity, ruleset);
      await moveEscrow(tx, roundPlayerId, input.itemKey, input.quantity);
      const offer = await tx.playerBoardOffer.create({ data: {
        roundId: round.id,
        sellerId: roundPlayerId,
        itemKey: input.itemKey,
        quantity: input.quantity,
        remainingQuantity: input.quantity,
        unitPriceCents: price.unitPriceCents,
        bookCents: book,
        ...(barter ? {
          priceKind: 'BARTER' as const,
          askItems: price.askItems as Prisma.InputJsonValue,
          askBookCents: price.askBookCents!,
          buyerFeeCents: price.buyerFeeCents!,
        } : {}),
        feeCents,
        durationHours: input.durationHours,
        pausedMinutesAtPost: round.pausedMinutesTotal,
        postedAt: now,
        expiresAt: new Date(now.getTime() + input.durationHours * 3_600_000),
      } });
      await EconomyLedgerService.record(tx, roundPlayerId, [{
        source: 'PLAYER_BOARD_FEE', label: 'Board posting fee', amountCents: -feeCents,
        metadata: { offerId: offer.id, itemKey: input.itemKey, quantity: input.quantity },
      }], now);
      return { offer: offerDto(offer, round, now, ruleset), feeCents, returnedQuantity: 0 };
    });
  },

  /** Take an open offer down. What is left of the stack comes back; the fee does not. A closed offer changes nothing. */
  async cancel(prisma: PrismaClient, round: BoardRound, roundPlayerId: string, offerId: string, now = new Date()): Promise<PlayerBoardOfferResult> {
    assertPlayable(round, now);
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      await settleSeller(tx, round, roundPlayerId, now);
      const offer = await tx.playerBoardOffer.findFirst({ where: { id: offerId, roundId: round.id, sellerId: roundPlayerId } });
      if (!offer) throw AppError.notFound('OFFER_NOT_FOUND', 'That offer is not yours.');
      if (offer.status !== 'OPEN') throw AppError.conflict('OFFER_NOT_OPEN', 'That offer is already closed.');

      const ruleset = rulesFor(round);
      if (!(await hasRoom(tx, roundPlayerId, offer.itemKey, ruleset))) {
        throw AppError.conflict('STASH_FULL', 'There is no room in the stash to take that stack back. Clear a slot first.');
      }
      const closed = await tx.playerBoardOffer.updateMany({
        where: { id: offer.id, status: 'OPEN' },
        data: { status: 'CANCELLED', closedAt: now, returnedAt: now },
      });
      if (closed.count !== 1) throw AppError.conflict('OFFER_NOT_OPEN', 'That offer is already closed.');
      await returnStack(tx, roundPlayerId, offer.itemKey, offer.remainingQuantity, ruleset);
      const after = await tx.playerBoardOffer.findUniqueOrThrow({ where: { id: offer.id } });
      return { offer: offerDto(after, round, now, ruleset), feeCents: 0, returnedQuantity: offer.remainingQuantity };
    });
  },

  /**
   * Buy from an offer in one transaction: any part of a cash offer (all that is left when
   * `quantity` is omitted), or a barter whole. Both players are locked in id order, so two buyers
   * take turns and units are never sold twice. The buyer pays the sticker, the seller gets the
   * share after tax and the tax leaves the round; the offer closes as SOLD when nothing is left.
   * A retried request with the same action id returns the first result and charges nothing more.
   */
  async fill(prisma: PrismaClient, round: BoardRound, ruleset: Ruleset, buyerId: string, offerId: string, actionId?: string, now = new Date(), quantity?: number): Promise<PlayerBoardFillResult> {
    if (!ruleset.playerBoard?.enabled) throw AppError.conflict('BOARD_CLOSED', 'The Board is not open this round.');
    assertPlayable(round, now);
    const target = await prisma.playerBoardOffer.findFirst({ where: { id: offerId, roundId: round.id }, select: { sellerId: true } });
    if (!target) throw AppError.notFound('OFFER_NOT_FOUND', 'That offer is gone.');
    if (target.sellerId === buyerId) throw AppError.conflict('CANNOT_BUY_OWN', 'You cannot buy your own offer.');

    const outcome = await prisma.$transaction(async (tx): Promise<PlayerBoardFillResult | 'CLOSED'> => {
      for (const id of [buyerId, target.sellerId].sort()) await lockRoundPlayer(tx, id);
      if (actionId) {
        const replay = await IdempotencyService.find<PlayerBoardFillResult>(tx, actionId, buyerId, 'BOARD_BUY');
        if (replay) return replay;
      }
      await settleSeller(tx, round, target.sellerId, now);
      const offer = await tx.playerBoardOffer.findUniqueOrThrow({ where: { id: offerId }, include: { seller: { select: { displayName: true } } } });
      // Commit the expiry (and the stack going home) before refusing, rather than rolling it back.
      if (offer.status !== 'OPEN') return 'CLOSED';

      const buyer = await tx.roundPlayer.findUnique({ where: { id: buyerId }, select: { roundId: true, cashCents: true } });
      if (!buyer || buyer.roundId !== round.id) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      const barter = offer.priceKind === 'BARTER';
      const units = quantity ?? offer.remainingQuantity;
      if (barter && units !== offer.remainingQuantity) {
        throw AppError.badRequest('BARTER_IS_WHOLE', 'A trade takes the whole stack.');
      }
      if (!Number.isSafeInteger(units) || units < 1) throw AppError.badRequest('INVALID_QUANTITY', 'Buy at least one.');
      if (units > offer.remainingQuantity) {
        throw AppError.conflict('NOT_ENOUGH_LEFT', `Only ${offer.remainingQuantity} left on that offer.`);
      }
      const ask = barter ? jsonObject(offer.askItems as Prisma.JsonValue, {}) : {};
      const paidCents = barter ? offer.buyerFeeCents ?? 0 : offer.unitPriceCents * units;
      if (buyer.cashCents < BigInt(paidCents)) {
        throw AppError.badRequest('NOT_ENOUGH_CASH', barter ? `The Board also wants ${dollars(paidCents)} to even out that trade.` : `That offer costs ${dollars(paidCents)}.`);
      }
      for (const [key, wanted] of Object.entries(ask)) {
        const held = await heldUnits(tx, buyerId, key, ruleset);
        if (held < wanted) throw AppError.badRequest('NOT_ENOUGH_TO_TRADE', `That trade wants ${wanted} ${itemName(key, ruleset).toLowerCase()}; you have ${held}.`);
      }
      if (!(await hasRoom(tx, buyerId, offer.itemKey, ruleset))) {
        throw AppError.conflict('STASH_FULL', 'There is no room in the stash for a new part. Upgrade Storage or clear a slot.');
      }
      for (const key of Object.keys(ask)) {
        if (!(await hasRoom(tx, offer.sellerId, key, ruleset))) {
          throw AppError.conflict('SELLER_STASH_FULL', 'The seller has no stash room for what they asked for. Try again later.');
        }
      }

      const proceedsCents = barter ? 0 : playerBoardSellerProceedsCents(paidCents, ruleset);
      const taken = await tx.playerBoardOffer.updateMany({
        where: { id: offer.id, status: 'OPEN', remainingQuantity: { gte: units } },
        data: { remainingQuantity: { decrement: units } },
      });
      if (taken.count !== 1) throw AppError.conflict('OFFER_NOT_OPEN', 'That offer has already closed.');
      const remainingQuantity = offer.remainingQuantity - units;
      if (remainingQuantity === 0) await tx.playerBoardOffer.update({ where: { id: offer.id }, data: { status: 'SOLD', closedAt: now } });
      await tx.playerBoardFill.create({ data: { offerId: offer.id, buyerId, quantity: units, paidCents, proceedsCents, createdAt: now } });

      if (paidCents > 0) await tx.roundPlayer.update({ where: { id: buyerId }, data: { cashCents: buyer.cashCents - BigInt(paidCents) } });
      for (const [key, wanted] of Object.entries(ask)) {
        await moveHeld(tx, buyerId, key, -wanted, ruleset);
        await moveHeld(tx, offer.sellerId, key, wanted, ruleset);
      }
      await moveHeld(tx, buyerId, offer.itemKey, units, ruleset);
      if (proceedsCents > 0) await tx.roundPlayer.update({ where: { id: offer.sellerId }, data: { cashCents: { increment: BigInt(proceedsCents) } } });
      await moveEscrow(tx, offer.sellerId, offer.itemKey, -units);

      const metadata = { offerId: offer.id, itemKey: offer.itemKey, quantity: units, unitPriceCents: offer.unitPriceCents, priceKind: offer.priceKind, ...(barter ? { askItems: ask } : {}) };
      if (barter) {
        if (paidCents > 0) await EconomyLedgerService.record(tx, buyerId, [{ source: 'PLAYER_BOARD_BARTER_FEE', label: 'Board barter top-up', amountCents: -paidCents, metadata }], now);
      } else {
        await EconomyLedgerService.record(tx, buyerId, [{ source: 'PLAYER_BOARD_BUY', label: 'Board purchase', amountCents: -paidCents, metadata }], now);
        await EconomyLedgerService.record(tx, offer.sellerId, [{ source: 'PLAYER_BOARD_SALE', label: 'Board sale', amountCents: proceedsCents, metadata }], now);
      }

      const result: PlayerBoardFillResult = {
        offerId: offer.id,
        itemKey: offer.itemKey,
        name: itemName(offer.itemKey, ruleset),
        quantity: units,
        remainingQuantity,
        unitPriceCents: offer.unitPriceCents,
        paidCents,
        gave: askLines(offer, ruleset),
        sellerName: offer.seller.displayName,
      };
      if (actionId) await IdempotencyService.record(tx, actionId, buyerId, 'BOARD_BUY', result, now);
      return result;
    });
    if (outcome === 'CLOSED') throw AppError.conflict('OFFER_NOT_OPEN', 'That offer has already closed.');
    return outcome;
  },

  /** The viewer's offers, newest first, after expiring what is due and returning what fits. */
  async mine(prisma: PrismaClient, round: BoardRound, roundPlayerId: string, now = new Date()): Promise<PlayerBoardOfferDto[]> {
    const offers = await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      await settleSeller(tx, round, roundPlayerId, now);
      return tx.playerBoardOffer.findMany({ where: { roundId: round.id, sellerId: roundPlayerId }, orderBy: { postedAt: 'desc' }, take: MINE_LIMIT });
    });
    const ruleset = rulesFor(round);
    return offers.map((offer) => offerDto(offer, round, now, ruleset));
  },

  /**
   * The Board D-F read model: every open offer in the round, grouped by item (drugs, then parts,
   * each in catalog order) and cheapest first within an item, plus the viewer's own offers and
   * what they could list.
   * Due offers are expired first, so nothing past its time is ever shown.
   */
  async book(prisma: PrismaClient, round: BoardRound, ruleset: Ruleset, viewerId: string, filter: PlayerBoardFilterDto = 'ALL', now = new Date()): Promise<PlayerBoardDto> {
    const board = ruleset.playerBoard;
    if (!board?.enabled) throw AppError.notFound('BOARD_CLOSED', 'The Board is not open this round.');
    await PlayerBoardService.expireDue(prisma, round, now);
    const [open, mine, viewer] = await Promise.all([
      prisma.playerBoardOffer.findMany({
        where: { roundId: round.id, status: 'OPEN' },
        include: { seller: { select: { displayName: true } } },
        orderBy: [{ unitPriceCents: 'asc' }, { postedAt: 'asc' }, { id: 'asc' }],
        take: BOOK_LIMIT,
      }),
      PlayerBoardService.mine(prisma, round, viewerId, now),
      prisma.roundPlayer.findUnique({ where: { id: viewerId }, select: { scavengedComponents: true, cashCents: true } }),
    ]);
    if (!viewer) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');

    // Drugs first in catalog order, then parts in catalog order.
    const products = Object.entries(ruleset.products ?? {}).sort(([, a], [, b]) => a.sortOrder - b.sortOrder).map(([key]) => key);
    if (!products.includes('CRACK')) products.unshift('CRACK');
    const order = new Map([...products, ...COMPONENTS.map((row) => row.key)].map((key, index) => [key, index]));
    const wanted = (kind: 'PART' | 'PRODUCT' | null) => kind !== null
      && (filter === 'ALL' || (filter === 'PARTS' && kind === 'PART') || (filter === 'PRODUCTS' && kind === 'PRODUCT'));
    const rows: PlayerBoardRowDto[] = open
      .map((offer) => ({ offer, kind: playerBoardItemKind(offer.itemKey, ruleset) }))
      .filter(({ offer, kind }) => wanted(kind) && order.has(offer.itemKey))
      .filter(({ offer }) => playerBoardOfferExpiresAt(offer, round, now).getTime() > now.getTime())
      // Per item: cash offers cheapest first, then barters oldest first.
      .sort((a, b) => order.get(a.offer.itemKey)! - order.get(b.offer.itemKey)!
        || Number(a.offer.priceKind === 'BARTER') - Number(b.offer.priceKind === 'BARTER'))
      .map(({ offer, kind }) => ({
        id: offer.id,
        itemKey: offer.itemKey,
        name: itemName(offer.itemKey, ruleset),
        category: kind!,
        rarity: COMPONENTS.find((row) => row.key === offer.itemKey)?.rarity ?? null,
        quantity: offer.remainingQuantity,
        priceKind: offer.priceKind,
        unitPriceCents: offer.unitPriceCents,
        totalCents: offer.priceKind === 'BARTER' ? offer.buyerFeeCents ?? 0 : offer.unitPriceCents * offer.remainingQuantity,
        ask: askLines(offer, ruleset),
        sellerName: offer.seller.displayName,
        mine: offer.sellerId === viewerId,
        expiresAt: playerBoardOfferExpiresAt(offer, round, now).toISOString(),
      }));

    const held = { ...jsonObject(viewer.scavengedComponents, {}), ...(await ProductInventoryService.read(prisma, viewerId, ruleset)) };
    const listable: PlayerBoardListableDto[] = [...order.keys()].flatMap((key) => {
      const quantity = held[key] ?? 0;
      const kind = playerBoardItemKind(key, ruleset);
      const book = playerBoardItemBookCents(key, ruleset);
      const band = book === null ? null : playerBoardBand(book, ruleset);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || kind === null || book === null || !band) return [];
      const rarity = COMPONENTS.find((row) => row.key === key)?.rarity ?? null;
      return [{ key, name: itemName(key, ruleset), category: kind, rarity, held: quantity, bookCents: book, floorCents: band.floorCents, capCents: band.capCents }];
    });

    const keys = [...order.keys()].filter((key) => playerBoardItemKind(key, ruleset) !== null);
    return {
      filter,
      rows,
      mine,
      listable,
      holdings: Object.fromEntries(keys.map((key) => [key, Number.isSafeInteger(held[key]) ? held[key]! : 0])),
      askable: keys.map((key) => ({ key, name: itemName(key, ruleset), category: playerBoardItemKind(key, ruleset)!, bookCents: playerBoardItemBookCents(key, ruleset)! })),
      openOffers: mine.filter((offer) => offer.status === 'OPEN').length,
      cashCents: Number(viewer.cashCents),
      rules: {
        maxOpenOffers: board.maxOpenOffers,
        listingHours: [...board.listingHours],
        postingFeePercent: board.postingFeePercent,
        postingFeeMinCents: board.postingFeeMinCents,
        taxPercent: board.taxPercent,
        maxAskItems: board.maxAskItems,
        cashWeightPercent: ruleset.economy.netWorth.cashWeightPercent,
      },
    };
  },

  /**
   * Expire every due offer in the round and return the held stacks that fit, one seller at a time.
   * Safe to run from any reader or a sweep; returns how many sellers were settled.
   */
  async expireDue(prisma: PrismaClient, round: BoardRound, now = new Date()): Promise<number> {
    const due = await prisma.playerBoardOffer.findMany({
      where: { roundId: round.id, OR: [{ status: 'OPEN', expiresAt: { lte: now } }, { status: 'EXPIRED', returnedAt: null }] },
      select: { sellerId: true, status: true, expiresAt: true, pausedMinutesAtPost: true },
    });
    const sellers = [...new Set(due
      .filter((offer) => offer.status === 'EXPIRED' || playerBoardOfferExpiresAt(offer, round, now).getTime() <= now.getTime())
      .map((offer) => offer.sellerId))];
    for (const sellerId of sellers) {
      await prisma.$transaction(async (tx) => {
        await lockRoundPlayer(tx, sellerId);
        await settleSeller(tx, round, sellerId, now);
      });
    }
    return sellers.length;
  },
};
