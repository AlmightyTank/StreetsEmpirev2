import type { Prisma, PrismaClient } from '@prisma/client';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { loadRulesetForRound } from '@streets/rules-engine';
import {
  SPORTSBOOK_LIMITS,
  SPORTSBOOK_ODDS_MAX_AGE_MINUTES,
  sportsbookStakeCheck,
  type SportsbookLimitsDto,
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
import { creditLegacySportsbookChips, creditSportsbookChips, debitSportsbookChips } from './casino.service.js';
import { createPlayerActivity } from './in-app-notification.service.js';
import { DEFAULT_SPORTSBOOK_PROVIDER_ID, sportsbookProviderName } from './sportsbook/sportsbook-providers.js';

export const SPORTSBOOK_LEAGUES = [
  { key: 'NFL', name: 'NFL' },
  { key: 'NBA', name: 'NBA' },
  { key: 'MLB', name: 'MLB' },
  { key: 'NHL', name: 'NHL' },
  { key: 'SOFTBALL', name: 'College Softball' },
  { key: 'MMA', name: 'MMA' },
] as const;

const ODDS_MAX_AGE_MS = SPORTSBOOK_ODDS_MAX_AGE_MINUTES * 60_000;
// Keep the player-facing slate close to what a person would actually scan at
// once. The feed can contain a full multi-day schedule, but the board should
// not turn into a schedule dump.
const PLAYER_BOARD_EVENT_LIMIT = 6;

export type JsonRecord = Record<string, unknown>;

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
  id: string; eventId: string; selection: string; oddsAmerican: number; stakeCents: bigint; payoutCents: bigint;
  status: string; createdAt: Date; settledAt: Date | null;
  event: { sport: string; homeTeam: string; awayTeam: string; startsAt: Date; status: string; homeScore: number | null; awayScore: number | null };
};

export function sportsbookTicketDto(bet: TicketRow): SportsbookBetDto {
  const status = bet.status as SportsbookBetStatus;
  const selection = bet.selection as SportsbookSelection;
  const stakeCents = Number(bet.stakeCents);
  const payoutCents = Number(bet.payoutCents);
  return {
    id: bet.id, eventId: bet.eventId, sport: bet.event.sport as SportsbookLeagueKey, homeTeam: bet.event.homeTeam, awayTeam: bet.event.awayTeam,
    startsAt: bet.event.startsAt.toISOString(), selection,
    pickTeam: selection === 'HOME' ? bet.event.homeTeam : bet.event.awayTeam,
    oddsAmerican: bet.oddsAmerican, stakeCents, payoutCents, status,
    eventStatus: bet.event.status as SportsbookEventStatus,
    homeScore: bet.event.homeScore, awayScore: bet.event.awayScore,
    returnCents: sportsbookReturnCents(status, stakeCents, payoutCents),
    createdAt: bet.createdAt.toISOString(), settledAt: bet.settledAt?.toISOString() ?? null,
  };
}

function sportsbookActivityPayload(input: {
  betId: string;
  eventId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: Date;
  selection: string;
  oddsAmerican: number;
  stakeCents: bigint;
  payoutCents: bigint;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  returnCents?: bigint;
}): Prisma.InputJsonObject {
  const pickTeam = input.selection === 'HOME' ? input.homeTeam : input.awayTeam;
  return {
    betId: input.betId,
    eventId: input.eventId,
    sport: input.sport,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    startsAt: input.startsAt.toISOString(),
    selection: input.selection,
    pickTeam,
    oddsAmerican: input.oddsAmerican,
    stakeCents: Number(input.stakeCents),
    payoutCents: Number(input.payoutCents),
    ...(input.status ? { status: input.status } : {}),
    ...(input.homeScore !== undefined ? { homeScore: input.homeScore } : {}),
    ...(input.awayScore !== undefined ? { awayScore: input.awayScore } : {}),
    ...(input.returnCents !== undefined ? { returnCents: Number(input.returnCents) } : {}),
  };
}

/**
 * 1.8.0-D. What a player already has riding, and (for a wager) what is already on this game and
 * on this side of it from every player. The daily window counts every ticket placed in the last
 * 24 hours, whatever happened to it since.
 */
async function sportsbookUsage(
  db: Db | PrismaClient,
  roundPlayerId: string,
  now: Date,
  wager?: { eventId: string; selection: string },
) {
  const [open, daily, game, side] = await Promise.all([
    db.sportsbookBet.aggregate({ where: { roundPlayerId, status: 'OPEN' }, _count: { _all: true }, _sum: { stakeCents: true } }),
    db.sportsbookBet.aggregate({ where: { roundPlayerId, createdAt: { gt: new Date(now.getTime() - 86_400_000) } }, _sum: { stakeCents: true } }),
    wager ? db.sportsbookBet.aggregate({ where: { roundPlayerId, eventId: wager.eventId, status: 'OPEN' }, _sum: { stakeCents: true } }) : null,
    wager ? db.sportsbookBet.aggregate({ where: { eventId: wager.eventId, selection: wager.selection, status: 'OPEN' }, _sum: { stakeCents: true, payoutCents: true } }) : null,
  ]);
  return {
    openStakeCents: Number(open._sum.stakeCents ?? 0n),
    openTickets: open._count._all,
    dailyStakeCents: Number(daily._sum.stakeCents ?? 0n),
    gameStakeCents: Number(game?._sum.stakeCents ?? 0n),
    sideLiabilityCents: Number((side?._sum.payoutCents ?? 0n) - (side?._sum.stakeCents ?? 0n)),
  };
}

/** 1.8.0-E. Who graded a result, for the market review's grading-accuracy figures. */
export type SportsbookSettledVia = 'FEED' | 'ADMIN_RECHECK' | 'ADMIN_RESOLUTION' | 'ADMIN_VOID';

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
  via: SportsbookSettledVia = 'FEED',
  provider = '',
): Promise<SportsbookSettlement | null> {
  await tx.$queryRaw`SELECT "id" FROM "SportsbookEvent" WHERE "id" = ${eventId} FOR UPDATE`;
  const event = await tx.sportsbookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.settledAt) return null;
  await tx.sportsbookEvent.update({ where: { id: eventId }, data: {
    status, homeScore, awayScore, settledAt: now, settledVia: via, settledProvider: provider,
    nextResultCheckAt: null, resultError: '', resultReviewReason: '', resultReviewAt: null,
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
    const changed = await tx.sportsbookBet.updateMany({ where: { id: ticket.id, status: 'OPEN' }, data: { status: ticketStatus, settledAt: now, settlementNotifiedAt: now } });
    if (!changed.count) continue;
    await createPlayerActivity(tx, ticket.roundPlayerId, 'SPORTSBOOK_TICKET_SETTLED', sportsbookActivityPayload({
      betId: ticket.id,
      eventId: ticket.eventId,
      sport: event.sport,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      startsAt: event.startsAt,
      selection: ticket.selection,
      oddsAmerican: ticket.oddsAmerican,
      stakeCents: ticket.stakeCents,
      payoutCents: ticket.payoutCents,
      status: ticketStatus,
      homeScore,
      awayScore,
      returnCents: credit,
    }));
    summary.tickets += 1;
    summary[ticketStatus === 'WON' ? 'won' : ticketStatus === 'LOST' ? 'lost' : ticketStatus === 'PUSH' ? 'push' : 'void'] += 1;
    if (credit > 0n) {
      const player = await tx.roundPlayer.findUnique({ where: { id: ticket.roundPlayerId }, include: { round: true } });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'A sportsbook ticket owner no longer exists.');
      const pickTeam = ticket.selection === 'HOME' ? event.homeTeam : event.awayTeam;
      if (ticket.casinoCityId) {
        await creditSportsbookChips(tx, {
          roundPlayerId: ticket.roundPlayerId,
          casinoSessionId: ticket.casinoSessionId,
          casinoCityId: ticket.casinoCityId,
          amountCents: credit,
          actionId: `sportsbook:settlement:${ticket.id}`,
          metadata: {
            betId: ticket.id,
            eventId: ticket.eventId,
            pickTeam,
            oddsAmerican: ticket.oddsAmerican,
            stakeCents: Number(ticket.stakeCents),
            returnCents: Number(credit),
            status: ticketStatus,
          },
        });
      } else {
        // Legacy tickets without an originating casino still settle as casino chips.
        await creditLegacySportsbookChips(tx, ticket.roundPlayerId, credit, `sportsbook:settlement:${ticket.id}`, {
          betId: ticket.id,
          eventId: ticket.eventId,
          pickTeam,
          oddsAmerican: ticket.oddsAmerican,
          stakeCents: Number(ticket.stakeCents),
          returnCents: Number(credit),
          status: ticketStatus,
          legacy: true,
        });
      }
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
  via: SportsbookSettledVia = 'FEED',
  provider = '',
): Promise<SportsbookSettlement | null> {
  return prisma.$transaction((tx) => settleSportsbookEventTx(tx, eventId, status, homeScore, awayScore, now, via, provider));
}

/** Safely retires every still-open event without deleting bets or financial history. */
export async function resetOpenSportsbookEvents(prisma: PrismaClient, now = new Date()): Promise<{ events: number; tickets: number; creditedCents: bigint }> {
  const events = await prisma.sportsbookEvent.findMany({ where: { settledAt: null }, select: { id: true } });
  let tickets = 0;
  let creditedCents = 0n;
  for (const event of events) {
    const settlement = await settleSportsbookEvent(prisma, event.id, 'VOID', null, null, now, 'ADMIN_VOID', 'internal');
    if (!settlement) continue;
    tickets += settlement.tickets;
    creditedCents += settlement.creditedCents;
  }
  return { events: events.length, tickets, creditedCents };
}

export const SportsbookService = {
  async notifyStartedGames(prisma: PrismaClient, now = new Date()): Promise<number> {
    const tickets = await prisma.sportsbookBet.findMany({
      where: { status: 'OPEN', startedNotifiedAt: null, event: { startsAt: { lte: now } } },
      include: { event: true },
      orderBy: [{ event: { startsAt: 'asc' } }, { createdAt: 'asc' }],
      take: 200,
    });
    let notified = 0;
    for (const ticket of tickets) {
      const changed = await prisma.$transaction(async (tx) => {
        const update = await tx.sportsbookBet.updateMany({
          where: { id: ticket.id, startedNotifiedAt: null, status: 'OPEN' },
          data: { startedNotifiedAt: now },
        });
        if (!update.count) return 0;
        await createPlayerActivity(tx, ticket.roundPlayerId, 'SPORTSBOOK_GAME_STARTED', sportsbookActivityPayload({
          betId: ticket.id,
          eventId: ticket.eventId,
          sport: ticket.event.sport,
          homeTeam: ticket.event.homeTeam,
          awayTeam: ticket.event.awayTeam,
          startsAt: ticket.event.startsAt,
          selection: ticket.selection,
          oddsAmerican: ticket.oddsAmerican,
          stakeCents: ticket.stakeCents,
          payoutCents: ticket.payoutCents,
          status: ticket.status,
        }));
        return 1;
      });
      notified += changed;
    }
    return notified;
  },

  async board(
    prisma: PrismaClient,
    options: { configured: boolean; pollMinutes: number },
    now = new Date(),
  ): Promise<SportsbookBoardDto> {
    const boardHorizon = new Date(now.getTime() + 3 * 86_400_000);
    const [events, providerStates, leagueProviderStates] = await Promise.all([
      prisma.sportsbookEvent.findMany({
        // 1.8.0-C: a pulled line stays listed (closed, with a reason) until it returns or starts.
        where: { startsAt: { gt: now, lt: boardHorizon }, status: { in: ['PRE', 'PULLED'] } },
        // Show only the next few games across all leagues. This also keeps the
        // league filter counts meaningful instead of displaying a multi-day
        // schedule dump (the feed itself still stores every event).
        orderBy: [{ startsAt: 'asc' }, { sport: 'asc' }], take: PLAYER_BOARD_EVENT_LIMIT,
      }),
      prisma.sportsbookProviderState.findMany(),
      prisma.sportsbookLeagueProviderState.findMany(),
    ]);
    const providers = new Map(providerStates.map((state) => [state.id, state]));
    const leagueProviders = new Map(leagueProviderStates.map((state) => [state.league, state]));
    const rows = events.map((event) => ({
      id: event.id, sport: event.sport as SportsbookLeagueKey, homeTeam: event.homeTeam, awayTeam: event.awayTeam,
      startsAt: event.startsAt.toISOString(), oddsUpdatedAt: event.oddsUpdatedAt?.toISOString() ?? null,
      homeOdds: event.homeOdds, awayOdds: event.awayOdds, oddsProvider: event.oddsProvider,
      oddsProviderName: sportsbookProviderName(event.oddsProvider),
      lineState: sportsbookLineState(event, isSportsbookFeedFresh(providers.get(event.oddsProvider)?.lastPolledAt, now), now),
    }));
    const refreshedAt = providerStates.map((state) => state.lastPolledAt).filter((date): date is Date => date !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const fallbackLeagues = SPORTSBOOK_LEAGUES.flatMap(({ key }) => {
      const provider = leagueProviders.get(key)?.activeOddsProvider ?? DEFAULT_SPORTSBOOK_PROVIDER_ID;
      return provider === DEFAULT_SPORTSBOOK_PROVIDER_ID ? [] : [{ league: key, provider, providerName: sportsbookProviderName(provider) }];
    });
    const feedFresh = providerStates.some((state) => isSportsbookFeedFresh(state.lastPolledAt, now));
    return {
      enabled: feedFresh,
      refreshedAt: refreshedAt?.toISOString() ?? null,
      serverTime: now.toISOString(),
      feed: {
        status: sportsbookFeedStatus({ configured: options.configured, lastPolledAt: refreshedAt }, now),
        refreshedAt: refreshedAt?.toISOString() ?? null,
        pollMinutes: options.pollMinutes,
        oddsMaxAgeMinutes: SPORTSBOOK_ODDS_MAX_AGE_MINUTES,
        fallbacks: fallbackLeagues,
      },
      leagues: SPORTSBOOK_LEAGUES.map(({ key, name }) => {
        const activeProvider = leagueProviders.get(key)?.activeOddsProvider ?? DEFAULT_SPORTSBOOK_PROVIDER_ID;
        return {
          key, name, activeProvider, activeProviderName: sportsbookProviderName(activeProvider),
          isFallback: activeProvider !== DEFAULT_SPORTSBOOK_PROVIDER_ID,
          eventCount: rows.filter((event) => event.sport === key).length,
          openCount: rows.filter((event) => event.sport === key && event.lineState === 'OPEN').length,
        };
      }),
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
      // 1.8.0-D: game row first, then the player, the same order settlement takes them, so a wager
      // and a settlement can never deadlock. The game lock also serialises the per-side book limit.
      await tx.$queryRaw`SELECT "id" FROM "SportsbookEvent" WHERE "id" = ${input.eventId} FOR UPDATE`;
      await lockRoundPlayer(tx, roundPlayerId);
      const replay = await tx.sportsbookBet.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } } });
      if (replay) {
        if (replay.eventId !== input.eventId || replay.selection !== input.selection || replay.stakeCents !== stake) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another sportsbook wager.');
        }
        return { bet: { id: replay.id, status: replay.status, stakeCents: Number(replay.stakeCents), payoutCents: Number(replay.payoutCents), oddsAmerican: replay.oddsAmerican }, replayed: true };
      }
      const casinoReplay = await tx.casinoLedgerEntry.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
        select: { id: true },
      });
      if (casinoReplay) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another casino action.');
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { round: true } });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      const ruleset = loadRulesetForRound(player.round);
      // 1.8.0-E: the sportsbook and its limits are pinned to the round's ruleset.
      const book = ruleset.casino?.enabled ? ruleset.casino.sportsbook : undefined;
      if (!book) throw AppError.conflict('SPORTSBOOK_CLOSED', 'Sports betting is not part of this round\'s rules.');
      const event = await tx.sportsbookEvent.findUnique({ where: { id: input.eventId } });
      if (event?.status === 'PULLED' && event.startsAt > now) throw AppError.conflict('SPORTSBOOK_LINE_PULLED', 'The book took this line down. Try another game.');
      if (!event || event.status !== 'PRE' || event.startsAt <= now) throw AppError.conflict('SPORTSBOOK_CLOSED', 'That game is no longer open for betting.');
      if (!isSportsbookBettingOpen(event, now)) throw AppError.conflict('SPORTSBOOK_STALE_ODDS', 'The line is being refreshed. Try again shortly.');
      const providerState = await tx.sportsbookProviderState.findUnique({ where: { id: event.oddsProvider } });
      if (!isSportsbookFeedFresh(providerState?.lastPolledAt, now)) {
        throw AppError.conflict('SPORTSBOOK_STALE_ODDS', 'The odds feed is temporarily unavailable. Try again shortly.');
      }
      const odds = input.selection === 'HOME' ? event.homeOdds : event.awayOdds;
      if (odds === null || odds === undefined) throw AppError.conflict('SPORTSBOOK_LINE_UNAVAILABLE', 'That side does not have an available moneyline.');
      // 1.8.0-B: never take a ticket at a price the player did not see on their slip.
      if (input.expectedOdds !== undefined && input.expectedOdds !== odds) {
        throw AppError.conflict('SPORTSBOOK_ODDS_CHANGED', `The line moved to ${odds > 0 ? '+' + odds : odds}. Review the new price and place the ticket again.`);
      }
      const usage = await sportsbookUsage(tx, roundPlayerId, now, { eventId: event.id, selection: input.selection });
      // The open casino bankroll is checked by the debit below under the player lock.
      const breach = sportsbookStakeCheck(input.stakeCents, odds, book.limits, { ...usage, bankrollCents: Number.MAX_SAFE_INTEGER });
      if (breach) throw AppError.conflict(breach.code, breach.message);
      const payout = americanPayout(stake, odds);
      const pickTeam = input.selection === 'HOME' ? event.homeTeam : event.awayTeam;
      const source = await debitSportsbookChips(tx, player.id, ruleset, stake, input.actionId, {
        eventId: event.id,
        pickTeam,
        oddsAmerican: odds,
        stakeCents: input.stakeCents,
        payoutCents: Number(payout),
      }, now);
      const bet = await tx.sportsbookBet.create({ data: {
        roundPlayerId, eventId: event.id, actionId: input.actionId, selection: input.selection,
        oddsAmerican: odds, oddsProvider: event.oddsProvider, stakeCents: stake, payoutCents: payout, createdAt: now,
        casinoSessionId: source.casinoSessionId, casinoCityId: source.casinoCityId,
      } });
      // This transaction only moves casino chips and writes a ticket; it never reads or changes turns.
      return { bet: { id: bet.id, status: bet.status, stakeCents: Number(bet.stakeCents), payoutCents: Number(bet.payoutCents), oddsAmerican: bet.oddsAmerican }, replayed: false };
    });
  },

  /** 1.8.0-D. The limits and what this player has used of them, for the bet slip. */
  async limits(prisma: PrismaClient, roundPlayerId: string, now = new Date()): Promise<SportsbookLimitsDto> {
    const [player, usage] = await Promise.all([
      prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { round: true } }),
      sportsbookUsage(prisma, roundPlayerId, now),
    ]);
    const ruleset = player ? loadRulesetForRound(player.round) : null;
    const book = ruleset?.casino?.enabled ? ruleset.casino.sportsbook : undefined;
    return {
      available: Boolean(book),
      // A round without the sportsbook still shows its tickets; the current limits are only for display.
      limits: book?.limits ?? SPORTSBOOK_LIMITS,
      openStakeCents: usage.openStakeCents, openTickets: usage.openTickets, dailyStakeCents: usage.dailyStakeCents,
    };
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
