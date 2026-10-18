import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type SportsbookLeagueFeedStatus,
  type SportsbookLeagueKey,
} from '@streets/shared';
import {
  SPORTSBOOK_LEAGUES,
  dateKey,
  num,
  record,
  settleSportsbookEvent,
  str,
  type SportsbookSettledVia,
} from './sportsbook.service.js';
import {
  ProviderError,
  type NormalizedSportsbookEvent,
  type NormalizedSportsbookResult,
  type ProviderSessionDeps,
  type SportsbookProvider,
} from './sportsbook/sportsbook-provider.js';
import {
  createSportsbookProvider,
  DEFAULT_SPORTSBOOK_PROVIDER_ID,
  SPORTSBOOK_ODDS_CHAINS,
  SPORTSBOOK_ODDS_PROVIDER_IDS,
  SPORTSBOOK_PROVIDER_IDS,
  SPORTSBOOK_PROVIDER_QUOTA_FLOORS,
  SPORTSBOOK_RESULT_CHAINS,
  sportsbookProviderName,
  type SportsbookProviderId,
  type SportsbookProviderKeys,
} from './sportsbook/sportsbook-providers.js';
import {
  SPORTSBOOK_EVENT_MATCH_WINDOW_MS,
  matchSportsbookEvent,
  resolveSportsbookListingTeams,
} from './sportsbook/sportsbook-event-matcher.js';

/**
 * Provider-neutral feed orchestration: one poller at a time, league-isolated failures, persisted
 * quota/health, and per-event result pacing. Player requests only ever read the database cache.
 */

export const SPORTSBOOK_PROVIDER_ID = DEFAULT_SPORTSBOOK_PROVIDER_ID;
/** 1.8.0-E. Feed runs kept for the market review. */
const FEED_RUN_RETENTION_DAYS = 90;
/** A crashed poller cannot hold the feed for longer than this. */
const LEASE_MS = 10 * 60_000;
export const SPORTSBOOK_CIRCUIT_FAILURES = 3;
export const SPORTSBOOK_CIRCUIT_OPEN_MS = 30 * 60_000;
export const SPORTSBOOK_FALLBACKS_PER_LEAGUE = 1;
export const SPORTSBOOK_FALLBACKS_PER_RUN = 2;
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
/** Recovery checks only use a different provider, never a second request to the failed source. */
export const SPORTSBOOK_ODDS_RECOVERY_INTERVAL_MS = 15 * 60_000;
/** Recheck empty future slates less often; populated slates keep the 30-minute cadence. */
export const SPORTSBOOK_EMPTY_FUTURE_RECHECK_MS = 2 * 60 * 60_000;
const DEFAULT_ODDS_CACHE_FILE = path.resolve(process.cwd(), '.runtime', 'sportsbook-odds.json');

type OddsCacheSnapshot = { provider?: string; league: SportsbookLeagueKey; date: string; events: unknown[]; fetchedAt?: string };
type OddsCacheFile = { version: 1; updatedAt: string | null; snapshots: OddsCacheSnapshot[] };

export type FeedDeps = ProviderSessionDeps & { cacheFilePath?: string };
export type SportsbookFeedKeys = SportsbookProviderKeys;

/** The boundary is inclusive: a fresh provider poll is allowed exactly 30 minutes later. */
export function sportsbookOddsCacheDue(updatedAt: Date | null, now: Date, intervalMs = SPORTSBOOK_ODDS_CACHE_INTERVAL_MS): boolean {
  return !updatedAt || now.getTime() - updatedAt.getTime() >= intervalMs;
}

/**
 * A failed league becomes eligible for an alternate 15 minutes after its last failed attempt.
 * Each provider still has its own 30-minute cooldown for that league, including failed calls.
 * This prevents expensive repeated requests when both sources are down.
 */
export function sportsbookNextRecoveryAt(
  active: SportsbookLeagueFeedStatus | undefined,
  alternates: Array<SportsbookLeagueFeedStatus | undefined>,
): Date | null {
  if (!active?.lastError || !active.lastAttemptAt || alternates.length === 0) return null;
  const failedAt = Date.parse(active.lastAttemptAt);
  const lastSuccess = active.lastSuccessAt ? Date.parse(active.lastSuccessAt) : NaN;
  if (!Number.isFinite(failedAt) || (Number.isFinite(lastSuccess) && failedAt <= lastSuccess)) return null;
  const candidateAt = alternates.map((status) => {
    const attemptedAt = status?.lastAttemptAt ? Date.parse(status.lastAttemptAt) : NaN;
    return Number.isFinite(attemptedAt) ? attemptedAt + SPORTSBOOK_ODDS_CACHE_INTERVAL_MS : 0;
  });
  return new Date(Math.max(failedAt + SPORTSBOOK_ODDS_RECOVERY_INTERVAL_MS, Math.min(...candidateAt)));
}

export function sportsbookProviderCooldownElapsed(
  status: SportsbookLeagueFeedStatus | undefined,
  now: Date,
): boolean {
  const attemptedAt = status?.lastAttemptAt ? Date.parse(status.lastAttemptAt) : NaN;
  return !Number.isFinite(attemptedAt) || sportsbookOddsCacheDue(new Date(attemptedAt), now);
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

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 240);
const iso = (date: Date) => date.toISOString();

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

type SnapshotStoreResult = { seen: number; unmatched: string[] };

const sourceListingData = (event: NormalizedSportsbookEvent, now: Date) => ({
  status: event.status,
  homeOdds: event.prices.moneyline.home,
  awayOdds: event.prices.moneyline.away,
  homeScore: event.scores.home,
  awayScore: event.scores.away,
  lastSeenAt: now,
});

/** Writes normalized listings and attaches each provider source to one canonical event. */
async function storeSnapshot(
  prisma: PrismaClient,
  providerId: string,
  league: SportsbookLeagueKey,
  events: NormalizedSportsbookEvent[],
  now: Date,
  isActiveOddsProvider: boolean,
): Promise<SnapshotStoreResult> {
  let seen = 0;
  const unmatched: string[] = [];
  for (const event of events) {
    if (event.league !== league) continue;
    let source = await prisma.sportsbookEventSource.findUnique({
      where: { provider_providerEventId: { provider: providerId, providerEventId: event.providerEventId } },
      include: { event: true },
    });
    let canonical = source?.event ?? null;
    // During Slice B the legacy id remains populated; repair rows created after the SQL backfill.
    if (!canonical) {
      const legacy = await prisma.sportsbookEvent.findUnique({ where: { providerEventId: event.providerEventId } });
      if (legacy?.oddsProvider === providerId) canonical = legacy;
    }
    if (!canonical) {
      const candidates = await prisma.sportsbookEvent.findMany({
        where: {
          sport: league,
          startsAt: {
            gte: new Date(event.startsAt.getTime() - SPORTSBOOK_EVENT_MATCH_WINDOW_MS),
            lte: new Date(event.startsAt.getTime() + SPORTSBOOK_EVENT_MATCH_WINDOW_MS),
          },
        },
        select: { id: true, sport: true, homeTeam: true, awayTeam: true, startsAt: true },
      });
      const match = matchSportsbookEvent(event, candidates);
      if (match.kind === 'MATCHED') {
        canonical = await prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: match.event.id } });
      } else if (match.kind === 'AMBIGUOUS') {
        unmatched.push(`${providerId}:${event.providerEventId} ambiguous between ${match.candidateIds.join(', ')}`);
        continue;
      } else if (!isActiveOddsProvider) {
        unmatched.push(`${providerId}:${event.providerEventId} has no canonical match`);
        continue;
      } else {
        const teams = match.kind === 'NO_MATCH'
          ? match.teams
          : resolveSportsbookListingTeams(league, event.homeTeam, event.awayTeam);
        if (!teams) unmatched.push(`${providerId}:${event.providerEventId} uses unknown teams ${event.awayTeam} at ${event.homeTeam}`);
        canonical = await prisma.sportsbookEvent.create({ data: {
          providerEventId: event.providerEventId,
          sport: league,
          homeTeam: teams?.homeTeam ?? event.homeTeam,
          awayTeam: teams?.awayTeam ?? event.awayTeam,
          startsAt: event.startsAt,
          status: event.status === 'PRE' ? 'PRE' : event.status === 'CANCELLED' ? 'PULLED' : 'LIVE',
          homeOdds: event.prices.moneyline.home,
          awayOdds: event.prices.moneyline.away,
          homeScore: event.scores.home,
          awayScore: event.scores.away,
          oddsUpdatedAt: now,
          oddsProvider: providerId,
          lastSeenAt: now,
        } });
      }
    }

    if (source) {
      await prisma.sportsbookEventSource.update({
        where: { id: source.id },
        data: sourceListingData(event, now),
      });
    } else {
      await prisma.sportsbookEventSource.create({ data: {
        eventId: canonical.id,
        provider: providerId,
        providerEventId: event.providerEventId,
        ...sourceListingData(event, now),
      } });
    }

    seen += 1;
    const status = event.status === 'PRE' ? 'PRE' : event.status === 'CANCELLED' ? 'PULLED' : 'LIVE';
    if (canonical.settledAt || !isActiveOddsProvider) continue;
    await prisma.sportsbookEvent.update({ where: { id: canonical.id }, data: {
        sport: league, startsAt: event.startsAt,
        ...(status === 'PRE' ? { homeOdds: event.prices.moneyline.home, awayOdds: event.prices.moneyline.away, oddsUpdatedAt: now } : {}),
        status, homeScore: event.scores.home, awayScore: event.scores.away, lastSeenAt: now, oddsProvider: providerId,
    } });
  }
  return { seen, unmatched };
}

/**
 * After a complete league snapshot, an upcoming game the provider no longer lists closes at once
 * instead of staying bettable on its last price until that price goes stale.
 */
async function pullMissingLines(prisma: PrismaClient, provider: string, league: SportsbookLeagueKey, dates: string[], now: Date): Promise<number> {
  const coverage = snapshotCoverage(dates);
  const from = coverage.from.getTime() > now.getTime() ? coverage.from : now;
  const pulled = await prisma.sportsbookEvent.updateMany({
    where: {
      sport: league, status: 'PRE', settledAt: null, oddsProvider: provider,
      startsAt: { gt: from, lt: coverage.to },
      OR: [
        { sources: { some: { provider, lastSeenAt: { lt: now } } } },
        { sources: { none: {} }, lastSeenAt: { lt: now } },
      ],
    },
    data: { status: 'PULLED' },
  });
  return pulled.count;
}

export type ResultCheckOutcome = { outcome: 'SETTLED' | 'VOIDED' | 'ALREADY_SETTLED' | 'DISPUTED' | 'REVIEW' | 'PENDING' | 'ERROR'; detail: string };

type ResultSource = { id: string; provider: string; providerEventId: string; resultCheckCount: number };

async function recordResultCheck(
  prisma: PrismaClient,
  event: { id: string },
  source: ResultSource,
  now: Date,
  error: string,
  result: NormalizedSportsbookResult | null,
): Promise<void> {
  const checks = source.resultCheckCount + 1;
  const terminal = result?.status === 'FINAL' || result?.status === 'CANCELLED';
  const nextResultCheckAt = terminal ? null : new Date(now.getTime() + resultBackoffMinutes(checks) * 60_000);
  await prisma.$transaction([
    prisma.sportsbookEventSource.update({ where: { id: source.id }, data: {
      resultCheckCount: checks,
      resultCheckedAt: now,
      resultError: error,
      nextResultCheckAt,
      ...(result ? { status: result.status, homeScore: result.scores.home, awayScore: result.scores.away } : {}),
    } }),
    prisma.sportsbookEvent.updateMany({
      where: { id: event.id, settledAt: null },
      data: {
        resultCheckCount: { increment: 1 },
        resultCheckedAt: now,
        resultError: error,
        nextResultCheckAt,
        ...(result?.status === 'LIVE' ? { status: 'LIVE' } : {}),
      },
    }),
  ]);
}

const reviewAt = (now: Date) => new Date(now.getTime() + 6 * 60 * 60_000);

/** Decide from persisted source evidence. It never trusts ESPN alone and all payouts retain the row lock. */
export async function evaluateSportsbookResultEvidence(
  prisma: PrismaClient,
  event: { id: string; startsAt: Date },
  now: Date,
  via: SportsbookSettledVia = 'FEED',
): Promise<ResultCheckOutcome> {
  const current = await prisma.sportsbookEvent.findUnique({ where: { id: event.id }, include: { sources: true } });
  if (!current || current.settledAt) return { outcome: 'ALREADY_SETTLED', detail: 'Already settled.' };
  const checked = current.sources.filter((source) => source.resultCheckedAt !== null);
  const finals = checked.filter((source) => source.status === 'FINAL' && source.homeScore !== null && source.awayScore !== null);
  const cancellations = checked.filter((source) => source.status === 'CANCELLED');
  const scoreKeys = new Set(finals.map((source) => `${source.homeScore}:${source.awayScore}`));

  if (scoreKeys.size > 1 || (finals.length > 0 && cancellations.length > 0)) {
    const evidence = [...finals, ...cancellations]
      .map((source) => source.status === 'FINAL'
        ? `${sportsbookProviderName(source.provider)} ${source.awayScore}-${source.homeScore}`
        : `${sportsbookProviderName(source.provider)} cancelled`)
      .join('; ');
    const detail = `Result sources disagree: ${evidence}.`;
    await prisma.sportsbookEvent.updateMany({ where: { id: event.id, settledAt: null }, data: {
      status: 'DISPUTED', resultReviewReason: detail, resultReviewAt: now, nextResultCheckAt: null,
    } });
    return { outcome: 'DISPUTED', detail };
  }

  if (finals.length) {
    const grading = finals.find((source) => source.provider !== 'espn');
    if (grading) {
      const providers = [...new Set(finals.map((source) => source.provider))].join(',');
      const settled = await settleSportsbookEvent(prisma, event.id, 'FINAL', grading.homeScore, grading.awayScore, now, via, providers);
      return settled
        ? { outcome: 'SETTLED', detail: `Final ${grading.awayScore}-${grading.homeScore}; ${settled.tickets} ticket(s) settled.` }
        : { outcome: 'ALREADY_SETTLED', detail: 'Already settled.' };
    }
    const detail = 'ESPN has a final score, but an official results provider has not confirmed it.';
    await prisma.sportsbookEvent.updateMany({ where: { id: event.id, settledAt: null }, data: {
      resultReviewReason: detail, resultReviewAt: now, nextResultCheckAt: reviewAt(now),
    } });
    return { outcome: 'REVIEW', detail };
  }

  if (new Set(cancellations.map((source) => source.provider)).size >= 2) {
    const providers = [...new Set(cancellations.map((source) => source.provider))].join(',');
    const settled = await settleSportsbookEvent(prisma, event.id, 'VOID', null, null, now, via, providers);
    return settled
      ? { outcome: 'VOIDED', detail: `Two sources confirmed cancellation; ${settled.tickets} ticket(s) refunded.` }
      : { outcome: 'ALREADY_SETTLED', detail: 'Already settled.' };
  }

  if (cancellations.length === 1) {
    const detail = `${sportsbookProviderName(cancellations[0]!.provider)} reports the game cancelled; a second source is required before refunding.`;
    await prisma.sportsbookEvent.updateMany({ where: { id: event.id, settledAt: null }, data: {
      status: 'PULLED', resultReviewReason: detail, resultReviewAt: now, nextResultCheckAt: reviewAt(now),
    } });
    return { outcome: 'REVIEW', detail };
  }

  if (now.getTime() - event.startsAt.getTime() >= 72 * 60 * 60_000) {
    const detail = 'No provider has reported a final result within 72 hours of the scheduled start.';
    await prisma.sportsbookEvent.updateMany({ where: { id: event.id, settledAt: null }, data: {
      resultReviewReason: detail, resultReviewAt: now, nextResultCheckAt: reviewAt(now),
    } });
    return { outcome: 'REVIEW', detail };
  }
  return { outcome: 'PENDING', detail: current.status === 'LIVE' ? 'Game is still in progress.' : 'No result posted yet.' };
}

/** Transitional repair for events created by old fixtures or between deploy and migration. */
export async function ensureSportsbookEventSource(
  prisma: PrismaClient,
  providerId: string,
  event: {
    id: string; providerEventId: string; status: string; homeOdds: number | null; awayOdds: number | null;
    homeScore: number | null; awayScore: number | null; lastSeenAt: Date; resultCheckCount: number;
    resultCheckedAt: Date | null; nextResultCheckAt: Date | null; resultError: string;
  },
) {
  const existing = await prisma.sportsbookEventSource.findFirst({
    where: { eventId: event.id, provider: providerId },
    orderBy: { lastSeenAt: 'desc' },
  });
  if (existing) return existing;
  const sourceStatus = event.status === 'VOID' ? 'CANCELLED' : event.status === 'PULLED' ? 'PRE' : event.status;
  return prisma.sportsbookEventSource.upsert({
    where: { provider_providerEventId: { provider: providerId, providerEventId: event.providerEventId } },
    create: {
      eventId: event.id, provider: providerId, providerEventId: event.providerEventId, status: sourceStatus,
      homeOdds: event.homeOdds, awayOdds: event.awayOdds, homeScore: event.homeScore, awayScore: event.awayScore,
      lastSeenAt: event.lastSeenAt, resultCheckCount: event.resultCheckCount, resultCheckedAt: event.resultCheckedAt,
      nextResultCheckAt: event.nextResultCheckAt, resultError: event.resultError,
    },
    update: {},
  });
}

/** Asks one provider for a result, records its evidence, then applies the cross-source safety rules. */
export async function checkSportsbookResult(
  prisma: PrismaClient,
  provider: SportsbookProvider,
  event: { id: string; sport: string; startsAt?: Date },
  source: ResultSource,
  now: Date,
  via: SportsbookSettledVia = 'FEED',
): Promise<ResultCheckOutcome> {
  let providerResult: NormalizedSportsbookResult | null;
  try {
    providerResult = await provider.getResult(source.providerEventId, event.sport as SportsbookLeagueKey);
  } catch (error) {
    const detail = errorText(error);
    await recordResultCheck(prisma, event, source, now, detail, null);
    return { outcome: 'ERROR', detail };
  }
  if (!providerResult) {
    const detail = 'Provider response did not include this event.';
    await recordResultCheck(prisma, event, source, now, detail, null);
    return { outcome: 'ERROR', detail };
  }
  if (providerResult.status === 'CANCELLED') {
    await recordResultCheck(prisma, event, source, now, '', providerResult);
    return evaluateSportsbookResultEvidence(prisma, { id: event.id, startsAt: event.startsAt ?? now }, now, via);
  }
  const homeScore = providerResult.scores.home;
  const awayScore = providerResult.scores.away;
  if (providerResult.status === 'FINAL') {
    if (homeScore === null || awayScore === null) {
      const detail = 'Provider marked the game final without both scores.';
      await recordResultCheck(prisma, event, source, now, detail, { ...providerResult, status: 'PRE' });
      return { outcome: 'ERROR', detail };
    }
    await recordResultCheck(prisma, event, source, now, '', providerResult);
    return evaluateSportsbookResultEvidence(prisma, { id: event.id, startsAt: event.startsAt ?? now }, now, via);
  }
  await recordResultCheck(prisma, event, source, now, '', providerResult);
  return { outcome: 'PENDING', detail: providerResult.status === 'LIVE' ? 'Game is still in progress.' : 'No result posted yet.' };
}

type ResultChainEvent = {
  id: string; sport: string; homeTeam: string; awayTeam: string; startsAt: Date;
  sources: ResultSource[];
};
export type ResultBulkCache = Map<string, Promise<NormalizedSportsbookResult[]>>;

function resultMatchesEvent(result: NormalizedSportsbookResult, event: ResultChainEvent): boolean {
  if (!result.league || !result.homeTeam || !result.awayTeam || !result.startsAt) return false;
  const exact = result.league === event.sport
    && result.homeTeam.trim().toLowerCase() === event.homeTeam.trim().toLowerCase()
    && result.awayTeam.trim().toLowerCase() === event.awayTeam.trim().toLowerCase()
    && Math.abs(result.startsAt.getTime() - event.startsAt.getTime()) <= SPORTSBOOK_EVENT_MATCH_WINDOW_MS;
  if (exact) return true;
  const match = matchSportsbookEvent({
    ...result,
    league: result.league,
    homeTeam: result.homeTeam,
    awayTeam: result.awayTeam,
    startsAt: result.startsAt,
    prices: { moneyline: { home: null, away: null } },
  }, [event]);
  return match.kind === 'MATCHED';
}

/** Walk the league's result chain. Bulk calls are shared by every event in this run. */
export async function checkSportsbookResultChain(
  prisma: PrismaClient,
  providers: ReadonlyMap<SportsbookProviderId, SportsbookProvider>,
  event: ResultChainEvent,
  now: Date,
  via: SportsbookSettledVia = 'FEED',
  bulkCache: ResultBulkCache = new Map(),
): Promise<ResultCheckOutcome & { checks: number; providerErrors: Array<{ provider: SportsbookProviderId; detail: string }> }> {
  const league = event.sport as SportsbookLeagueKey;
  let checks = 0;
  let lastError = '';
  let sawLive = false;
  let sawTerminal = false;
  const providerErrors: Array<{ provider: SportsbookProviderId; detail: string }> = [];

  for (const providerId of SPORTSBOOK_RESULT_CHAINS[league] ?? []) {
    const provider = providers.get(providerId);
    if (!provider || provider.session.stopped || provider.session.quotaBelow(SPORTSBOOK_PROVIDER_QUOTA_FLOORS[providerId].results)) continue;
    let source = event.sources.find((row) => row.provider === providerId);
    let providerResult: NormalizedSportsbookResult | null = null;
    try {
      if (provider.capabilities.bulkResults && provider.listResults) {
        const cacheKey = `${providerId}:${league}`;
        let pending = bulkCache.get(cacheKey);
        if (!pending) {
          pending = provider.listResults(league, new Date(now.getTime() - 3 * 86_400_000));
          bulkCache.set(cacheKey, pending);
        }
        const results = await pending;
        providerResult = source
          ? results.find((row) => row.providerEventId === source!.providerEventId) ?? null
          : results.find((row) => resultMatchesEvent(row, event)) ?? null;
      } else if (source) {
        providerResult = await provider.getResult(source.providerEventId, league);
      }
    } catch (error) {
      lastError = errorText(error);
      providerErrors.push({ provider: providerId, detail: lastError });
      if (source) await recordResultCheck(prisma, event, source, now, lastError, null);
      checks += 1;
      continue;
    }

    if (!providerResult) {
      lastError = `${provider.name} did not include this event.`;
      if (source) await recordResultCheck(prisma, event, source, now, lastError, null);
      checks += 1;
      continue;
    }
    if (!source) {
      source = await prisma.sportsbookEventSource.upsert({
        where: { provider_providerEventId: { provider: providerId, providerEventId: providerResult.providerEventId } },
        create: { eventId: event.id, provider: providerId, providerEventId: providerResult.providerEventId, lastSeenAt: now },
        update: {},
      });
      event.sources.push(source);
    }
    checks += 1;
    if (providerResult.status === 'FINAL' && (providerResult.scores.home === null || providerResult.scores.away === null)) {
      lastError = `${provider.name} marked the game final without both scores.`;
      await recordResultCheck(prisma, event, source, now, lastError, { ...providerResult, status: 'PRE' });
      continue;
    }
    await recordResultCheck(prisma, event, source, now, '', providerResult);
    if (providerResult.status === 'LIVE') { sawLive = true; break; }
    if (providerResult.status === 'FINAL' || providerResult.status === 'CANCELLED') sawTerminal = true;
    // PRE and null walk down the chain. Terminal evidence also walks on for a cheap cross-check.
  }

  if (sawLive) return { outcome: 'PENDING', detail: 'Game is still in progress.', checks, providerErrors };
  const evaluated = await evaluateSportsbookResultEvidence(prisma, event, now, via);
  if (!sawTerminal && evaluated.outcome === 'PENDING' && lastError) return { outcome: 'ERROR', detail: lastError, checks, providerErrors };
  return { ...evaluated, checks, providerErrors };
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
  failovers: number;
  errors: string[];
  warnings: string[];
}

/**
 * One feed run: claim the lease, poll each league's pregame moneylines, close lines the provider
 * dropped, check due results, then record health for admins. Throws only when the run produced
 * no usable snapshot (or crashed), after recording why, so the job monitor sees a failure.
 */
export async function refreshSportsbookCache(
  prisma: PrismaClient,
  keyOrKeys: string | SportsbookFeedKeys,
  now = new Date(),
  options: FeedDeps & { minIntervalMs?: number } = {},
): Promise<SportsbookRefreshResult> {
  const result: SportsbookRefreshResult = {
    skipped: null, oddsPolled: false, cacheUpdatedAt: null, nextOddsPollAt: null, snapshots: 0, failedSnapshots: 0, pulled: 0, resultChecks: 0, settled: 0, failovers: 0, errors: [], warnings: [],
  };
  const keys: SportsbookFeedKeys = {
    ...(typeof keyOrKeys === 'string' ? { [SPORTSBOOK_PROVIDER_ID]: keyOrKeys } : keyOrKeys),
    espn: 'public',
  };
  const configuredOddsIds = SPORTSBOOK_ODDS_PROVIDER_IDS.filter((id) => Boolean(keys[id]));
  const configuredIds = SPORTSBOOK_PROVIDER_IDS.filter((id) => Boolean(keys[id]));
  if (!configuredOddsIds.length) return { ...result, skipped: 'NO_KEY' };

  const cacheFilePath = options.cacheFilePath ?? DEFAULT_ODDS_CACHE_FILE;
  const { cache: initialCache, updatedAt: fileUpdatedAt } = await readOddsCache(cacheFilePath);
  const cacheKey = (provider: string, league: SportsbookLeagueKey, date: string) => `${provider}:${league}:${date}`;
  const cachedSnapshots = new Map(initialCache.snapshots.map((snapshot) => [
    cacheKey(snapshot.provider ?? SPORTSBOOK_PROVIDER_ID, snapshot.league, snapshot.date), snapshot,
  ]));

  await prisma.sportsbookProviderState.upsert({ where: { id: SPORTSBOOK_PROVIDER_ID }, create: { id: SPORTSBOOK_PROVIDER_ID }, update: {} });
  for (const id of configuredIds) {
    await prisma.sportsbookProviderState.upsert({ where: { id }, create: { id }, update: {} });
  }
  for (const { key } of SPORTSBOOK_LEAGUES) {
    await prisma.sportsbookLeagueProviderState.upsert({ where: { league: key }, create: { league: key }, update: {} });
  }
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

  const stateRows = await prisma.sportsbookProviderState.findMany({ where: { id: { in: configuredIds } } });
  const states = new Map(stateRows.map((state) => [state.id, state]));
  const providers = new Map<SportsbookProviderId, SportsbookProvider>();
  for (const id of configuredIds) {
    providers.set(id, createSportsbookProvider(id, keys[id]!, states.get(id)!, now, options));
  }
  const leagueRows = await prisma.sportsbookLeagueProviderState.findMany();
  const leagueStates = new Map(leagueRows.map((state) => [state.league as SportsbookLeagueKey, state]));
  // The file is the normal 30-minute cadence clock. Recovery polls can update individual
  // provider states without postponing the next scheduled full-cache refresh.
  const latestDbOddsAt = stateRows.filter((state) => configuredOddsIds.includes(state.id as typeof configuredOddsIds[number]))
    .flatMap((state) => [state.lastAttemptAt, state.lastPolledAt])
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const latestOddsAt = fileUpdatedAt ?? latestDbOddsAt;
  const minOddsIntervalMs = Math.max(SPORTSBOOK_ODDS_CACHE_INTERVAL_MS, options.minIntervalMs ?? 0);
  const oddsCacheDue = sportsbookOddsCacheDue(latestOddsAt, now, minOddsIntervalMs);
  result.cacheUpdatedAt = latestOddsAt?.toISOString() ?? null;
  result.nextOddsPollAt = latestOddsAt ? new Date(latestOddsAt.getTime() + minOddsIntervalMs).toISOString() : null;
  let crash: unknown = null;

  type RunLeagueActivity = {
    attempted: boolean; served: boolean; primary: boolean; switched: boolean; matcherMisses: number;
  };
  type ProviderRun = {
    attempted: boolean; snapshots: number; failedSnapshots: number; pulled: number;
    successfulLeagues: number; resultChecks: number; settled: number; matcherMisses: number;
    errors: string[]; leagues: LeagueStatusMap; leagueActivity: Partial<Record<SportsbookLeagueKey, RunLeagueActivity>>;
  };
  const providerRuns = new Map<SportsbookProviderId, ProviderRun>();
  for (const id of configuredIds) {
    providerRuns.set(id, {
      attempted: false, snapshots: 0, failedSnapshots: 0, pulled: 0,
      successfulLeagues: 0, resultChecks: 0, settled: 0, matcherMisses: 0,
      errors: [], leagues: parseLeagueStatus(states.get(id)!.leagueStatus), leagueActivity: {},
    });
  }

  const circuitOpen = (id: SportsbookProviderId) => {
    const until = states.get(id)?.circuitOpenUntil;
    return Boolean(until && until > now);
  };
  const halfOpen = (id: SportsbookProviderId) => {
    const state = states.get(id);
    return Boolean(state?.circuitOpenUntil && state.circuitOpenUntil <= now && state.consecutiveFailures >= SPORTSBOOK_CIRCUIT_FAILURES);
  };
  const halfOpenOutcome = new Map<SportsbookProviderId, 'PASSED' | 'FAILED'>();
  let usableLeagues = 0;

  // During the normal cooldown, recover only leagues whose active source failed and whose
  // alternate has not been polled in the last 30 minutes. A healthy league costs nothing.
  // Pinned leagues must not silently move to a different source.
  const recoveryLeagues = oddsCacheDue ? [] : SPORTSBOOK_LEAGUES.filter(({ key }) => {
    const leagueState = leagueStates.get(key)!;
    if (leagueState.pinnedOddsProvider) return false;
    const chain = SPORTSBOOK_ODDS_CHAINS[key].filter((id) => providers.has(id));
    const active = chain.includes(leagueState.activeOddsProvider as SportsbookProviderId)
      ? leagueState.activeOddsProvider as SportsbookProviderId : chain[0];
    if (!active) return false;
    const alternates = chain.filter((id) => id !== active);
    const next = sportsbookNextRecoveryAt(
      providerRuns.get(active)?.leagues[key],
      alternates.map((id) => providerRuns.get(id)?.leagues[key]),
    );
    return Boolean(next && next <= now && alternates.some((id) =>
      sportsbookProviderCooldownElapsed(providerRuns.get(id)?.leagues[key], now)
      && !circuitOpen(id)
      && !providers.get(id)!.session.quotaBelow(SPORTSBOOK_PROVIDER_QUOTA_FLOORS[id].odds)));
  });

  const suspiciousEmpty = async (league: SportsbookLeagueKey, date: string, events: NormalizedSportsbookEvent[]) => {
    if (events.some((event) => event.prices.moneyline.home !== null || event.prices.moneyline.away !== null)) return false;
    const day = new Date(`${date}T00:00:00.000Z`);
    const known = await prisma.sportsbookEvent.count({ where: {
      sport: league, status: 'PRE', settledAt: null,
      startsAt: { gte: new Date(day.getTime() - PROVIDER_DATE_OFFSET_HOURS * 3_600_000), lt: new Date(day.getTime() + 86_400_000) },
      OR: [{ homeOdds: { not: null } }, { awayOdds: { not: null } }],
      sources: { some: {} },
    } });
    return known > 0;
  };

  try {

    const normalOddsPoll = oddsCacheDue && configuredOddsIds.some((id) => {
      const provider = providers.get(id)!;
      return !circuitOpen(id) && !provider.session.quotaBelow(SPORTSBOOK_PROVIDER_QUOTA_FLOORS[id].odds);
    });
    result.oddsPolled = normalOddsPoll || recoveryLeagues.length > 0;
    if (!oddsCacheDue && !recoveryLeagues.length) result.skipped = 'CACHE_FRESH';
    if (oddsCacheDue && !normalOddsPoll) result.errors.push('Odds polling paused: every configured provider is circuit-open or near its quota floor.');
    if (normalOddsPoll) {
      // Persist the normal cooldown before spending, shared by scheduled and manual pulls.
      await prisma.sportsbookProviderState.update({ where: { id: SPORTSBOOK_PROVIDER_ID }, data: { lastAttemptAt: now } });
      await writeOddsCache(cacheFilePath, { ...initialCache, updatedAt: iso(now) });
    }
    const dates = sportsbookPollDates(now);
    let fallbacksThisRun = 0;
    for (const league of result.oddsPolled ? (normalOddsPoll ? SPORTSBOOK_LEAGUES : recoveryLeagues) : []) {
      const leagueState = leagueStates.get(league.key)!;
      const chain = SPORTSBOOK_ODDS_CHAINS[league.key].filter((id) => providers.has(id));
      const primary = chain[0];
      if (!primary) continue;
      const pinned = leagueState.pinnedOddsProvider as SportsbookProviderId | null;
      const active = chain.includes(leagueState.activeOddsProvider as SportsbookProviderId)
        ? leagueState.activeOddsProvider as SportsbookProviderId
        : primary;
      const primaryRecovered = active !== primary && (states.get(primary)?.consecutiveSuccesses ?? 0) >= 2;
      const preferred = pinned && chain.includes(pinned) ? pinned : primaryRecovered ? primary : active;
      const activeStatus = providerRuns.get(active)?.leagues[league.key];
      // A successful recovery just refreshed this league; do not charge for it again.
      if (normalOddsPoll && activeStatus?.lastAttemptAt === activeStatus?.lastSuccessAt
        && !sportsbookProviderCooldownElapsed(activeStatus, now)) continue;
      const order = pinned ? [preferred]
        : normalOddsPoll ? [preferred, ...chain.filter((id) => id !== preferred)]
        : chain.filter((id) => id !== active && sportsbookProviderCooldownElapsed(providerRuns.get(id)?.leagues[league.key], now));
      let selected: SportsbookProviderId | null = null;
      let leagueFailure = '';
      let alternates = 0;

      for (const id of order) {
        if (id !== preferred) {
          if (alternates >= SPORTSBOOK_FALLBACKS_PER_LEAGUE || fallbacksThisRun >= SPORTSBOOK_FALLBACKS_PER_RUN) break;
          alternates += 1;
          fallbacksThisRun += 1;
          result.failovers += 1;
        }
        const provider = providers.get(id)!;
        const run = providerRuns.get(id)!;
        const status: SportsbookLeagueFeedStatus = run.leagues[league.key]
          ?? { lastAttemptAt: null, lastSuccessAt: null, lastError: '', lastErrorAt: null, eventsSeen: 0 };
        if (halfOpen(id) && halfOpenOutcome.get(id) === 'FAILED') {
          leagueFailure = `${sportsbookProviderName(id)} half-open probe already failed this run`;
          Object.assign(status, { lastError: leagueFailure, lastErrorAt: iso(now) });
          run.leagues[league.key] = status;
          continue;
        }
        if (circuitOpen(id)) {
          leagueFailure = `${sportsbookProviderName(id)} circuit is open until ${states.get(id)!.circuitOpenUntil!.toISOString()}`;
          Object.assign(status, { lastError: leagueFailure, lastErrorAt: iso(now) });
          run.leagues[league.key] = status;
          run.errors.push(`${league.key} ${leagueFailure}`);
          continue;
        }
        if (provider.session.quotaBelow(SPORTSBOOK_PROVIDER_QUOTA_FLOORS[id].odds)) {
          leagueFailure = `${sportsbookProviderName(id)} quota is near its floor`;
          Object.assign(status, { lastError: leagueFailure, lastErrorAt: iso(now) });
          run.leagues[league.key] = status;
          run.errors.push(`${league.key} ${leagueFailure}`);
          continue;
        }
        run.attempted = true;
        const activity = run.leagueActivity[league.key] ?? {
          attempted: false, served: false, primary: id === primary, switched: false, matcherMisses: 0,
        };
        activity.attempted = true;
        run.leagueActivity[league.key] = activity;
        status.lastAttemptAt = iso(now);

        const snapshots: NormalizedSportsbookEvent[] = [];
        let complete = true;
        let allDatesFetched = true;
        for (const date of dates) {
          const cached = cachedSnapshots.get(cacheKey(id, league.key, date));
          if (!shouldPollSportsbookDate(date, now, cached)) {
            allDatesFetched = false;
            continue;
          }
          try {
            const events = await provider.listEvents(league.key, [date]);
            const day = new Date(`${date}T00:00:00.000Z`);
            const attemptCoversWindow = [...snapshots, ...events].some((event) =>
              event.startsAt >= new Date(day.getTime() - PROVIDER_DATE_OFFSET_HOURS * 3_600_000)
              && event.startsAt < new Date(day.getTime() + 86_400_000)
              && (event.prices.moneyline.home !== null || event.prices.moneyline.away !== null));
            if (!attemptCoversWindow && await suspiciousEmpty(league.key, date, events)) {
              throw new ProviderError('PAYLOAD', 'Suspicious empty snapshot while another source still has future priced games.');
            }
            cachedSnapshots.set(cacheKey(id, league.key, date), { provider: id, league: league.key, date, events, fetchedAt: iso(now) });
            snapshots.push(...events);
            run.snapshots += 1;
            result.snapshots += 1;
          } catch (error) {
            if (!(error instanceof ProviderError)) throw error;
            complete = false;
            run.failedSnapshots += 1;
            result.failedSnapshots += 1;
            leagueFailure = `${date}: ${error.message}`;
            run.errors.push(`${league.key} ${leagueFailure}`);
            if (halfOpen(id)) halfOpenOutcome.set(id, 'FAILED');
            break;
          }
        }
        if (!complete) {
          Object.assign(status, { lastError: leagueFailure, lastErrorAt: iso(now) });
          run.leagues[league.key] = status;
          continue;
        }

        const stored = await storeSnapshot(prisma, id, league.key, snapshots, now, true);
        result.warnings.push(...stored.unmatched);
        run.matcherMisses += stored.unmatched.length;
        activity.matcherMisses += stored.unmatched.length;
        if (allDatesFetched) {
          const pulled = await pullMissingLines(prisma, id, league.key, dates, now);
          run.pulled += pulled;
          result.pulled += pulled;
        }
        Object.assign(status, { lastSuccessAt: iso(now), lastError: '', eventsSeen: stored.seen });
        run.leagues[league.key] = status;
        if (halfOpen(id)) halfOpenOutcome.set(id, 'PASSED');
        selected = id;
        run.successfulLeagues += 1;
        activity.served = true;
        activity.switched = id !== active;
        usableLeagues += 1;
        if (id !== active) {
          await prisma.sportsbookLeagueProviderState.update({
            where: { league: league.key }, data: { activeOddsProvider: id, activeSince: now },
          });
          result.warnings.push(`${league.key} odds switched from ${sportsbookProviderName(active)} to ${sportsbookProviderName(id)}.`);
        }
        break;
      }
      if (!selected) result.errors.push(`${league.key} ${leagueFailure || 'no configured provider could supply a complete snapshot'}`);
    }

    if (result.oddsPolled && result.snapshots > 0) {
      // Keep provider responses on disk; Postgres remains the transactional player-facing projection.
      const completedAt = new Date(Math.max(now.getTime(), Date.now()));
      const nextCache: OddsCacheFile = {
        version: 1,
        // A recovery run must not reset the shared normal-poll clock.
        updatedAt: normalOddsPoll ? completedAt.toISOString() : initialCache.updatedAt,
        snapshots: [...cachedSnapshots.values()],
      };
      await writeOddsCache(cacheFilePath, nextCache);
      result.cacheUpdatedAt = nextCache.updatedAt;
      result.nextOddsPollAt = new Date(Date.parse(nextCache.updatedAt!) + minOddsIntervalMs).toISOString();
    }

    // Results only for games with open tickets. Bulk provider calls are shared across the league.
    const candidates = await prisma.sportsbookEvent.findMany({
      where: {
        settledAt: null, status: { in: ['PRE', 'LIVE', 'PULLED'] }, startsAt: { lte: now },
        bets: { some: { status: 'OPEN' } },
      },
      orderBy: [{ startsAt: 'asc' }],
      include: { sources: { orderBy: { lastSeenAt: 'desc' } } },
      take: 200,
    });
    const due: Array<(typeof candidates)[number]> = [];
    for (const event of candidates) {
      if (!event.sources.some((source) => source.provider === event.oddsProvider)
        && providers.has(event.oddsProvider as SportsbookProviderId)) {
        event.sources.push(await ensureSportsbookEventSource(prisma, event.oddsProvider, event));
      }
      if (isResultCheckDue(event, now)) due.push(event);
      if (due.length >= RESULT_CHECKS_PER_RUN) break;
    }
    const bulkResults: ResultBulkCache = new Map();
    const resultProviders = new Map([...providers].filter(([id]) => !circuitOpen(id)));
    for (const event of due) {
      const requestCounts = new Map([...providers].map(([id, provider]) => [id, provider.session.requests]));
      const checked = await checkSportsbookResultChain(prisma, resultProviders, event, now, 'FEED', bulkResults);
      result.resultChecks += checked.checks;
      if (checked.outcome === 'SETTLED' || checked.outcome === 'VOIDED') result.settled += 1;
      if (checked.outcome === 'ERROR') {
        const detail = `Result ${event.id}: ${checked.detail}`;
        result.errors.push(detail);
      }
      if (checked.outcome === 'DISPUTED') result.warnings.push(`${event.awayTeam} at ${event.homeTeam}: ${checked.detail}`);
      for (const error of checked.providerErrors) {
        providerRuns.get(error.provider)?.errors.push(`Result ${event.id}: ${error.detail}`);
      }
      for (const [id, provider] of providers) {
        const run = providerRuns.get(id)!;
        const requests = provider.session.requests - (requestCounts.get(id) ?? 0);
        if (requests > 0) { run.attempted = true; run.resultChecks += requests; }
        if ((checked.outcome === 'SETTLED' || checked.outcome === 'VOIDED') && requests > 0) run.settled += 1;
      }
    }
  } catch (error) {
    crash = error;
    result.errors.push(`Feed run crashed: ${errorText(error)}`);
  } finally {
    for (const id of configuredIds) {
      const provider = providers.get(id)!;
      const run = providerRuns.get(id)!;
      const previous = states.get(id)!;
      const succeeded = run.successfulLeagues > 0;
      const failed = run.attempted && !succeeded && (Boolean(crash) || run.errors.length > 0 || provider.session.stopped !== null);
      const failures = failed ? previous.consecutiveFailures + 1 : succeeded ? 0 : previous.consecutiveFailures;
      const openCircuit = failed && failures >= SPORTSBOOK_CIRCUIT_FAILURES;
      await prisma.sportsbookProviderState.update({ where: { id }, data: {
        ...(id === SPORTSBOOK_PROVIDER_ID ? { pollLeaseUntil: null } : {}),
        ...(run.attempted ? { lastAttemptAt: now } : {}),
        ...(succeeded ? { lastPolledAt: now, lastSuccessAt: now } : {}),
        ...(run.resultChecks > 0 ? { lastResultCheckAt: now } : {}),
        ...provider.session.usageData(now),
        leagueStatus: run.leagues as Prisma.InputJsonValue,
        consecutiveFailures: failures,
        consecutiveSuccesses: succeeded ? previous.consecutiveSuccesses + 1 : failed ? 0 : previous.consecutiveSuccesses,
        circuitOpenUntil: succeeded ? null : openCircuit ? new Date(now.getTime() + SPORTSBOOK_CIRCUIT_OPEN_MS) : previous.circuitOpenUntil,
        lastError: run.attempted ? run.errors.join(' · ').slice(0, 500) : previous.lastError,
        ...(run.errors.length ? { lastErrorAt: now } : {}),
      } });
      if (run.attempted) {
        await prisma.sportsbookFeedRun.create({ data: {
          startedAt: now, provider: id, oddsPolled: run.snapshots > 0 || run.failedSnapshots > 0,
          requests: provider.session.requests, datapoints: provider.session.datapoints,
          snapshots: run.snapshots, failedSnapshots: run.failedSnapshots, pulled: run.pulled,
          resultChecks: run.resultChecks, settled: run.settled, matcherMisses: run.matcherMisses,
          leagueActivity: run.leagueActivity as Prisma.InputJsonValue, failed,
          error: run.errors.join(' · ').slice(0, 500),
        } });
      }
    }
    if (!configuredIds.includes(SPORTSBOOK_PROVIDER_ID)) {
      await prisma.sportsbookProviderState.update({ where: { id: SPORTSBOOK_PROVIDER_ID }, data: { pollLeaseUntil: null } });
    }
    await prisma.sportsbookFeedRun.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - FEED_RUN_RETENTION_DAYS * 86_400_000) } } });
  }
  if (crash) throw crash;
  if (result.oddsPolled && usableLeagues === 0) {
    throw new Error(`Sportsbook feed produced no odds snapshot: ${result.errors.join(' · ')}`);
  }
  return result;
}
