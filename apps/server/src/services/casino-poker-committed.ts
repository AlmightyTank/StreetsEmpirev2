import type { PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';

/**
 * Chips that left the casino bankroll for Poker and have not come back yet: the
 * buy-in of an unsettled solo hand, plus every multiplayer seat stack and that
 * seat's share of a live pot. Like committed Blackjack and Street Dice wagers,
 * they stay part of casino value and net worth until they return to the bankroll.
 */
export async function pokerCommittedCents(db: Db | PrismaClient, roundPlayerId: string): Promise<bigint> {
  const [solo, seats] = await Promise.all([
    db.casinoPokerHand.aggregate({ where: { roundPlayerId, status: 'ACTIVE' }, _sum: { buyInCents: true } }),
    db.casinoPokerSeat.findMany({
      where: { roundPlayerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } },
      select: { tableId: true, status: true, stackCents: true },
    }),
  ]);
  let total = solo._sum.buyInCents ?? 0n;
  for (const seat of seats) {
    total += seat.stackCents;
    if (seat.status !== 'PLAYING') continue;
    const hand = await db.casinoPokerTableHand.findFirst({
      where: { tableId: seat.tableId, status: 'ACTIVE' },
      orderBy: { handNo: 'desc' },
      select: { state: true },
    });
    const handSeats = (hand?.state as { seats?: Array<{ id?: unknown; contributionCents?: unknown }> } | null)?.seats;
    const contribution = Array.isArray(handSeats)
      ? handSeats.find((entry) => entry.id === roundPlayerId)?.contributionCents
      : undefined;
    if (typeof contribution === 'number' && Number.isSafeInteger(contribution) && contribution > 0) total += BigInt(contribution);
  }
  return total;
}
