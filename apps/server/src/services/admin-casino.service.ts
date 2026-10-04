import type { PrismaClient } from '@prisma/client';
import type { AdminCasinoDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';

const ACTION_KINDS = ['SLOT_SPIN', 'BLACKJACK', 'ROULETTE', 'STREET_DICE', 'POKER_BUY_IN', 'POKER_CASH_OUT', 'POKER_TABLE_BUY_IN', 'POKER_TABLE_REFUND'];
const RAPID_PLAY_THRESHOLD = 300;
const STALE_AFTER_MS = 60 * 60 * 1000;
const playerSelect = { select: { id: true, displayName: true } } as const;

function safeNumber(value: bigint | number | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isSafeInteger(result) ? result : 0;
}

export const AdminCasinoService = {
  async report(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminCasinoDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const inRound = { roundPlayer: { roundId } };

    const [ratings, ledgerRows, sessions, blackjack, dice, soloPoker, tableHands, tableSeats, actionCounts, flags] = await Promise.all([
      prisma.casinoRating.findMany({ where: inRound, select: { roundPlayerId: true, wageredCents: true, theoBasis: true, compsSpentCents: true, ratedWagers: true, vipWagers: true, jackpots: true } }),
      prisma.casinoLedgerEntry.groupBy({
        by: ['kind'], where: { ...inRound, createdAt: { gte: since } },
        _count: { _all: true }, _sum: { cashDeltaCents: true, walletChipDeltaCents: true, sessionChipDeltaCents: true },
      }),
      prisma.casinoSession.findMany({ where: { ...inRound, status: 'OPEN' }, select: { roundPlayerId: true, roundPlayer: playerSelect } }),
      prisma.casinoBlackjackHand.findMany({ where: { ...inRound, status: 'ACTIVE' }, select: { updatedAt: true, sessionId: true } }),
      prisma.casinoStreetDiceRound.findMany({ where: { ...inRound, status: 'ACTIVE' }, select: { updatedAt: true, sessionId: true } }),
      prisma.casinoPokerHand.findMany({ where: { ...inRound, status: 'ACTIVE' }, select: { updatedAt: true, sessionId: true } }),
      prisma.casinoPokerTableHand.findMany({ where: { status: 'ACTIVE', table: { roundId } }, select: { updatedAt: true } }),
      prisma.casinoPokerSeat.findMany({ where: { status: 'PLAYING', table: { roundId } }, select: { sessionId: true } }),
      prisma.casinoLedgerEntry.groupBy({
        by: ['roundPlayerId'], where: { ...inRound, kind: { in: ACTION_KINDS }, createdAt: { gte: lastHour } },
        _count: { _all: true }, _max: { createdAt: true },
      }),
      prisma.exploitFlag.findMany({
        where: {
          reviewedAt: null,
          route: { contains: '/casino' },
          OR: [{ roundId }, { roundId: null, lastSeenAt: { gte: since } }],
        },
        orderBy: { lastSeenAt: 'desc' }, take: 25,
      }),
    ]);

    const allActive = [...blackjack, ...dice, ...soloPoker, ...tableHands];
    const openByPlayer = new Map<string, { displayName: string; count: number }>();
    for (const session of sessions) {
      const row = openByPlayer.get(session.roundPlayerId) ?? { displayName: session.roundPlayer.displayName, count: 0 };
      row.count += 1;
      openByPlayer.set(session.roundPlayerId, row);
    }
    const duplicateOpenSessions = [...openByPlayer.entries()]
      .filter(([, row]) => row.count > 1)
      .map(([playerId, row]) => ({ playerId, ...row }));

    const linkedSessionIds = [...new Set([...blackjack, ...dice, ...soloPoker, ...tableSeats].map((row) => row.sessionId))];
    const linkedSessions = linkedSessionIds.length
      ? await prisma.casinoSession.findMany({ where: { id: { in: linkedSessionIds } }, select: { id: true, status: true } })
      : [];
    const linkedSessionStatus = new Map(linkedSessions.map((row) => [row.id, row.status]));
    const busyPlayers = actionCounts.filter((row) => row._count._all >= RAPID_PLAY_THRESHOLD);
    const busyPlayerIds = busyPlayers.map((row) => row.roundPlayerId);
    const busyPlayersById = new Map((busyPlayerIds.length
      ? await prisma.roundPlayer.findMany({ where: { id: { in: busyPlayerIds } }, select: { id: true, displayName: true } })
      : []).map((row) => [row.id, row.displayName]));

    const ratingSummary = ratings.reduce((sum, row) => ({
      wagered: sum.wagered + row.wageredCents,
      theo: sum.theo + row.theoBasis,
      comps: sum.comps + row.compsSpentCents,
      wagers: sum.wagers + row.ratedWagers,
      vip: sum.vip + row.vipWagers,
      jackpots: sum.jackpots + row.jackpots,
    }), { wagered: 0n, theo: 0n, comps: 0n, wagers: 0, vip: 0, jackpots: 0 });

    return {
      roundId,
      generatedAt: now.toISOString(),
      windowHours: 24,
      rating: {
        players: new Set(ratings.filter((row) => row.ratedWagers > 0).map((row) => row.roundPlayerId)).size,
        ratedWagers: ratingSummary.wagers,
        wageredCents: safeNumber(ratingSummary.wagered),
        theoCents: safeNumber(ratingSummary.theo / 10_000n),
        compsSpentCents: safeNumber(ratingSummary.comps),
        vipWagers: ratingSummary.vip,
        jackpots: ratingSummary.jackpots,
      },
      ledger: ledgerRows.map((row) => ({
        kind: row.kind,
        entries: row._count._all,
        cashDeltaCents: safeNumber(row._sum.cashDeltaCents),
        walletChipDeltaCents: safeNumber(row._sum.walletChipDeltaCents),
        sessionChipDeltaCents: safeNumber(row._sum.sessionChipDeltaCents),
      })),
      operations: {
        openSessions: sessions.length,
        duplicateOpenSessions,
        activeBlackjack: blackjack.length,
        activeDiceRounds: dice.length,
        activeSoloPoker: soloPoker.length,
        activeTableHands: tableHands.length,
        gamesOnClosedSessions: [...blackjack, ...dice, ...soloPoker, ...tableSeats]
          .filter((row) => linkedSessionStatus.get(row.sessionId) !== 'OPEN').length,
        staleGames: allActive.filter((row) => row.updatedAt.getTime() < now.getTime() - STALE_AFTER_MS).length,
      },
      rapidPlayThreshold: RAPID_PLAY_THRESHOLD,
      rapidPlay: busyPlayers.map((row) => ({
        playerId: row.roundPlayerId,
        displayName: busyPlayersById.get(row.roundPlayerId) ?? 'Unknown player',
        entries: row._count._all,
        lastAt: row._max.createdAt?.toISOString() ?? now.toISOString(),
      })),
      openCasinoFlags: flags.map((row) => ({
        id: row.id,
        kind: row.kind,
        severity: row.severity,
        playerId: row.roundPlayerId,
        message: row.message,
        occurrences: row.occurrences,
        lastAt: row.lastSeenAt.toISOString(),
      })),
    };
  },
};
