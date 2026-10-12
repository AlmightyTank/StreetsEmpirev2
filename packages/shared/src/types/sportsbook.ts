export type SportsbookLeagueKey = 'NFL' | 'NBA' | 'MLB' | 'NHL';
export type SportsbookSelection = 'HOME' | 'AWAY';
export type SportsbookBetStatus = 'OPEN' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
/** PULLED (1.8.0-C): the provider dropped or postponed the line; it reopens if the game returns. */
export type SportsbookEventStatus = 'PRE' | 'LIVE' | 'PULLED' | 'FINAL' | 'VOID';

/**
 * 1.8.0-B. Why a line can or cannot take a ticket right now. The server decides this from
 * the same checks a wager runs; the board only adds STARTED once kickoff passes on screen.
 */
export type SportsbookLineState = 'OPEN' | 'NO_LINE' | 'STALE_ODDS' | 'FEED_UNAVAILABLE' | 'PULLED' | 'STARTED';

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
  eventId: string;
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
  /** Casino chips credited at settlement: payout on a win, the stake on a push or void, 0 otherwise. */
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

/** 1.8.0-D. The player's limits and how much of each they have used. */
export interface SportsbookLimitsDto {
  /** 1.8.0-E. False when the round's ruleset predates the sportsbook: no new tickets, old ones still settle. */
  available: boolean;
  limits: import('../sportsbook.js').SportsbookLimits;
  openStakeCents: number;
  openTickets: number;
  dailyStakeCents: number;
}

export interface SportsbookPageDto extends SportsbookBoardDto {
  tickets: SportsbookTicketsDto;
  limits: SportsbookLimitsDto;
}

export interface SportsbookBetInput {
  eventId: string;
  selection: SportsbookSelection;
  stakeCents: number;
  actionId: string;
  /** The price the player saw. A moved line is refused instead of silently taking the new price. */
  expectedOdds?: number;
}

/** 1.8.0-C. Per-league outcome of the most recent odds polls. */
export interface SportsbookLeagueFeedStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string;
  lastErrorAt: string | null;
  eventsSeen: number;
}

export interface AdminSportsbookUnresolvedDto {
  id: string;
  sport: SportsbookLeagueKey;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  status: SportsbookEventStatus;
  openTickets: number;
  openStakeCents: number;
  openPayoutCents: number;
  resultCheckCount: number;
  resultCheckedAt: string | null;
  nextResultCheckAt: string | null;
  resultError: string;
}

export interface AdminSportsbookDto {
  generatedAt: string;
  configured: boolean;
  pollMinutes: number;
  feed: {
    status: SportsbookFeedStatus;
    lastPolledAt: string | null;
    lastAttemptAt: string | null;
    lastResultCheckAt: string | null;
    consecutiveFailures: number;
    lastError: string;
    lastErrorAt: string | null;
    pollInProgress: boolean;
  };
  quota: {
    used: number;
    limit: number;
    remaining: number | null;
    period: string;
    lastRunDatapoints: number;
    observedAt: string | null;
    oddsPaused: boolean;
    resultsPaused: boolean;
  };
  leagues: Array<SportsbookLeagueFeedStatus & { key: SportsbookLeagueKey; name: string; upcoming: number; pulled: number }>;
  exposure: { openTickets: number; openStakeCents: number; openPayoutCents: number };
  settledLast24h: { events: number; tickets: number };
  unresolved: AdminSportsbookUnresolvedDto[];
  review: AdminSportsbookReviewDto;
}

/** 1.8.0-E. One test the first market must pass before leagues or markets are added. */
export interface AdminSportsbookReviewCriterion {
  key: 'history' | 'sample' | 'auto' | 'stuck' | 'failures' | 'quota';
  label: string;
  value: string;
  target: string;
  pass: boolean;
}

/** 1.8.0-E. Provider usage and grading accuracy over the review window, and whether expansion is earned. */
export interface AdminSportsbookReviewDto {
  windowDays: number;
  runs: number;
  failedRuns: number;
  daysWithSnapshots: number;
  datapoints: number;
  datapointsPerDay: number;
  /** Datapoints a full quota period would use at this rate; null before any run. */
  projectedPerPeriod: number | null;
  period: string;
  settled: { total: number; feed: number; voidedByFeed: number; adminRecheck: number; adminVoid: number };
  hoursToSettle: { median: number | null; p90: number | null };
  stuckOver24h: number;
  criteria: AdminSportsbookReviewCriterion[];
  ready: boolean;
}

/** 1.8.0-E release gate: what the feed makes of one live provider snapshot. */
export interface AdminSportsbookProviderCheckDto {
  league: SportsbookLeagueKey;
  date: string;
  checkedAt: string;
  ok: boolean;
  error: string;
  summary: {
    events: number;
    parsed: number;
    withoutPrices: number;
    skipped: Record<'NO_EVENT_ID' | 'BAD_START' | 'NO_TEAMS' | 'NO_MONEYLINE', number>;
    statuses: Array<{ raw: string; outcome: 'PRE' | 'LIVE' | 'FINAL' | 'CANCELLED'; count: number }>;
    samples: Array<{
      providerEventId: string; startsAt: string; homeTeam: string; awayTeam: string;
      homeOdds: number | null; awayOdds: number | null; rawStatus: string; outcome: 'PRE' | 'LIVE' | 'FINAL' | 'CANCELLED';
    }>;
  } | null;
  quota: { datapoints: number; used: number; limit: number; remaining: number | null; period: string };
}

export interface AdminSportsbookActionDto {
  message: string;
  report: AdminSportsbookDto;
}
