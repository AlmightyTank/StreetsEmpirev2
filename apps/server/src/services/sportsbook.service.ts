import type { PrismaClient } from '@prisma/client';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { loadRulesetForRound } from '@streets/rules-engine';
import {
  SPORTSBOOK_MAX_STAKE_CENTS,
  SPORTSBOOK_MIN_STAKE_CENTS,
  SPORTSBOOK_ODDS_MAX_AGE_MINUTES,
  sportsbookReturnCents,
  type SportsbookBetDto,
  type SportsbookBetStatus,
  type SportsbookBoardDto,
  type SportsbookEventStatus,
  type SportsbookFeedStatus,
  type SportsbookLeagueKey,
  type SportsbookLineState,
  type SportsbookSelection,
  type SportsbookTicketsDto,
} from '@streets/shared';
import { moveSportsbookCash } from './casino.service.js';

export const SPORTSBOOK_LEAGUES = [
  { key: 'NFL', name: 'NFL', sportId: 2 },
  { key: 'NBA', name: 'NBA', sportId: 4 },
  { key: 'MLB', name: 'MLB', sportId: 3 },
  { key: 'NHL', name: 'NHL', sportId: 6 },
] as const;

const ODDS_MAX_AGE_MS = SPORTSBOOK_ODDS_MAX_AGE_MINUTES * 60_000;

export type JsonRecord = Record<string, unknown>;
export type ProviderEvent = {
  event_id?: unknown;
  starts_at?: unknown;
  event_date?: unknown;
  teams?: unknown;
  markets?: unknown;
  score?: unknown;
  status?: unknown;
  event_status?: unknown;
  is_live?: unknown;
  live?: unknown;
  is_final?: unknown;
  final?: unknown;
};

export function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function num(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function eventOdds(event: ProviderEvent): { home: string; away: string; homeOdds: number | null; awayOdds: number | null } | null {
  if (!Array.isArray(event.teams) || !Array.isArray(event.markets)) return null;
  const teams = event.teams.map(record).filter((team): team is JsonRecord => Boolean(team));
  const home = teams.find((team) => team.is_away === false || team.is_home === true);
  const away = teams.find((team) => team.is_away === true);
  const homeName = home ? str(home.name) : null;
  const awayName = away ? str(away.name) : null;
  if (!homeName || !awayName) return null;
  const market = event.markets.map(record).find((item) => item && (num(item.market_id) === 1 || str(item.name)?.toLowerCase() === 'moneyline'));
  if (!market || !Array.isArray(market.participants)) return null;
  let homeOdds: number | null = null;
  let awayOdds: number | null = null;
  for (const raw of market.participants) {
    const participant = record(raw);
    if (!participant) continue;
    const label = str(participant.name) ?? str(participant.participant_name) ?? str(participant.team_name) ?? str(participant.label);
    const price = num(participant.price) ?? num(participant.odds) ?? num(participant.american_odds);
    if (!label || price === null || !Number.isInteger(price) || Math.abs(price) < 100) continue;
    const normalized = label.toLowerCase();
    if (normalized === homeName.toLowerCase()) homeOdds = price;
    if (normalized === awayName.toLowerCase()) awayOdds = price;
  }
  return { home: homeName, away: awayName, homeOdds, awayOdds };
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isSameQuotaWindow(first: Date, second: Date, period: string): boolean {
  if (period.toLowerCase().includes('month')) return first.toISOString().slice(0, 7) === second.toISOString().slice(0, 7);
  return dateKey(first) === dateKey(second);
}

export function americanPayout(stake: bigint, odds: number): bigint {
  const profit = odds > 0
    ? (stake * BigInt(odds) + 50n) / 100n
    : (stake * 100n + BigInt(Math.abs(odds)) / 2n) / BigInt(Math.abs(odds));
  return stake + profit;
}

export function isSportsbookBettingOpen(
  event: { status: string; startsAt: Date; oddsUpdatedAt: Date | null },
  now = new Date(),
): boolean {
  return event.status === 'PRE'
    && event.startsAt.getTime() > now.getTime()
    && Boolean(event.oddsUpdatedAt && now.getTime() - event.oddsUpdatedAt.getTime() <= ODDS_MAX_AGE_MS);
}

/** Whether the shared snapshot is recent enough to take tickets at all. */
export function isSportsbookFeedFresh(lastPolledAt: Date | null | undefined, now = new Date()): boolean {
  return Boolean(lastPolledAt && now.getTime() - lastPolledAt.getTime() <= ODDS_MAX_AGE_MS);
}

export function sportsbookFeedStatus(
  input: { configured: boolean; lastPolledAt: Date | null | undefined },
  now = new Date(),
): SportsbookFeedStatus {
  if (isSportsbookFeedFresh(input.lastPolledAt, now)) return 'FRESH';
  if (!input.configured) return 'OFF';
  return input.lastPolledAt ? 'STALE' : 'WAITING';
}

/**
 * 1.8.0-B. The board explains a closed line with the same checks `placeBet` enforces, so a
 * line shown as OPEN is one the server will accept. A stale feed is reported ahead of a stale
 * line because it is the reason every line went stale together.
 */
export function sportsbookLineState(
  event: { status: string; startsAt: Date; oddsUpdatedAt: Date | null; homeOdds: number | null; awayOdds: number | null },
  feedFresh: boolean,
  now = new Date(),
): SportsbookLineState {
  if (event.startsAt.getTime() <= now.getTime() || (event.status !== 'PRE' && event.status !== 'PULLED')) return 'STARTED';
  if (event.status === 'PULLED') return 'PULLED';
  if (!feedFresh) return 'FEED_UNAVAILABLE';
  if (!isSportsbookBettingOpen(event, now)) return 'STALE_ODDS';
  if (event.homeOdds === null && event.awayOdds === null) return 'NO_LINE';
  return 'OPEN';
}

type TicketRow = {
  id: string; selection: string; oddsAmerican: number; stakeCents: bigint; payoutCents: bigint;
  status: string; createdAt: Date; settledAt: Date | null;
  event: { sport: string; homeTeam: string; awayTeam: string; startsAt: Date; status: string; homeScore: number | null; awayScore: number | null };
};

export function sportsbookTicketDto(bet: TicketRow): SportsbookBetDto {
  const status = bet.status as SportsbookBetStatus;
  const selection = bet.selection as SportsbookSelection;
  const stakeCents = Number(bet.stakeCents);
  const payoutCents = Number(bet.payoutCents);
  return {
    id: bet.id, sport: bet.event.sport as SportsbookLeagueKey, homeTeam: bet.event.homeTeam, awayTeam: bet.event.awayTeam,
    startsAt: bet.event.startsAt.toISOString(), selection,
    pickTeam: selection === 'HOME' ? bet.event.homeTeam : bet.event.awayTeam,
    oddsAmerican: bet.oddsAmerican, stakeCents, payoutCents, status,
    eventStatus: bet.event.status as SportsbookEventStatus,
    homeScore: bet.event.homeScore, awayScore: bet.event.awayScore,
    returnCents: sportsbookReturnCents(status, stakeCents, payoutCents),
    createdAt: bet.createdAt.toISOString(), settledAt: bet.settledAt?.toISOString() ?? null,
  };
}

export interface SportsbookSettlement {
  tickets: number;
  won: number;
  lost: number;
  push: number;
  void: number;
  creditedCents: bigint;
}

/**
 * Settles one event and every open ticket on it, inside the caller's transaction. The event row
 * lock plus `settledAt` make this exactly-once: a second caller (the poller, an admin recheck or
 * an admin void racing it) waits on the lock, then sees the event settled and returns null.
 */
export async function settleSportsbookEventTx(
  tx: Db,
  eventId: string,
  status: 'FINAL' | 'VOID',
  homeScore: number | null,
  awayScore: number | null,
  now: Date,
): Promise<SportsbookSettlement | null> {
  await tx.$queryRaw`SELECT "id" FROM "SportsbookEvent" WHERE "id" = ${eventId} FOR UPDATE`;
  const event = await tx.sportsbookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.settledAt) return null;
  await tx.sportsbookEvent.update({ where: { id: eventId }, data: {
    status, homeScore, awayScore, settledAt: now, nextResultCheckAt: null, resultError: '',
  } });
  const summary: SportsbookSettlement = { tickets: 0, won: 0, lost: 0, push: 0, void: 0, creditedCents: 0n };
  const tickets = await tx.sportsbookBet.findMany({ where: { eventId, status: 'OPEN' } });
  for (const ticket of tickets) {
    await lockRoundPlayer(tx, ticket.roundPlayerId);
    let ticketStatus: 'WON' | 'LOST' | 'PUSH' | 'VOID';
    let credit = 0n;
    if (status === 'VOID') {
      ticketStatus = 'VOID';
      credit = ticket.stakeCents;
    } else if (homeScore === awayScore) {
      ticketStatus = 'PUSH';
      credit = ticket.stakeCents;
    } else if ((ticket.selection === 'HOME' && homeScore! > awayScore!) || (ticket.selection === 'AWAY' && awayScore! > homeScore!)) {
      ticketStatus = 'WON';
      credit = ticket.payoutCents;
    } else {
      ticketStatus = 'LOST';
    }
    const changed = await tx.sportsbookBet.updateMany({ where: { id: ticket.id, status: 'OPEN' }, data: { status: ticketStatus, settledAt: now } });
    if (!changed.count) continue;
    summary.tickets += 1;
    summary[ticketStatus === 'WON' ? 'won' : ticketStatus === 'LOST' ? 'lost' : ticketStatus === 'PUSH' ? 'push' : 'void'] += 1;
    if (credit > 0n) {
      const player = await tx.roundPlayer.findUnique({ where: { id: ticket.roundPlayerId }, include: { round: true } });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'A sportsbook ticket owner no longer exists.');
      await moveSportsbookCash(tx, ticket.roundPlayerId, loadRulesetForRound(player.round), credit, now);
      summary.creditedCents += credit;
    }
  }
  return summary;
}

export function settleSportsbookEvent(
  prisma: PrismaClient,
  eventId: string,
  status: 'FINAL' | 'VOID',
  homeScore: number | null,
  awayScore: number | null,
  now: Date,
): Promise<SportsbookSettlement | null> {
  return prisma.$transaction((tx) => settleSportsbookEventTx(tx, eventId, status, homeScore, awayScore, now));
}

export const SportsbookService = {
  async board(
    prisma: PrismaClient,
    options: { configured: boolean; pollMinutes: number },
    now = new Date(),
  ): Promise<SportsbookBoardDto> {
    const [events, state] = await Promise.all([
      prisma.sportsbookEvent.findMany({
        // 1.8.0-C: a pulled line stays listed (closed, with a reason) until it returns or starts.
        where: { startsAt: { gt: now }, status: { in: ['PRE', 'PULLED'] } },
        // Today and tomorrow across four leagues; large enough that a league filter never hides games.
        orderBy: [{ startsAt: 'asc' }, { sport: 'asc' }], take: 300,
      }),
      prisma.sportsbookProviderState.findUnique({ where: { id: 'therundown' } }),
    ]);
    const feedFresh = isSportsbookFeedFresh(state?.lastPolledAt, now);
    const rows = events.map((event) => ({
      id: event.id, sport: event.sport as SportsbookLeagueKey, homeTeam: event.homeTeam, awayTeam: event.awayTeam,
      startsAt: event.startsAt.toISOString(), oddsUpdatedAt: event.oddsUpdatedAt?.toISOString() ?? null,
      homeOdds: event.homeOdds, awayOdds: event.awayOdds,
      lineState: sportsbookLineState(event, feedFresh, now),
    }));
    return {
      enabled: feedFresh,
      refreshedAt: state?.lastPolledAt?.toISOString() ?? null,
      serverTime: now.toISOString(),
      feed: {
        status: sportsbookFeedStatus({ configured: options.configured, lastPolledAt: state?.lastPolledAt }, now),
        refreshedAt: state?.lastPolledAt?.toISOString() ?? null,
        pollMinutes: options.pollMinutes,
        oddsMaxAgeMinutes: SPORTSBOOK_ODDS_MAX_AGE_MINUTES,
      },
      leagues: SPORTSBOOK_LEAGUES.map(({ key, name }) => ({
        key, name,
        eventCount: rows.filter((event) => event.sport === key).length,
        openCount: rows.filter((event) => event.sport === key && event.lineState === 'OPEN').length,
      })),
      events: rows,
    };
  },

  async placeBet(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: { eventId: string; selection: 'HOME' | 'AWAY'; stakeCents: number; actionId: string; expectedOdds?: number | undefined },
    now = new Date(),
  ) {
    const stake = BigInt(input.stakeCents);
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const replay = await tx.sportsbookBet.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } } });
      if (replay) {
        if (replay.eventId !== input.eventId || replay.selection !== input.selection || replay.stakeCents !== stake) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another sportsbook wager.');
        }
        return { bet: { id: replay.id, status: replay.status, stakeCents: Number(replay.stakeCents), payoutCents: Number(replay.payoutCents), oddsAmerican: replay.oddsAmerican }, replayed: true };
      }
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { round: true } });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      const ruleset = loadRulesetForRound(player.round);
      if (!ruleset.casino?.enabled) throw AppError.conflict('SPORTSBOOK_CLOSED', 'Sports betting is not open in this round.');
      const event = await tx.sportsbookEvent.findUnique({ where: { id: input.eventId } });
      if (event?.status === 'PULLED' && event.startsAt > now) throw AppError.conflict('SPORTSBOOK_LINE_PULLED', 'The book took this line down. Try another game.');
      if (!event || event.status !== 'PRE' || event.startsAt <= now) throw AppError.conflict('SPORTSBOOK_CLOSED', 'That game is no longer open for betting.');
      if (!isSportsbookBettingOpen(event, now)) throw AppError.conflict('SPORTSBOOK_STALE_ODDS', 'The line is being refreshed. Try again shortly.');
      const providerState = await tx.sportsbookProviderState.findUnique({ where: { id: 'therundown' } });
      if (!isSportsbookFeedFresh(providerState?.lastPolledAt, now)) {
        throw AppError.conflict('SPORTSBOOK_STALE_ODDS', 'The odds feed is temporarily unavailable. Try again shortly.');
      }
      if (stake < BigInt(SPORTSBOOK_MIN_STAKE_CENTS) || stake > BigInt(SPORTSBOOK_MAX_STAKE_CENTS)) throw AppError.badRequest('SPORTSBOOK_STAKE', 'Stake must be between $1 and $1,000,000.');
      const odds = input.selection === 'HOME' ? event.homeOdds : event.awayOdds;
      if (odds === null || odds === undefined) throw AppError.conflict('SPORTSBOOK_LINE_UNAVAILABLE', 'That side does not have an available moneyline.');
      // 1.8.0-B: never take a ticket at a price the player did not see on their slip.
      if (input.expectedOdds !== undefined && input.expectedOdds !== odds) {
        throw AppError.conflict('SPORTSBOOK_ODDS_CHANGED', `The line moved to ${odds > 0 ? '+' + odds : odds}. Review the new price and place the ticket again.`);
      }
      const payout = americanPayout(stake, odds);
      await moveSportsbookCash(tx, player.id, ruleset, -stake, now);
      const bet = await tx.sportsbookBet.create({ data: {
        roundPlayerId, eventId: event.id, actionId: input.actionId, selection: input.selection,
        oddsAmerican: odds, stakeCents: stake, payoutCents: payout,
      } });
      // This transaction only moves game cash and writes a ticket; it never reads or changes turns.
      return { bet: { id: bet.id, status: bet.status, stakeCents: Number(bet.stakeCents), payoutCents: Number(bet.payoutCents), oddsAmerican: bet.oddsAmerican }, replayed: false };
    });
  },

  /** Every open ticket plus recent settled history and a lifetime record for the player. */
  async tickets(prisma: PrismaClient, roundPlayerId: string): Promise<SportsbookTicketsDto> {
    const [open, settled, totals] = await Promise.all([
      prisma.sportsbookBet.findMany({
        where: { roundPlayerId, status: 'OPEN' }, include: { event: true },
        orderBy: [{ event: { startsAt: 'asc' } }, { createdAt: 'asc' }], take: 100,
      }),
      prisma.sportsbookBet.findMany({
        where: { roundPlayerId, status: { not: 'OPEN' } }, include: { event: true },
        orderBy: [{ settledAt: 'desc' }, { createdAt: 'desc' }], take: 25,
      }),
      prisma.sportsbookBet.groupBy({
        by: ['status'], where: { roundPlayerId },
        _count: { _all: true }, _sum: { stakeCents: true, payoutCents: true },
      }),
    ]);
    const total = (status: SportsbookBetStatus) => totals.find((row) => row.status === status);
    const count = (status: SportsbookBetStatus) => total(status)?._count._all ?? 0;
    const sum = (status: SportsbookBetStatus, field: 'stakeCents' | 'payoutCents') => Number(total(status)?._sum[field] ?? 0n);
    return {
      open: open.map(sportsbookTicketDto),
      settled: settled.map(sportsbookTicketDto),
      summary: {
        openCount: count('OPEN'),
        openStakeCents: sum('OPEN', 'stakeCents'),
        openPayoutCents: sum('OPEN', 'payoutCents'),
        won: count('WON'), lost: count('LOST'), push: count('PUSH'), void: count('VOID'),
        netCents: sum('WON', 'payoutCents') - sum('WON', 'stakeCents') - sum('LOST', 'stakeCents'),
      },
    };
  },
};
