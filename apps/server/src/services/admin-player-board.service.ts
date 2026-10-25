import type { Prisma, PrismaClient } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import type { AdminPlayerBoardDto, AdminPlayerBoardEventDto, AdminPlayerRefDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { itemName } from './player-board.service.js';
import { jsonObject } from './scavenging.service.js';

/**
 * The Board H. The staff ledger: every post, fill, cancel and expiry in a window, the cash that
 * moved and the cash the Board deleted, and a check that each seller's escrow column matches their
 * open and unreturned offers. Nothing here changes game state.
 */

const playerRef = { select: { id: true, displayName: true, publicPimpId: true, accountId: true } } as const;
type PlayerRow = { id: string; displayName: string; publicPimpId: number; accountId: string };
const ref = (row: PlayerRow): AdminPlayerRefDto => ({ id: row.id, displayName: row.displayName, publicPimpId: row.publicPimpId, accountId: row.accountId });

/** Ledger lines returned at once, newest first. */
const EVENT_LIMIT = 300;

function basket(items: Prisma.JsonValue | null, times: number, ruleset: Ruleset): string | null {
  const lines = Object.entries(jsonObject(items, {})).map(([key, quantity]) => `${quantity * times} ${itemName(key, ruleset)}`);
  return lines.length ? lines.join(', ') : null;
}

export const AdminPlayerBoardService = {
  async report(prisma: PrismaClient, roundId: string, hours = 24, now = new Date()): Promise<AdminPlayerBoardDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const since = new Date(now.getTime() - hours * 3_600_000);
    const offerFields = { include: { seller: playerRef } } as const;

    const [posted, closed, fills, openOffers, held, escrows] = await Promise.all([
      prisma.playerBoardOffer.findMany({ where: { roundId, postedAt: { gte: since } }, orderBy: { postedAt: 'desc' }, take: EVENT_LIMIT, ...offerFields }),
      prisma.playerBoardOffer.findMany({ where: { roundId, status: { in: ['CANCELLED', 'EXPIRED'] }, closedAt: { gte: since } }, orderBy: { closedAt: 'desc' }, take: EVENT_LIMIT, ...offerFields }),
      prisma.playerBoardFill.findMany({ where: { offer: { roundId }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: EVENT_LIMIT, include: { buyer: playerRef, offer: offerFields } }),
      prisma.playerBoardOffer.count({ where: { roundId, status: 'OPEN' } }),
      prisma.playerBoardOffer.findMany({ where: { roundId, OR: [{ status: 'OPEN' }, { status: 'EXPIRED', returnedAt: null }] }, select: { sellerId: true, itemKey: true, remainingQuantity: true } }),
      prisma.roundPlayer.findMany({ where: { roundId, NOT: { playerBoardEscrow: { equals: {} } } }, select: { ...playerRef.select, playerBoardEscrow: true } }),
    ]);

    const events: AdminPlayerBoardEventDto[] = [
      ...posted.map((offer): AdminPlayerBoardEventDto => ({
        id: `post:${offer.id}`, kind: 'POST', at: offer.postedAt.toISOString(), offerId: offer.id,
        seller: ref(offer.seller), buyer: null, itemKey: offer.itemKey, item: itemName(offer.itemKey, ruleset),
        quantity: offer.quantity, priceKind: offer.priceKind, unitPriceCents: offer.unitPriceCents,
        ask: offer.priceKind === 'BARTER' ? `${basket(offer.askItems, 1, ruleset)} per ${offer.lotSize}` : null,
        paidCents: 0, proceedsCents: 0, deletedCents: offer.feeCents + offer.listingTaxCents,
      })),
      ...fills.map((fill): AdminPlayerBoardEventDto => ({
        id: `fill:${fill.id}`, kind: 'FILL', at: fill.createdAt.toISOString(), offerId: fill.offerId,
        seller: ref(fill.offer.seller), buyer: fill.buyer ? ref(fill.buyer) : null,
        itemKey: fill.offer.itemKey, item: itemName(fill.offer.itemKey, ruleset),
        quantity: fill.quantity, priceKind: fill.offer.priceKind, unitPriceCents: fill.offer.unitPriceCents,
        ask: fill.offer.priceKind === 'BARTER' ? basket(fill.offer.askItems, fill.quantity / fill.offer.lotSize, ruleset) : null,
        paidCents: fill.paidCents, proceedsCents: fill.proceedsCents, deletedCents: fill.paidCents - fill.proceedsCents,
      })),
      ...closed.map((offer): AdminPlayerBoardEventDto => ({
        id: `close:${offer.id}`, kind: offer.status === 'CANCELLED' ? 'CANCEL' : 'EXPIRE', at: offer.closedAt!.toISOString(), offerId: offer.id,
        seller: ref(offer.seller), buyer: null, itemKey: offer.itemKey, item: itemName(offer.itemKey, ruleset),
        quantity: offer.remainingQuantity, priceKind: offer.priceKind, unitPriceCents: offer.unitPriceCents,
        ask: null, paidCents: 0, proceedsCents: 0, deletedCents: 0,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));

    // Escrow reconciliation: the column must equal open plus expired-but-unreturned offers, per item.
    const owed = new Map<string, number>();
    for (const offer of held) owed.set(`${offer.sellerId}:${offer.itemKey}`, (owed.get(`${offer.sellerId}:${offer.itemKey}`) ?? 0) + offer.remainingQuantity);
    const players = new Map(escrows.map((row) => [row.id, row]));
    const missing = [...new Set(held.map((offer) => offer.sellerId))].filter((id) => !players.has(id));
    if (missing.length) {
      for (const row of await prisma.roundPlayer.findMany({ where: { id: { in: missing } }, select: { ...playerRef.select, playerBoardEscrow: true } })) players.set(row.id, row);
    }
    const problems: AdminPlayerBoardDto['problems'] = [];
    for (const player of players.values()) {
      const escrow = jsonObject(player.playerBoardEscrow, {});
      const keys = new Set([...Object.keys(escrow), ...held.filter((offer) => offer.sellerId === player.id).map((offer) => offer.itemKey)]);
      for (const key of keys) {
        const offers = owed.get(`${player.id}:${key}`) ?? 0;
        if ((escrow[key] ?? 0) !== offers) problems.push({ player: ref(player), itemKey: key, escrow: escrow[key] ?? 0, offers });
      }
    }

    const count = (kind: AdminPlayerBoardEventDto['kind']) => events.filter((row) => row.kind === kind).length;
    const sum = (pick: (row: AdminPlayerBoardEventDto) => number) => events.reduce((total, row) => total + pick(row), 0);
    return {
      roundId,
      enabled: ruleset.playerBoard?.enabled === true,
      generatedAt: now.toISOString(),
      windowHours: hours,
      totals: {
        posts: count('POST'),
        fills: count('FILL'),
        cancels: count('CANCEL'),
        expiries: count('EXPIRE'),
        openOffers,
        unitsSold: sum((row) => (row.kind === 'FILL' ? row.quantity : 0)),
        paidCents: sum((row) => row.paidCents),
        proceedsCents: sum((row) => row.proceedsCents),
        deletedCents: sum((row) => row.deletedCents),
      },
      events: events.slice(0, EVENT_LIMIT),
      problems,
    };
  },
};
