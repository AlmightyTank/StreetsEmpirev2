import type { PrismaClient } from '@prisma/client';
import type { CasinoSeasonRecordDto, CasinoTournamentPageDto, CasinoTournamentStandingDto } from '@streets/shared';

type TournamentSeat = {
  roundPlayerId: string;
  stackCents: bigint;
  joinedAt: Date;
  table: { buyInCents: bigint };
  roundPlayer: { displayName: string };
};

export function casinoTournamentWeekWindow(now: Date): { startsAt: Date; endsAt: Date } {
  const day = (now.getUTCDay() + 6) % 7;
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  return { startsAt, endsAt: new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000) };
}

export function casinoTournamentReturnBps(netCents: bigint, buyInCents: bigint): number {
  if (buyInCents <= 0n) return 0;
  return Number((netCents * 10_000n) / buyInCents);
}

function cents(value: bigint): number {
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : 0;
}

function record(key: CasinoSeasonRecordDto['key'], label: string, displayName: string | null, value: number, detail: string): CasinoSeasonRecordDto {
  return { key, label, displayName, value, detail };
}

export const CasinoTournamentsService = {
  async page(prisma: PrismaClient, roundId: string, roundPlayerId: string, now = new Date()): Promise<CasinoTournamentPageDto> {
    const { startsAt, endsAt } = casinoTournamentWeekWindow(now);
    const seats = await prisma.casinoPokerSeat.findMany({
      where: {
        status: 'LEFT',
        table: { roundId },
        roundPlayer: { account: { isActive: true } },
      },
      select: {
        roundPlayerId: true,
        stackCents: true,
        joinedAt: true,
        table: { select: { buyInCents: true } },
        roundPlayer: { select: { displayName: true } },
      },
      orderBy: { joinedAt: 'desc' },
      take: 25_000,
    }) as TournamentSeat[];

    const weekly = new Map<string, { displayName: string; entries: number; buyIn: bigint; net: bigint }>();
    const seasonTotals = new Map<string, { displayName: string; entries: number; buyIn: bigint; net: bigint }>();
    let biggestCashout: { seat: TournamentSeat; net: bigint } | null = null;
    let bestReturn: { seat: TournamentSeat; bps: number } | null = null;

    for (const seat of seats) {
      const buyIn = seat.table.buyInCents;
      if (buyIn <= 0n) continue;
      const net = seat.stackCents - buyIn;
      const bps = casinoTournamentReturnBps(net, buyIn);
      const current = seasonTotals.get(seat.roundPlayerId) ?? { displayName: seat.roundPlayer.displayName, entries: 0, buyIn: 0n, net: 0n };
      current.entries += 1;
      current.buyIn += buyIn;
      current.net += net;
      seasonTotals.set(seat.roundPlayerId, current);

      if (net > 0n && (!biggestCashout || net > biggestCashout.net)) biggestCashout = { seat, net };
      if (!bestReturn || bps > bestReturn.bps) bestReturn = { seat, bps };

      if (seat.joinedAt >= startsAt && seat.joinedAt < endsAt) {
        const row = weekly.get(seat.roundPlayerId) ?? { displayName: seat.roundPlayer.displayName, entries: 0, buyIn: 0n, net: 0n };
        row.entries += 1;
        row.buyIn += buyIn;
        row.net += net;
        weekly.set(seat.roundPlayerId, row);
      }
    }

    const standings: CasinoTournamentStandingDto[] = [...weekly.entries()]
      .map(([id, row]) => ({
        id,
        displayName: row.displayName,
        entries: row.entries,
        buyInCents: cents(row.buyIn),
        netCents: cents(row.net),
        returnBps: casinoTournamentReturnBps(row.net, row.buyIn),
      }))
      .sort((a, b) => b.returnBps - a.returnBps || b.netCents - a.netCents || a.displayName.localeCompare(b.displayName))
      .slice(0, 20)
      .map(({ id, ...row }, index) => ({ place: index + 1, isYou: id === roundPlayerId, ...row }));

    const mostEntries = [...seasonTotals.values()].sort((a, b) => b.entries - a.entries)[0];
    const records: CasinoSeasonRecordDto[] = [
      record('most_entries', 'Most tournament entries', mostEntries?.displayName ?? null, mostEntries?.entries ?? 0, 'Completed multiplayer tables this season'),
      record('best_return', 'Best single-table return', bestReturn?.seat.roundPlayer.displayName ?? null, bestReturn?.bps ?? 0, bestReturn ? `${(bestReturn.bps / 100).toFixed(2)}% of the equal table buy-in` : 'No completed tables yet'),
      record('biggest_cashout', 'Biggest table cashout', biggestCashout?.seat.roundPlayer.displayName ?? null, biggestCashout ? cents(biggestCashout.net) : 0, biggestCashout ? 'Net chips above the equal table buy-in' : 'No winning cashouts yet'),
    ];

    return {
      available: true,
      weekStartsAt: startsAt.toISOString(),
      weekEndsAt: endsAt.toISOString(),
      serverTime: now.toISOString(),
      standings,
      yourEntries: seasonTotals.get(roundPlayerId)?.entries ?? 0,
      records,
    };
  },
};
