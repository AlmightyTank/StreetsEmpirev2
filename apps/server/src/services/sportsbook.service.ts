import type { PrismaClient } from '@prisma/client';
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

/** The affiliate (sportsbook) whose moneylines the feed requests. */
export const SPORTSBOOK_AFFILIATE_ID = '3';

/** "Philadelphia" + "Eagles": TheRundown v2 splits the city from the mascot; the board shows both. */
function teamDisplayName(team: JsonRecord): string | null {
  const name = str(team.name) ?? str(team.team_name);
  if (!name) return null;
  const mascot = str(team.mascot);
  return mascot && !name.toLowerCase().includes(mascot.toLowerCase()) ? `${name} ${mascot}` : name;
}

/** Away and home team records: by flag, else TheRundown's order (away first, home second). */
export function eventTeams(event: ProviderEvent): { home: JsonRecord; away: JsonRecord } | null {
  if (!Array.isArray(event.teams)) return null;
  const teams = event.teams.map(record).filter((team): team is JsonRecord => Boolean(team));
  let away = teams.find((team) => team.is_away === true) ?? teams.find((team) => team.is_home === false);
  let home = teams.find((team) => team.is_home === true) ?? teams.find((team) => team.is_away === false);
  if (!away && !home && teams.length === 2) [away, home] = teams;
  if (!home || !away || home === away || !teamDisplayName(home) || !teamDisplayName(away)) return null;
  return { home, away };
}

const teamIds = (team: JsonRecord) => [team.team_id, team.id, team.team_normalized_id]
  .filter((value) => typeof value === 'string' || typeof value === 'number').map(String);
const teamNames = (team: JsonRecord) => [str(team.name), str(team.team_name), teamDisplayName(team), str(team.abbreviation)]
  .filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());

/** Which team a market participant is: by team id first, then by an exact name, full name or abbreviation. */
function participantSide(participant: JsonRecord, teams: { home: JsonRecord; away: JsonRecord }): 'HOME' | 'AWAY' | null {
  const id = participant.team_id ?? participant.id;
  if (typeof id === 'string' || typeof id === 'number') {
    if (teamIds(teams.home).includes(String(id))) return 'HOME';
    if (teamIds(teams.away).includes(String(id))) return 'AWAY';
  }
  const label = (str(participant.name) ?? str(participant.participant_name) ?? str(participant.team_name) ?? str(participant.label))?.toLowerCase();
  if (!label) return null;
  if (teamNames(teams.home).includes(label)) return 'HOME';
  if (teamNames(teams.away).includes(label)) return 'AWAY';
  return null;
}

/** A whole-number American price; TheRundown sends 0.0001 for a line that is off the board. */
function americanPrice(value: unknown): number | null {
  const price = num(value);
  return price !== null && Number.isInteger(price) && Math.abs(price) >= 100 ? price : null;
}

/**
 * One participant's moneyline. TheRundown v2 nests it as `lines[].prices[affiliateId].price` with an
 * `is_main_line` flag; older payloads put `price` on the participant. If our affiliate lists the line
 * at all, only its price counts, so a line it has taken off the board stays off.
 */
export function participantPrice(participant: JsonRecord, affiliateId = SPORTSBOOK_AFFILIATE_ID): number | null {
  const flat = americanPrice(participant.price) ?? americanPrice(participant.odds) ?? americanPrice(participant.american_odds);
  if (flat !== null) return flat;
  const offers: Array<{ price: number | null; ours: boolean; main: boolean }> = [];
  for (const rawLine of Array.isArray(participant.lines) ? participant.lines : []) {
    const line = record(rawLine);
    if (!line) continue;
    const entries: Array<[string, unknown]> = Array.isArray(line.prices)
      ? line.prices.map((entry): [string, unknown] => [String(record(entry)?.affiliate_id ?? ''), entry])
      : Object.entries(record(line.prices) ?? {});
    for (const [key, raw] of entries) {
      const entry = record(raw);
      const price = entry ? americanPrice(entry.price) ?? americanPrice(entry.price_american) ?? americanPrice(entry.american) : americanPrice(raw);
      offers.push({ price, ours: key === affiliateId || String(entry?.affiliate_id ?? '') === affiliateId, main: entry?.is_main_line !== false });
    }
  }
  const pool = offers.some((offer) => offer.ours) ? offers.filter((offer) => offer.ours) : offers;
  const priced = pool.filter((offer) => offer.price !== null).sort((a, b) => Number(b.main) - Number(a.main));
  return priced[0]?.price ?? null;
}

export function eventOdds(event: ProviderEvent): { home: string; away: string; homeOdds: number | null; awayOdds: number | null } | null {
  const teams = eventTeams(event);
  if (!teams || !Array.isArray(event.markets)) return null;
  // The full-game moneyline (period 0 or none), not a period or half line.
  const moneylines = event.markets.map(record).filter((item): item is JsonRecord => Boolean(item && (num(item.market_id) === 1 || str(item.name)?.toLowerCase() === 'moneyline')));
  const market = moneylines.find((item) => (num(item.period_id) ?? 0) === 0) ?? moneylines[0];
  if (!market || !Array.isArray(market.participants)) return null;
  let homeOdds: number | null = null;
  let awayOdds: number | null = null;
  for (const raw of market.participants) {
    const participant = record(raw);
    if (!participant) continue;
    const side = participantSide(participant, teams);
    if (side === 'HOME') homeOdds ??= participantPrice(participant);
    if (side === 'AWAY') awayOdds ??= participantPrice(participant);
  }
  return { home: teamDisplayName(teams.home)!, away: teamDisplayName(teams.away)!, homeOdds, awayOdds };
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
export type SportsbookSettledVia = 'FEED' | 'ADMIN_RECHECK' | 'ADMIN_VOID';

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
): Promise<SportsbookSettlement | null> {
  await tx.$queryRaw`SELECT "id" FROM "SportsbookEvent" WHERE "id" = ${eventId} FOR UPDATE`;
  const event = await tx.sportsbookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.settledAt) return null;
  await tx.sportsbookEvent.update({ where: { id: eventId }, data: {
    status, homeScore, awayScore, settledAt: now, settledVia: via, nextResultCheckAt: null, resultError: '',
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
): Promise<SportsbookSettlement | null> {
  return prisma.$transaction((tx) => settleSportsbookEventTx(tx, eventId, status, homeScore, awayScore, now, via));
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
      const providerState = await tx.sportsbookProviderState.findUnique({ where: { id: 'therundown' } });
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
        oddsAmerican: odds, stakeCents: stake, payoutCents: payout, createdAt: now,
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
