import type { PlayerBoardOffer, Prisma, PrismaClient, Round } from '@prisma/client';
import {
  isPlayerBoardPriceLegal,
  playerBoardBand,
  playerBoardOfferExpiresAt,
  playerBoardPartBookCents,
  playerBoardPostingFeeCents,
  playerBoardSellerProceedsCents,
  type Ruleset,
} from '@streets/rules-engine';
import type {
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
import { COMPONENTS, jsonObject } from './scavenging.service.js';

/**
 * The Board C: escrow. Posting moves a stack of parts out of `scavengedComponents` into
 * `playerBoardEscrow`, opens an offer for it, and charges the posting fee, which never comes back.
 * Both balances count toward net worth, so only the fee moves rank. Cancel and expiry return the
 * stack. An expired stack that needs a new stash cell when none is free stays held on the offer
 * (`returnedAt` null) and goes back the next time the seller's offers settle with room.
 * A fill (slice E) moves the whole stack from the seller's escrow to the buyer, pays the seller
 * after the tax, and deletes the tax from the round.
 */

export type BoardRound = Pick<Round, 'id' | 'name' | 'status' | 'endsAt' | 'pausedAt' | 'pauseReason' | 'pausedMinutesTotal'>;

/** Most recent of the viewer's offers returned by `mine`, open ones included. */
const MINE_LIMIT = 50;
/** Open offers the book reads at once: at most six per player, so this covers a busy round. */
const BOOK_LIMIT = 500;

const componentName = (key: string) => COMPONENTS.find((row) => row.key === key)?.name ?? key;

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function assertPlayable(round: BoardRound, now: Date): void {
  if (round.status !== 'ACTIVE' || round.endsAt.getTime() <= now.getTime()) {
    throw AppError.conflict('ROUND_ENDED', `${round.name} has ended.`);
  }
  assertNotPaused(round);
}

export function offerDto(offer: PlayerBoardOffer, round: Pick<BoardRound, 'pausedAt' | 'pausedMinutesTotal'>, now: Date): PlayerBoardOfferDto {
  return {
    id: offer.id,
    itemKey: offer.itemKey,
    name: componentName(offer.itemKey),
    quantity: offer.quantity,
    unitPriceCents: offer.unitPriceCents,
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

async function escrowBalances(tx: Db, roundPlayerId: string): Promise<Record<string, number>> {
  const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { playerBoardEscrow: true } });
  return jsonObject(player.playerBoardEscrow, {});
}

function moveUnits(from: Record<string, number>, to: Record<string, number>, key: string, quantity: number): void {
  from[key] = (from[key] ?? 0) - quantity;
  if (from[key]! <= 0) delete from[key];
  to[key] = (to[key] ?? 0) + quantity;
}

/** Escrow back to the stash. Both balances count toward net worth, so rank does not move. */
async function returnStack(tx: Db, roundPlayerId: string, key: string, quantity: number, components: Record<string, number>): Promise<void> {
  const escrow = await escrowBalances(tx, roundPlayerId);
  moveUnits(escrow, components, key, quantity);
  await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: {
    scavengedComponents: components as Prisma.InputJsonValue,
    playerBoardEscrow: escrow as Prisma.InputJsonValue,
  } });
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
  const components = await partBalances(tx, sellerId);
  for (const offer of held) {
    if (!(await canReturn(tx, sellerId, offer.itemKey, components))) continue;
    const claimed = await tx.playerBoardOffer.updateMany({ where: { id: offer.id, status: 'EXPIRED', returnedAt: null }, data: { returnedAt: now } });
    if (claimed.count === 1) await returnStack(tx, sellerId, offer.itemKey, offer.quantity, components);
  }
}

export const PlayerBoardService = {
  /** `ruleset` is the round's pinned ruleset. */
  async post(prisma: PrismaClient, round: BoardRound, ruleset: Ruleset, roundPlayerId: string, input: PostPlayerBoardOfferInput, now = new Date()): Promise<PlayerBoardOfferResult> {
    const board = ruleset.playerBoard;
    if (!board?.enabled) throw AppError.conflict('BOARD_CLOSED', 'The Board is not open this round.');
    assertPlayable(round, now);

    const book = playerBoardPartBookCents(input.itemKey, ruleset);
    if (book === null) throw AppError.badRequest('NOT_LISTABLE', 'That cannot be listed on the Board.');
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
      throw AppError.badRequest('INVALID_QUANTITY', 'List at least one.');
    }
    if (!board.listingHours.includes(input.durationHours)) {
      throw AppError.badRequest('INVALID_DURATION', `Listings run for ${board.listingHours.join(' or ')} hours.`);
    }
    if (!isPlayerBoardPriceLegal(input.unitPriceCents, book, ruleset)) {
      const band = playerBoardBand(book, ruleset)!;
      throw AppError.badRequest('PRICE_OUTSIDE_BAND', `${componentName(input.itemKey)} lists from ${dollars(band.floorCents)} to ${dollars(band.capCents)} each.`);
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
      const components = await partBalances(tx, roundPlayerId);
      const held = components[input.itemKey] ?? 0;
      if (held < input.quantity) {
        throw AppError.badRequest('NOT_ENOUGH_TO_LIST', `You only have ${held} ${componentName(input.itemKey).toLowerCase()}.`);
      }
      if (player.cashCents < BigInt(feeCents)) {
        throw AppError.badRequest('NOT_ENOUGH_CASH', `The posting fee is ${dollars(feeCents)}.`);
      }

      const escrow = await escrowBalances(tx, roundPlayerId);
      moveUnits(components, escrow, input.itemKey, input.quantity);
      await tx.roundPlayer.update({
        where: { id: roundPlayerId },
        data: {
          cashCents: player.cashCents - BigInt(feeCents),
          scavengedComponents: components as Prisma.InputJsonValue,
          playerBoardEscrow: escrow as Prisma.InputJsonValue,
        },
      });
      const offer = await tx.playerBoardOffer.create({ data: {
        roundId: round.id,
        sellerId: roundPlayerId,
        itemKey: input.itemKey,
        quantity: input.quantity,
        unitPriceCents: input.unitPriceCents,
        bookCents: book,
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
      return { offer: offerDto(offer, round, now), feeCents, returnedQuantity: 0 };
    });
  },

  /** Take an open offer down. The stack comes back; the fee does not. A closed offer changes nothing. */
  async cancel(prisma: PrismaClient, round: BoardRound, roundPlayerId: string, offerId: string, now = new Date()): Promise<PlayerBoardOfferResult> {
    assertPlayable(round, now);
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      await settleSeller(tx, round, roundPlayerId, now);
      const offer = await tx.playerBoardOffer.findFirst({ where: { id: offerId, roundId: round.id, sellerId: roundPlayerId } });
      if (!offer) throw AppError.notFound('OFFER_NOT_FOUND', 'That offer is not yours.');
      if (offer.status !== 'OPEN') throw AppError.conflict('OFFER_NOT_OPEN', 'That offer is already closed.');

      const components = await partBalances(tx, roundPlayerId);
      if (!(await canReturn(tx, roundPlayerId, offer.itemKey, components))) {
        throw AppError.conflict('STASH_FULL', 'There is no room in the stash to take that stack back. Clear a slot first.');
      }
      const closed = await tx.playerBoardOffer.updateMany({
        where: { id: offer.id, status: 'OPEN' },
        data: { status: 'CANCELLED', closedAt: now, returnedAt: now },
      });
      if (closed.count !== 1) throw AppError.conflict('OFFER_NOT_OPEN', 'That offer is already closed.');
      await returnStack(tx, roundPlayerId, offer.itemKey, offer.quantity, components);
      const after = await tx.playerBoardOffer.findUniqueOrThrow({ where: { id: offer.id } });
      return { offer: offerDto(after, round, now), feeCents: 0, returnedQuantity: offer.quantity };
    });
  },

  /**
   * Buy a whole offer in one transaction. Both players are locked in id order, the offer flips
   * OPEN to SOLD only once, the buyer pays the sticker, the seller gets the share after tax and
   * the tax leaves the round. A retried request with the same action id returns the first result
   * and charges nothing more.
   */
  async fill(prisma: PrismaClient, round: BoardRound, ruleset: Ruleset, buyerId: string, offerId: string, actionId?: string, now = new Date()): Promise<PlayerBoardFillResult> {
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

      const buyer = await tx.roundPlayer.findUnique({ where: { id: buyerId }, select: { roundId: true, cashCents: true, scavengedComponents: true } });
      if (!buyer || buyer.roundId !== round.id) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      const paidCents = offer.unitPriceCents * offer.quantity;
      if (buyer.cashCents < BigInt(paidCents)) {
        throw AppError.badRequest('NOT_ENOUGH_CASH', `That offer costs ${dollars(paidCents)}.`);
      }
      const components = jsonObject(buyer.scavengedComponents, {});
      if (!(await canReturn(tx, buyerId, offer.itemKey, components))) {
        throw AppError.conflict('STASH_FULL', 'There is no room in the stash for a new part. Upgrade Storage or clear a slot.');
      }

      const proceedsCents = playerBoardSellerProceedsCents(paidCents, ruleset);
      const sold = await tx.playerBoardOffer.updateMany({
        where: { id: offer.id, status: 'OPEN' },
        data: { status: 'SOLD', closedAt: now, buyerId, proceedsCents },
      });
      if (sold.count !== 1) throw AppError.conflict('OFFER_NOT_OPEN', 'That offer has already closed.');

      components[offer.itemKey] = (components[offer.itemKey] ?? 0) + offer.quantity;
      await tx.roundPlayer.update({ where: { id: buyerId }, data: {
        cashCents: buyer.cashCents - BigInt(paidCents),
        scavengedComponents: components as Prisma.InputJsonValue,
      } });
      const escrow = await escrowBalances(tx, offer.sellerId);
      escrow[offer.itemKey] = (escrow[offer.itemKey] ?? 0) - offer.quantity;
      if (escrow[offer.itemKey]! <= 0) delete escrow[offer.itemKey];
      await tx.roundPlayer.update({ where: { id: offer.sellerId }, data: {
        cashCents: { increment: BigInt(proceedsCents) },
        playerBoardEscrow: escrow as Prisma.InputJsonValue,
      } });

      const metadata = { offerId: offer.id, itemKey: offer.itemKey, quantity: offer.quantity, unitPriceCents: offer.unitPriceCents };
      await EconomyLedgerService.record(tx, buyerId, [{ source: 'PLAYER_BOARD_BUY', label: 'Board purchase', amountCents: -paidCents, metadata }], now);
      await EconomyLedgerService.record(tx, offer.sellerId, [{ source: 'PLAYER_BOARD_SALE', label: 'Board sale', amountCents: proceedsCents, metadata }], now);

      const result: PlayerBoardFillResult = {
        offerId: offer.id,
        itemKey: offer.itemKey,
        name: componentName(offer.itemKey),
        quantity: offer.quantity,
        unitPriceCents: offer.unitPriceCents,
        paidCents,
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
    return offers.map((offer) => offerDto(offer, round, now));
  },

  /**
   * The Board D read model: every open offer in the round, grouped by item in catalog order and
   * cheapest first within an item, plus the viewer's own offers and the parts they could list.
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

    const order = new Map(COMPONENTS.map((row, index) => [row.key, index]));
    const rows: PlayerBoardRowDto[] = open
      // Both filters show parts today; product and keeper goods arrive with later slices.
      .filter((offer) => order.has(offer.itemKey) && (filter === 'ALL' || filter === 'PARTS'))
      .filter((offer) => playerBoardOfferExpiresAt(offer, round, now).getTime() > now.getTime())
      .sort((a, b) => order.get(a.itemKey)! - order.get(b.itemKey)!)
      .map((offer) => ({
        id: offer.id,
        itemKey: offer.itemKey,
        name: componentName(offer.itemKey),
        category: 'PART',
        rarity: COMPONENTS.find((row) => row.key === offer.itemKey)?.rarity ?? null,
        quantity: offer.quantity,
        unitPriceCents: offer.unitPriceCents,
        totalCents: offer.unitPriceCents * offer.quantity,
        sellerName: offer.seller.displayName,
        mine: offer.sellerId === viewerId,
        expiresAt: playerBoardOfferExpiresAt(offer, round, now).toISOString(),
      }));

    const held = jsonObject(viewer.scavengedComponents, {});
    const listable: PlayerBoardListableDto[] = COMPONENTS.flatMap((row) => {
      const quantity = held[row.key] ?? 0;
      const book = playerBoardPartBookCents(row.key, ruleset);
      const band = book === null ? null : playerBoardBand(book, ruleset);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || book === null || !band) return [];
      return [{ key: row.key, name: row.name, rarity: row.rarity, held: quantity, bookCents: book, floorCents: band.floorCents, capCents: band.capCents }];
    });

    return {
      filter,
      rows,
      mine,
      listable,
      openOffers: mine.filter((offer) => offer.status === 'OPEN').length,
      cashCents: Number(viewer.cashCents),
      rules: {
        maxOpenOffers: board.maxOpenOffers,
        listingHours: [...board.listingHours],
        postingFeePercent: board.postingFeePercent,
        postingFeeMinCents: board.postingFeeMinCents,
        taxPercent: board.taxPercent,
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
