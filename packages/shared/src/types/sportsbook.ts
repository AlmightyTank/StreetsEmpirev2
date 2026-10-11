export type SportsbookLeagueKey = 'NFL' | 'NBA' | 'MLB' | 'NHL';
export type SportsbookSelection = 'HOME' | 'AWAY';
export type SportsbookBetStatus = 'OPEN' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
export type SportsbookEventStatus = 'PRE' | 'LIVE' | 'FINAL' | 'VOID';

/**
 * 1.8.0-B. Why a line can or cannot take a ticket right now. The server decides this from
 * the same checks a wager runs; the board only adds STARTED once kickoff passes on screen.
 */
export type SportsbookLineState = 'OPEN' | 'NO_LINE' | 'STALE_ODDS' | 'FEED_UNAVAILABLE' | 'STARTED';

/** FRESH: bettable snapshot. WAITING: no snapshot yet. STALE: last snapshot too old. OFF: feed not connected. */
export type SportsbookFeedStatus = 'FRESH' | 'WAITING' | 'STALE' | 'OFF';

export interface SportsbookEventDto {
  id: string;
  sport: SportsbookLeagueKey;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  oddsUpdatedAt: string | null;
  homeOdds: number | null;
  awayOdds: number | null;
  lineState: SportsbookLineState;
}

export interface SportsbookFeedDto {
  status: SportsbookFeedStatus;
  refreshedAt: string | null;
  pollMinutes: number;
  oddsMaxAgeMinutes: number;
}

export interface SportsbookLeagueDto {
  key: SportsbookLeagueKey;
  name: string;
  eventCount: number;
  openCount: number;
}

export interface SportsbookBoardDto {
  enabled: boolean;
  refreshedAt: string | null;
  serverTime: string;
  feed: SportsbookFeedDto;
  leagues: SportsbookLeagueDto[];
  events: SportsbookEventDto[];
}

export interface SportsbookBetDto {
  id: string;
  sport: SportsbookLeagueKey;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  selection: SportsbookSelection;
  pickTeam: string;
  oddsAmerican: number;
  stakeCents: number;
  payoutCents: number;
  status: SportsbookBetStatus;
  eventStatus: SportsbookEventStatus;
  homeScore: number | null;
  awayScore: number | null;
  /** Game cash credited at settlement: payout on a win, the stake on a push or void, 0 otherwise. */
  returnCents: number;
  createdAt: string;
  settledAt: string | null;
}

export interface SportsbookTicketSummaryDto {
  openCount: number;
  openStakeCents: number;
  openPayoutCents: number;
  won: number;
  lost: number;
  push: number;
  void: number;
  /** Lifetime settled result: winnings minus lost stakes. Pushes and voids are 0. */
  netCents: number;
}

export interface SportsbookTicketsDto {
  open: SportsbookBetDto[];
  settled: SportsbookBetDto[];
  summary: SportsbookTicketSummaryDto;
}

export interface SportsbookPageDto extends SportsbookBoardDto {
  tickets: SportsbookTicketsDto;
}

export interface SportsbookBetInput {
  eventId: string;
  selection: SportsbookSelection;
  stakeCents: number;
  actionId: string;
  /** The price the player saw. A moved line is refused instead of silently taking the new price. */
  expectedOdds?: number;
}
