import type { Prisma, PrismaClient, SportsbookProviderState } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SPORTSBOOK_QUOTA_ODDS_FLOOR,
  SPORTSBOOK_QUOTA_RESULTS_FLOOR,
  type SportsbookLeagueFeedStatus,
  type SportsbookLeagueKey,
} from '@streets/shared';
import {
  SPORTSBOOK_LEAGUES,
  dateKey,
  eventOdds,
  eventTeams,
  isSameQuotaWindow,
  num,
  record,
  settleSportsbookEvent,
  str,
  type JsonRecord,
  type ProviderEvent,
  type SportsbookSettledVia,
} from './sportsbook.service.js';

/**
 * 1.8.0-C. Everything that talks to TheRundown: bounded retries, one poller at a time, a league
 * failure that never takes the other leagues (or settlement) down with it, and result checks
 * paced per event. Player requests still only ever read the database cache.
 */

export const SPORTSBOOK_PROVIDER_ID = 'therundown';
const API_BASE = 'https://therundown.io/api/v2';
const REQUEST_TIMEOUT_MS = 15_000;
export const FEED_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;
const RETRY_AFTER_CAP_MS = 30_000;
/** 1.8.0-E. Feed runs kept for the market review. */
const FEED_RUN_RETENTION_DAYS = 90;
/** A crashed poller cannot hold the feed for longer than this. */
const LEASE_MS = 10 * 60_000;
const RESULT_CHECKS_PER_RUN = 40;
/** The earliest a final score is plausible after the scheduled start. */
const RESULT_FIRST_CHECK_MINUTES: Record<SportsbookLeagueKey, number> = { NFL: 180, NBA: 135, MLB: 150, NHL: 135 };
/**
 * The provider may date events in a US time zone rather than UTC. Assuming any offset from UTC
 * back to UTC-10 keeps both the fetched dates and the "missing from the snapshot" check honest.
 */
const PROVIDER_DATE_OFFSET_HOURS = 10;
/** Hard provider-request cooldown. Manual admin pulls share the same file-backed window. */
export const SPORTSBOOK_ODDS_CACHE_INTERVAL_MS = 30 * 60_000;
/** Recheck empty future slates less often; populated slates keep the 30-minute cadence. */
export const SPORTSBOOK_EMPTY_FUTURE_RECHECK_MS = 2 * 60 * 60_000;
const DEFAULT_ODDS_CACHE_FILE = path.resolve(process.cwd(), '.runtime', 'sportsbook-odds.json');

type OddsCacheSnapshot = { league: SportsbookLeagueKey; date: string; events: unknown[]; fetchedAt?: string };
type OddsCacheFile = { version: 1; updatedAt: string | null; snapshots: OddsCacheSnapshot[] };

export type FeedDeps = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; cacheFilePath?: string };

/** The boundary is inclusive: a fresh provider poll is allowed exactly 30 minutes later. */
export function sportsbookOddsCacheDue(updatedAt: Date | null, now: Date, intervalMs = SPORTSBOOK_ODDS_CACHE_INTERVAL_MS): boolean {
  return !updatedAt || now.getTime() - updatedAt.getTime() >= intervalMs;
}

function emptyOddsCache(): OddsCacheFile {
  return { version: 1, updatedAt: null, snapshots: [] };
}

async function readOddsCache(filePath: string): Promise<{ cache: OddsCacheFile; updatedAt: Date | null }> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { cache: emptyOddsCache(), updatedAt: null };
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { cache: emptyOddsCache(), updatedAt: null }; }
  if (!parsed || typeof parsed !== 'object') return { cache: emptyOddsCache(), updatedAt: null };
  const value = parsed as Partial<OddsCacheFile>;
  const updatedAt = typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
    ? new Date(value.updatedAt) : null;
  const snapshots = Array.isArray(value.snapshots)
    ? value.snapshots.filter((row): row is OddsCacheSnapshot => Boolean(
      row && typeof row === 'object' && typeof row.date === 'string' &&
      Array.isArray(row.events) && SPORTSBOOK_LEAGUES.some((league) => league.key === row.league),
    ))
    : [];
  return { cache: { version: 1, updatedAt: updatedAt?.toISOString() ?? null, snapshots }, updatedAt };
}

/** Replace atomically so a restart can never leave a half-written cooldown/cache file. */
async function writeOddsCache(filePath: string, cache: OddsCacheFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(cache), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export type ProviderErrorKind = 'AUTH' | 'RATE_LIMITED' | 'HTTP' | 'NETWORK' | 'PAYLOAD';

export class ProviderError extends Error {
  constructor(readonly kind: ProviderErrorKind, message: string, readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }

  /** After these, every further request this run would fail the same way. */
  get stopsRun(): boolean {
    return this.kind === 'AUTH' || this.kind === 'RATE_LIMITED';
  }
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 240);
const iso = (date: Date) => date.toISOString();

/** Retry-After as seconds or an HTTP date, capped so one header cannot stall the poller. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (header.trim() !== '' && Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.min(Math.max(0, at - now), RETRY_AFTER_CAP_MS) : null;
}

/** Minutes until the next result check after `checks` checks: 30, 30, 60, 120, 240, then every 6 hours. */
export function resultBackoffMinutes(checks: number): number {
  if (checks <= 2) return 30;
  return Math.min(30 * 2 ** (checks - 2), 360);
}

export function isResultCheckDue(
  event: { sport: string; startsAt: Date; nextResultCheckAt: Date | null },
  now = new Date(),
): boolean {
  if (event.nextResultCheckAt) return event.nextResultCheckAt.getTime() <= now.getTime();
  const firstCheck = RESULT_FIRST_CHECK_MINUTES[event.sport as SportsbookLeagueKey] ?? 180;
  return event.startsAt.getTime() + firstCheck * 60_000 <= now.getTime();
}

export type ProviderOutcome = 'PRE' | 'LIVE' | 'FINAL' | 'CANCELLED';

/** The provider's own status string, wherever the payload puts it. */
export function rawProviderStatus(event: ProviderEvent): string {
  return str(event.status) ?? str(event.event_status) ?? str(record(event.score)?.event_status) ?? '';
}

/** Reads `STATUS_FINAL`, `final`, `In Progress`, flags and the like into one of four outcomes. */
export function providerOutcome(event: ProviderEvent): ProviderOutcome {
  // TheRundown v2 keeps the game status on the score object.
  const status = rawProviderStatus(event).toLowerCase().replace(/^status_/, '').replaceAll('_', ' ');
  if (['cancelled', 'canceled', 'postponed', 'void', 'abandoned'].includes(status)) return 'CANCELLED';
  if (event.is_final === true || event.final === true || status.startsWith('final') || ['completed', 'complete'].includes(status)) return 'FINAL';
  if (event.is_live === true || event.live === true || ['live', 'in progress', 'halftime', 'end period', 'end of period', 'delayed', 'rain delay', 'suspended'].includes(status)) return 'LIVE';
  return 'PRE';
}

/** The UTC dates to request: today and tomorrow, plus yesterday while US evening games are still ahead. */
/** Only skip a future date when its most recent successful snapshot was empty and is recent.
 * Never skip today: new lines and schedule changes must remain visible promptly.
 */
export function shouldPollSportsbookDate(date: string, now: Date, cached?: { events: unknown[]; fetchedAt?: string }): boolean {
  if (date <= dateKey(now)) return true;
  if (!cached || cached.events.length > 0 || !cached.fetchedAt) return true;
  const fetchedAt = Date.parse(cached.fetchedAt);
  return !Number.isFinite(fetchedAt) || now.getTime() - fetchedAt >= SPORTSBOOK_EMPTY_FUTURE_RECHECK_MS || now.getTime() < fetchedAt;
}

export function sportsbookPollDates(now: Date): string[] {
  const dates = [dateKey(now), dateKey(new Date(now.getTime() + 86_400_000))];
  if (now.getUTCHours() < PROVIDER_DATE_OFFSET_HOURS) dates.unshift(dateKey(new Date(now.getTime() - 86_400_000)));
  return dates;
}

/**
 * Start times a complete snapshot of `dates` is certain to contain, whatever the provider's date
 * offset. Only games inside it are treated as pulled when the provider stops listing them.
 */
export function snapshotCoverage(dates: string[]): { from: Date; to: Date } {
  const from = new Date(`${dates[0]}T00:00:00.000Z`);
  from.setUTCHours(PROVIDER_DATE_OFFSET_HOURS);
  const to = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from, to };
}

type Quota = { used: number; limit: number; remaining: number | null; period: string };

/** One run's connection to TheRundown: retries, quota headers and a run-wide stop. */
export class ProviderSession {
  datapoints = 0;
  requests = 0;
  observed = false;
  stopped: ProviderError | null = null;
  used: number;
  limit: number;
  remaining: number | null;
  period: string;

  constructor(private readonly apiKey: string, quota: Quota, private readonly deps: FeedDeps = {}) {
    this.used = quota.used;
    this.limit = quota.limit;
    this.remaining = quota.remaining;
    this.period = quota.period;
  }

  static fromState(apiKey: string, state: SportsbookProviderState, now: Date, deps: FeedDeps = {}): ProviderSession {
    // A quota figure from an earlier window says nothing about this one.
    const sameWindow = Boolean(state.quotaObservedAt && isSameQuotaWindow(state.quotaObservedAt, now, state.datapointsPeriod));
    const remaining = state.datapointsRemaining ?? (state.datapointsLimit > 0 ? Math.max(0, state.datapointsLimit - state.datapointsUsed) : null);
    return new ProviderSession(apiKey, {
      used: state.datapointsUsed, limit: state.datapointsLimit, period: state.datapointsPeriod,
      remaining: sameWindow ? remaining : null,
    }, deps);
  }

  quotaBelow(floor: number): boolean {
    return this.remaining !== null && this.remaining <= floor;
  }

  private observe(headers: Headers): void {
    this.observed = true;
    this.datapoints += num(headers.get('x-datapoints')) ?? 0;
    this.used = num(headers.get('x-datapoints-used')) ?? this.used;
    this.limit = num(headers.get('x-datapoints-limit')) ?? this.limit;
    this.remaining = num(headers.get('x-datapoints-remaining')) ?? this.remaining;
    this.period = headers.get('x-datapoints-period') ?? this.period;
  }

  async get(path: string, params: Record<string, string> = {}): Promise<JsonRecord> {
    if (this.stopped) throw this.stopped;
    const url = new URL(API_BASE + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const fetchImpl = this.deps.fetch ?? fetch;
    const sleep = this.deps.sleep ?? sleepFor;
    let last = new ProviderError('NETWORK', 'TheRundown did not respond.');
    let wait = 0;
    for (let attempt = 1; attempt <= FEED_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) await sleep(wait);
      const backoff = RETRY_BASE_MS * 2 ** (attempt - 1);
      let response: Response;
      try {
        this.requests += 1;
        response = await fetchImpl(url, { headers: { 'X-TheRundown-Key': this.apiKey }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (error) {
        last = new ProviderError('NETWORK', `TheRundown request failed: ${errorText(error)}`);
        wait = backoff;
        continue;
      }
      this.observe(response.headers);
      if (response.ok) {
        const body = record(await response.json().catch(() => null));
        if (!body) throw new ProviderError('PAYLOAD', 'TheRundown returned something other than a JSON object.');
        return body;
      }
      if (response.status === 401 || response.status === 403) {
        this.stopped = new ProviderError('AUTH', `TheRundown rejected the API key (${response.status}).`, response.status);
        throw this.stopped;
      }
      if (response.status === 429) {
        last = new ProviderError('RATE_LIMITED', 'TheRundown rate limit or datapoint quota reached (429).', 429);
        if (this.remaining === 0) break;
        wait = retryAfterMs(response.headers.get('retry-after')) ?? backoff;
        continue;
      }
      if (response.status >= 500) {
        last = new ProviderError('HTTP', `TheRundown returned ${response.status}.`, response.status);
        wait = backoff;
        continue;
      }
      throw new ProviderError('HTTP', `TheRundown returned ${response.status}.`, response.status);
    }
    if (last.stopsRun) this.stopped = last;
    throw last;
  }

  usageData(now: Date) {
    if (!this.observed) return {};
    return {
      lastDatapoints: this.datapoints, datapointsUsed: this.used, datapointsLimit: this.limit,
      datapointsRemaining: this.remaining, datapointsPeriod: this.period, quotaObservedAt: now,
    };
  }
}

type LeagueStatusMap = Partial<Record<SportsbookLeagueKey, SportsbookLeagueFeedStatus>>;

export function parseLeagueStatus(value: unknown): LeagueStatusMap {
  const raw = record(value) ?? {};
  const out: LeagueStatusMap = {};
  for (const { key } of SPORTSBOOK_LEAGUES) {
    const row = record(raw[key]);
    if (!row) continue;
    out[key] = {
      lastAttemptAt: str(row.lastAttemptAt), lastSuccessAt: str(row.lastSuccessAt),
      lastError: str(row.lastError) ?? '', lastErrorAt: str(row.lastErrorAt), eventsSeen: num(row.eventsSeen) ?? 0,
    };
  }
  return out;
}

/** Writes one league/date snapshot. A settled event is never reopened by a late listing. */
async function storeSnapshot(prisma: PrismaClient, league: SportsbookLeagueKey, events: unknown[], now: Date): Promise<number> {
  let seen = 0;
  for (const raw of events) {
    const event = record(raw) as ProviderEvent | null;
    if (!event) continue;
    const providerEventId = str(event.event_id);
    const startsAt = new Date(String(event.starts_at ?? event.event_date ?? ''));
    const odds = eventOdds(event);
    if (!providerEventId || !Number.isFinite(startsAt.getTime()) || !odds) continue;
    seen += 1;
    const outcome = providerOutcome(event);
    const status = outcome === 'PRE' ? 'PRE' : outcome === 'CANCELLED' ? 'PULLED' : 'LIVE';
    const score = record(event.score);
    const homeScore = score ? num(score.score_home) : null;
    const awayScore = score ? num(score.score_away) : null;
    const existing = await prisma.sportsbookEvent.findUnique({ where: { providerEventId }, select: { id: true, settledAt: true } });
    if (existing?.settledAt) continue;
    if (existing) {
      await prisma.sportsbookEvent.update({ where: { id: existing.id }, data: {
        sport: league, homeTeam: odds.home, awayTeam: odds.away, startsAt,
        ...(status === 'PRE' ? { homeOdds: odds.homeOdds, awayOdds: odds.awayOdds, oddsUpdatedAt: now } : {}),
        status, homeScore, awayScore, lastSeenAt: now,
      } });
    } else {
      await prisma.sportsbookEvent.create({ data: {
        providerEventId, sport: league, homeTeam: odds.home, awayTeam: odds.away, startsAt, status,
        homeOdds: odds.homeOdds, awayOdds: odds.awayOdds, homeScore, awayScore, oddsUpdatedAt: now, lastSeenAt: now,
      } });
    }
  }
  return seen;
}

/**
 * After a complete league snapshot, an upcoming game the provider no longer lists closes at once
 * instead of staying bettable on its last price until that price goes stale.
 */
async function pullMissingLines(prisma: PrismaClient, league: SportsbookLeagueKey, dates: string[], now: Date): Promise<number> {
  const coverage = snapshotCoverage(dates);
  const from = coverage.from.getTime() > now.getTime() ? coverage.from : now;
  const pulled = await prisma.sportsbookEvent.updateMany({
    where: { sport: league, status: 'PRE', settledAt: null, lastSeenAt: { lt: now }, startsAt: { gt: from, lt: coverage.to } },
    data: { status: 'PULLED' },
  });
  return pulled.count;
}

export type ResultCheckOutcome = { outcome: 'SETTLED' | 'VOIDED' | 'ALREADY_SETTLED' | 'PENDING' | 'ERROR'; detail: string };

async function recordResultCheck(
  prisma: PrismaClient,
  event: { id: string; resultCheckCount: number },
  now: Date,
  error: string,
  live: boolean,
): Promise<void> {
  const checks = event.resultCheckCount + 1;
  await prisma.sportsbookEvent.updateMany({
    where: { id: event.id, settledAt: null },
    data: {
      resultCheckCount: checks, resultCheckedAt: now, resultError: error,
      nextResultCheckAt: new Date(now.getTime() + resultBackoffMinutes(checks) * 60_000),
      ...(live ? { status: 'LIVE' } : {}),
    },
  });
}

/** Asks the provider for one event's result and settles it if final. Safe to repeat or race. */
export async function checkSportsbookResult(
  prisma: PrismaClient,
  session: ProviderSession,
  event: { id: string; providerEventId: string; resultCheckCount: number },
  now: Date,
  via: SportsbookSettledVia = 'FEED',
): Promise<ResultCheckOutcome> {
  let payload: JsonRecord;
  try {
    payload = await session.get(`/events/${encodeURIComponent(event.providerEventId)}`);
  } catch (error) {
    const detail = errorText(error);
    await recordResultCheck(prisma, event, now, detail, false);
    return { outcome: 'ERROR', detail };
  }
  const providerEvent = (record(payload.event) ?? payload) as ProviderEvent;
  const outcome = providerOutcome(providerEvent);
  if (outcome === 'CANCELLED') {
    const settled = await settleSportsbookEvent(prisma, event.id, 'VOID', null, null, now, via);
    return settled ? { outcome: 'VOIDED', detail: `Voided; ${settled.tickets} ticket(s) refunded.` } : { outcome: 'ALREADY_SETTLED', detail: 'Already settled.' };
  }
  const score = record(providerEvent.score);
  const homeScore = score ? num(score.score_home) : null;
  const awayScore = score ? num(score.score_away) : null;
  if (outcome === 'FINAL') {
    if (homeScore === null || awayScore === null) {
      const detail = 'Provider marked the game final without both scores.';
      await recordResultCheck(prisma, event, now, detail, false);
      return { outcome: 'ERROR', detail };
    }
    const settled = await settleSportsbookEvent(prisma, event.id, 'FINAL', homeScore, awayScore, now, via);
    return settled
      ? { outcome: 'SETTLED', detail: `Final ${awayScore}-${homeScore}; ${settled.tickets} ticket(s) settled.` }
      : { outcome: 'ALREADY_SETTLED', detail: 'Already settled.' };
  }
  await recordResultCheck(prisma, event, now, '', outcome === 'LIVE');
  return { outcome: 'PENDING', detail: outcome === 'LIVE' ? 'Game is still in progress.' : 'No result posted yet.' };
}

export interface SportsbookRefreshResult {
  skipped: 'NO_KEY' | 'BUSY' | 'CACHE_FRESH' | null;
  oddsPolled: boolean;
  cacheUpdatedAt: string | null;
  nextOddsPollAt: string | null;
  snapshots: number;
  failedSnapshots: number;
  pulled: number;
  resultChecks: number;
  settled: number;
  errors: string[];
}

/**
 * One feed run: claim the lease, poll each league's pregame moneylines, close lines the provider
 * dropped, check due results, then record health for admins. Throws only when the run produced
 * no usable snapshot (or crashed), after recording why, so the job monitor sees a failure.
 */
export async function refreshSportsbookCache(
  prisma: PrismaClient,
  apiKey: string,
  now = new Date(),
  options: FeedDeps & { minIntervalMs?: number } = {},
): Promise<SportsbookRefreshResult> {
  const result: SportsbookRefreshResult = {
    skipped: null, oddsPolled: false, cacheUpdatedAt: null, nextOddsPollAt: null, snapshots: 0, failedSnapshots: 0, pulled: 0, resultChecks: 0, settled: 0, errors: [],
  };
  if (!apiKey) return { ...result, skipped: 'NO_KEY' };

  const cacheFilePath = options.cacheFilePath ?? DEFAULT_ODDS_CACHE_FILE;
  const { cache: initialCache, updatedAt: fileUpdatedAt } = await readOddsCache(cacheFilePath);
  const cachedSnapshots = new Map(initialCache.snapshots.map((snapshot) => [`${snapshot.league}:${snapshot.date}`, snapshot]));

  await prisma.sportsbookProviderState.upsert({ where: { id: SPORTSBOOK_PROVIDER_ID }, create: { id: SPORTSBOOK_PROVIDER_ID }, update: {} });
  // Another instance (or a slow previous run) holding the feed means this run spends nothing.
  const claimed = await prisma.sportsbookProviderState.updateMany({
    where: {
      id: SPORTSBOOK_PROVIDER_ID,
      AND: [
        { OR: [{ pollLeaseUntil: null }, { pollLeaseUntil: { lt: now } }] },
        ...(options.minIntervalMs
          ? [{ OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: new Date(now.getTime() - options.minIntervalMs) } }] }]
          : []),
      ],
    },
    data: { pollLeaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (!claimed.count) return { ...result, skipped: 'BUSY' };

  const state = await prisma.sportsbookProviderState.findUniqueOrThrow({ where: { id: SPORTSBOOK_PROVIDER_ID } });
  const session = ProviderSession.fromState(apiKey, state, now, options);
  const leagues = parseLeagueStatus(state.leagueStatus);
  const latestOddsAt = [fileUpdatedAt, state.lastAttemptAt, state.lastPolledAt]
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const minOddsIntervalMs = Math.max(SPORTSBOOK_ODDS_CACHE_INTERVAL_MS, options.minIntervalMs ?? 0);
  const oddsCacheDue = sportsbookOddsCacheDue(latestOddsAt, now, minOddsIntervalMs);
  result.cacheUpdatedAt = latestOddsAt?.toISOString() ?? null;
  result.nextOddsPollAt = latestOddsAt ? new Date(latestOddsAt.getTime() + minOddsIntervalMs).toISOString() : null;
  let crash: unknown = null;

  try {
    result.oddsPolled = oddsCacheDue && !session.quotaBelow(SPORTSBOOK_QUOTA_ODDS_FLOOR);
    if (!oddsCacheDue) result.skipped = 'CACHE_FRESH';
    if (oddsCacheDue && !result.oddsPolled) result.errors.push('Odds polling paused: provider quota is near its limit.');
    if (result.oddsPolled) {
      // Persist the cooldown before spending. If a process stops mid-poll, restart/manual requests still wait.
      await prisma.sportsbookProviderState.update({ where: { id: SPORTSBOOK_PROVIDER_ID }, data: { lastAttemptAt: now } });
      await writeOddsCache(cacheFilePath, { ...initialCache, updatedAt: iso(now) });
    }
    const dates = sportsbookPollDates(now);
    for (const league of result.oddsPolled ? SPORTSBOOK_LEAGUES : []) {
      const status: SportsbookLeagueFeedStatus = leagues[league.key] ?? { lastAttemptAt: null, lastSuccessAt: null, lastError: '', lastErrorAt: null, eventsSeen: 0 };
      let complete = true;
      let seen = 0;
      let failure = '';
      let allDatesFetched = true;
      for (const date of dates) {
        const cached = cachedSnapshots.get(`${league.key}:${date}`);
        if (!shouldPollSportsbookDate(date, now, cached)) {
          allDatesFetched = false;
          continue;
        }
        if (session.stopped || session.quotaBelow(SPORTSBOOK_QUOTA_ODDS_FLOOR)) {
          complete = false;
          failure ||= session.stopped ? session.stopped.message : 'Skipped: provider quota is near its limit.';
          break;
        }
        try {
          const payload = await session.get(`/sports/${league.sportId}/events/${date}`, {
            market_ids: '1', affiliate_ids: '3', main_line: 'true', hide_closed: 'true',
          });
          if (!Array.isArray(payload.events)) throw new ProviderError('PAYLOAD', 'Snapshot has no events list.');
          cachedSnapshots.set(`${league.key}:${date}`, { league: league.key, date, events: payload.events, fetchedAt: iso(now) });
          seen += await storeSnapshot(prisma, league.key, payload.events, now);
          result.snapshots += 1;
        } catch (error) {
          complete = false;
          result.failedSnapshots += 1;
          failure = `${date}: ${errorText(error)}`;
          if (!(error instanceof ProviderError)) throw error;
        }
      }
      status.lastAttemptAt = iso(now);
      if (complete) {
        // A skipped empty future snapshot is not proof that the full date range is complete.
        if (allDatesFetched) result.pulled += await pullMissingLines(prisma, league.key, dates, now);
        Object.assign(status, { lastSuccessAt: iso(now), lastError: '', eventsSeen: seen });
      } else {
        Object.assign(status, { lastError: failure, lastErrorAt: iso(now) });
        result.errors.push(`${league.key} ${failure}`);
      }
      leagues[league.key] = status;
    }

    if (result.oddsPolled && result.snapshots > 0) {
      // Keep provider responses on disk; Postgres remains the transactional player-facing projection.
      const completedAt = new Date(Math.max(now.getTime(), Date.now()));
      const nextCache: OddsCacheFile = {
        version: 1, updatedAt: completedAt.toISOString(), snapshots: [...cachedSnapshots.values()],
      };
      await writeOddsCache(cacheFilePath, nextCache);
      result.cacheUpdatedAt = nextCache.updatedAt;
      result.nextOddsPollAt = new Date(completedAt.getTime() + minOddsIntervalMs).toISOString();
    }

    // Results only for games with open tickets, each on its own schedule, oldest due first.
    const candidates = await prisma.sportsbookEvent.findMany({
      where: {
        settledAt: null, status: { in: ['PRE', 'LIVE', 'PULLED'] }, startsAt: { lte: now },
        bets: { some: { status: 'OPEN' } },
        OR: [{ nextResultCheckAt: null }, { nextResultCheckAt: { lte: now } }],
      },
      orderBy: [{ startsAt: 'asc' }],
      select: { id: true, providerEventId: true, sport: true, startsAt: true, nextResultCheckAt: true, resultCheckCount: true },
      take: 200,
    });
    for (const event of candidates.filter((candidate) => isResultCheckDue(candidate, now)).slice(0, RESULT_CHECKS_PER_RUN)) {
      if (session.stopped) break;
      if (session.quotaBelow(SPORTSBOOK_QUOTA_RESULTS_FLOOR)) {
        result.errors.push('Result checks paused: provider quota is nearly exhausted.');
        break;
      }
      const checked = await checkSportsbookResult(prisma, session, event, now);
      result.resultChecks += 1;
      if (checked.outcome === 'SETTLED' || checked.outcome === 'VOIDED') result.settled += 1;
      if (checked.outcome === 'ERROR') result.errors.push(`Result ${event.providerEventId}: ${checked.detail}`);
    }
  } catch (error) {
    crash = error;
    result.errors.push(`Feed run crashed: ${errorText(error)}`);
  } finally {
    const failed = Boolean(crash) || session.stopped?.kind === 'AUTH' || (result.oddsPolled && result.snapshots === 0);
    await prisma.sportsbookProviderState.update({
      where: { id: SPORTSBOOK_PROVIDER_ID },
      data: {
        pollLeaseUntil: null,
        ...(result.snapshots > 0 ? { lastPolledAt: now } : {}),
        ...(result.resultChecks > 0 ? { lastResultCheckAt: now } : {}),
        ...session.usageData(now),
        leagueStatus: leagues as Prisma.InputJsonValue,
        consecutiveFailures: failed ? { increment: 1 } : 0,
        lastError: result.errors.join(' · ').slice(0, 500),
        ...(result.errors.length ? { lastErrorAt: now } : {}),
      },
    });
    // 1.8.0-E: one row per run that held the lease, so admins can review real provider usage.
    await prisma.sportsbookFeedRun.create({ data: {
      startedAt: now, oddsPolled: result.oddsPolled, requests: session.requests, datapoints: session.datapoints,
      snapshots: result.snapshots, failedSnapshots: result.failedSnapshots, pulled: result.pulled,
      resultChecks: result.resultChecks, settled: result.settled, failed, error: result.errors.join(' · ').slice(0, 500),
    } });
    await prisma.sportsbookFeedRun.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - FEED_RUN_RETENTION_DAYS * 86_400_000) } } });
  }
  if (crash) throw crash;
  if (session.stopped?.kind === 'AUTH' || (result.oddsPolled && result.snapshots === 0)) {
    throw new Error(`Sportsbook feed produced no odds snapshot: ${result.errors.join(' · ')}`);
  }
  return result;
}

export type SnapshotSkipReason = 'NO_EVENT_ID' | 'BAD_START' | 'NO_TEAMS' | 'NO_MONEYLINE';

/**
 * 1.8.0-E release gate. Why the feed would skip one provider listing, or null when it stores it.
 * Mirrors `storeSnapshot`, which only needs an id, a start time, both team names and a moneyline market.
 */
export function diagnoseProviderEvent(raw: unknown): SnapshotSkipReason | null {
  const event = record(raw) as ProviderEvent | null;
  if (!event || !str(event.event_id)) return 'NO_EVENT_ID';
  if (!Number.isFinite(new Date(String(event.starts_at ?? event.event_date ?? '')).getTime())) return 'BAD_START';
  if (eventOdds(event)) return null;
  return eventTeams(event) ? 'NO_MONEYLINE' : 'NO_TEAMS';
}

export interface SnapshotSummary {
  events: number;
  parsed: number;
  /** Stored, but with no moneyline price on either side yet. */
  withoutPrices: number;
  skipped: Record<SnapshotSkipReason, number>;
  statuses: Array<{ raw: string; outcome: ProviderOutcome; count: number }>;
  samples: Array<{
    providerEventId: string; startsAt: string; homeTeam: string; awayTeam: string;
    homeOdds: number | null; awayOdds: number | null; rawStatus: string; outcome: ProviderOutcome;
  }>;
}

/** What the feed makes of one real snapshot: the evidence the release gate asks for. */
export function summarizeSnapshot(events: unknown[]): SnapshotSummary {
  const summary: SnapshotSummary = {
    events: events.length, parsed: 0, withoutPrices: 0,
    skipped: { NO_EVENT_ID: 0, BAD_START: 0, NO_TEAMS: 0, NO_MONEYLINE: 0 }, statuses: [], samples: [],
  };
  const statuses = new Map<string, { outcome: ProviderOutcome; count: number }>();
  for (const raw of events) {
    const reason = diagnoseProviderEvent(raw);
    const event = (record(raw) ?? {}) as ProviderEvent;
    const rawStatus = rawProviderStatus(event) || '(none)';
    const outcome = providerOutcome(event);
    const seen = statuses.get(rawStatus) ?? { outcome, count: 0 };
    seen.count += 1;
    statuses.set(rawStatus, seen);
    if (reason) {
      summary.skipped[reason] += 1;
      continue;
    }
    const odds = eventOdds(event)!;
    summary.parsed += 1;
    if (odds.homeOdds === null && odds.awayOdds === null) summary.withoutPrices += 1;
    if (summary.samples.length < 5) {
      summary.samples.push({
        providerEventId: str(event.event_id)!, startsAt: new Date(String(event.starts_at ?? event.event_date)).toISOString(),
        homeTeam: odds.home, awayTeam: odds.away, homeOdds: odds.homeOdds, awayOdds: odds.awayOdds, rawStatus, outcome,
      });
    }
  }
  summary.statuses = [...statuses].map(([raw, value]) => ({ raw, ...value })).sort((a, b) => b.count - a.count);
  return summary;
}
