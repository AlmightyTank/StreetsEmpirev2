import type { PlayerBoardOffer, Prisma, PrismaClient, Round } from '@prisma/client';
import {
  isPlayerBoardPriceLegal,
  playerBoardBand,
  playerBoardOfferExpiresAt,
  playerBoardPartBookCents,
  playerBoardPostingFeeCents,
  type Ruleset,
} from '@streets/rules-engine';
import type { PlayerBoardOfferDto, PlayerBoardOfferResult, PostPlayerBoardOfferInput, StashItemKeyDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { assertNotPaused } from './action.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { COMPONENTS, jsonObject } from './scavenging.service.js';

/**
 * The Board C: escrow. Posting moves a stack of parts out of `scavengedComponents` into an OPEN
 * offer and charges the posting fee, which never comes back. Cancel and expiry return the stack.
 * An expired stack that needs a new stash cell when none is free stays held on the offer
 * (`returnedAt` null) and goes back the next time the seller's offers settle with room.
 * Nothing here fills an offer; that is slice E.
 */

export type BoardRound = Pick<Round, 'id' | 'name' | 'status' | 'endsAt' | 'pausedAt' | 'pauseReason' | 'pausedMinutesTotal'>;

/** Most recent of the viewer's offers returned by `mine`, open ones included. */
const MINE_LIMIT = 50;

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

async function returnStack(tx: Db, roundPlayerId: string, key: string, quantity: number, components: Record<string, number>): Promise<void> {
  components[key] = (components[key] ?? 0) + quantity;
  await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { scavengedComponents: components as Prisma.InputJsonValue } });
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

      components[input.itemKey] = held - input.quantity;
      if (components[input.itemKey]! <= 0) delete components[input.itemKey];
      await tx.roundPlayer.update({
        where: { id: roundPlayerId },
        data: { cashCents: player.cashCents - BigInt(feeCents), scavengedComponents: components as Prisma.InputJsonValue },
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
