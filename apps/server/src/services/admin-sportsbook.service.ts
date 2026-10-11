import type { PrismaClient } from '@prisma/client';
import {
  SPORTSBOOK_QUOTA_ODDS_FLOOR,
  SPORTSBOOK_QUOTA_RESULTS_FLOOR,
  type AdminSportsbookActionDto,
  type AdminSportsbookDto,
  type AdminSportsbookProviderCheckDto,
  type AdminSportsbookReviewCriterion,
  type AdminSportsbookReviewDto,
  type SportsbookEventStatus,
  type SportsbookLeagueKey,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import {
  ProviderSession,
  SPORTSBOOK_PROVIDER_ID,
  ProviderError,
  checkSportsbookResult,
  parseLeagueStatus,
  summarizeSnapshot,
  type FeedDeps,
} from './sportsbook-feed.service.js';
import { SPORTSBOOK_LEAGUES, dateKey, settleSportsbookEventTx, sportsbookFeedStatus } from './sportsbook.service.js';

type FeedConfig = { configured: boolean; pollMinutes: number; apiKey?: string };

const isoOrNull = (date: Date | null | undefined) => date?.toISOString() ?? null;

/**
 * 1.8.0-E. What the first market has to show before a league or market is added: enough real
 * history, results the feed grades on its own, nothing stuck, a reliable poller, and quota to spare
 * (a second market roughly doubles each snapshot). Values are the release decision's thresholds.
 */
export const SPORTSBOOK_EXPANSION_THRESHOLDS = {
  windowDays: 30,
  minDaysWithSnapshots: 14,
  minGradedGames: 50,
  minFeedGradedShare: 0.98,
  maxStuckOver24h: 0,
  maxFailedRunShare: 0.05,
  maxProjectedQuotaShare: 0.5,
} as const;

const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]! : null);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

async function marketReview(
  prisma: PrismaClient,
  quota: { limit: number; period: string },
  now: Date,
): Promise<AdminSportsbookReviewDto> {
  const t = SPORTSBOOK_EXPANSION_THRESHOLDS;
  const since = new Date(now.getTime() - t.windowDays * 86_400_000);
  const [runs, graded, feedSettled, stuckOver24h] = await Promise.all([
    prisma.sportsbookFeedRun.findMany({ where: { startedAt: { gte: since, lte: now } }, orderBy: { startedAt: 'asc' }, select: { startedAt: true, datapoints: true, snapshots: true, failed: true } }),
    prisma.sportsbookEvent.groupBy({ by: ['settledVia', 'status'], where: { settledAt: { gte: since, lte: now } }, _count: { _all: true } }),
    prisma.sportsbookEvent.findMany({ where: { settledAt: { gte: since, lte: now }, settledVia: 'FEED' }, select: { startsAt: true, settledAt: true }, take: 2_000 }),
    prisma.sportsbookEvent.count({ where: { settledAt: null, startsAt: { lte: new Date(now.getTime() - 86_400_000) }, bets: { some: { status: 'OPEN' } } } }),
  ]);
  const count = (via: string, status?: string) => graded.filter((row) => row.settledVia === via && (!status || row.status === status)).reduce((sum, row) => sum + row._count._all, 0);
  const settled = {
    total: graded.reduce((sum, row) => sum + row._count._all, 0),
    feed: count('FEED'), voidedByFeed: count('FEED', 'VOID'), adminRecheck: count('ADMIN_RECHECK'), adminVoid: count('ADMIN_VOID'),
  };
  const hours = feedSettled.map((row) => (row.settledAt!.getTime() - row.startsAt.getTime()) / 3_600_000).sort((a, b) => a - b);
  const failedRuns = runs.filter((run) => run.failed).length;
  const daysWithSnapshots = new Set(runs.filter((run) => run.snapshots > 0).map((run) => dateKey(run.startedAt))).size;
  const datapoints = runs.reduce((sum, run) => sum + run.datapoints, 0);
  // Spread over the days the feed has actually been running, so a new feed is not flattered.
  const spanDays = runs.length ? Math.min(t.windowDays, Math.max(1, (now.getTime() - runs[0]!.startedAt.getTime()) / 86_400_000)) : 0;
  const datapointsPerDay = spanDays ? datapoints / spanDays : 0;
  const daily = quota.period.toLowerCase().includes('day');
  const projectedPerPeriod = runs.length ? Math.round(datapointsPerDay * (daily ? 1 : 30)) : null;
  const feedShare = settled.total ? settled.feed / settled.total : 0;
  const failedShare = runs.length ? failedRuns / runs.length : 1;
  const quotaShare = projectedPerPeriod !== null && quota.limit > 0 ? projectedPerPeriod / quota.limit : null;

  const criteria: AdminSportsbookReviewCriterion[] = [
    { key: 'history', label: 'Days with a successful odds snapshot', value: `${daysWithSnapshots} days`, target: `at least ${t.minDaysWithSnapshots}`, pass: daysWithSnapshots >= t.minDaysWithSnapshots },
    { key: 'sample', label: 'Games graded', value: `${settled.total}`, target: `at least ${t.minGradedGames}`, pass: settled.total >= t.minGradedGames },
    { key: 'auto', label: 'Graded by the feed without an admin', value: settled.total ? percent(feedShare) : 'no games yet', target: `at least ${percent(t.minFeedGradedShare)}`, pass: settled.total > 0 && feedShare >= t.minFeedGradedShare },
    { key: 'stuck', label: 'Games still waiting 24 hours after the start', value: `${stuckOver24h}`, target: `${t.maxStuckOver24h}`, pass: stuckOver24h <= t.maxStuckOver24h },
    { key: 'failures', label: 'Feed runs that got no odds', value: runs.length ? `${failedRuns} of ${runs.length} (${percent(failedShare)})` : 'no runs yet', target: `at most ${percent(t.maxFailedRunShare)}`, pass: runs.length > 0 && failedShare <= t.maxFailedRunShare },
    { key: 'quota', label: `Projected datapoints per ${daily ? 'day' : 'month'}`, value: quotaShare === null ? (quota.limit ? 'no runs yet' : 'quota limit not reported') : `${projectedPerPeriod!.toLocaleString('en-US')} (${percent(quotaShare)} of quota)`, target: `at most ${percent(t.maxProjectedQuotaShare)} of quota`, pass: quotaShare !== null && quotaShare <= t.maxProjectedQuotaShare },
  ];
  return {
    windowDays: t.windowDays, runs: runs.length, failedRuns, daysWithSnapshots, datapoints,
    datapointsPerDay: Math.round(datapointsPerDay), projectedPerPeriod, period: quota.period,
    settled, hoursToSettle: { median: round1(quantile(hours, 0.5)), p90: round1(quantile(hours, 0.9)) },
    stuckOver24h, criteria, ready: criteria.every((criterion) => criterion.pass),
  };
}

/** 1.8.0-C. Feed health, quota and unresolved results for staff, plus two audited repairs. */
export const AdminSportsbookService = {
  async report(prisma: PrismaClient, config: FeedConfig, now = new Date()): Promise<AdminSportsbookDto> {
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const [state, upcoming, openTotals, unresolved, settledEvents, settledTickets] = await Promise.all([
      prisma.sportsbookProviderState.findUnique({ where: { id: SPORTSBOOK_PROVIDER_ID } }),
      prisma.sportsbookEvent.groupBy({
        by: ['sport', 'status'], where: { startsAt: { gt: now }, status: { in: ['PRE', 'PULLED'] } }, _count: { _all: true },
      }),
      prisma.sportsbookBet.aggregate({ where: { status: 'OPEN' }, _count: { _all: true }, _sum: { stakeCents: true, payoutCents: true } }),
      prisma.sportsbookEvent.findMany({
        where: { settledAt: null, startsAt: { lte: now }, bets: { some: { status: 'OPEN' } } },
        include: { bets: { where: { status: 'OPEN' }, select: { stakeCents: true, payoutCents: true } } },
        orderBy: { startsAt: 'asc' }, take: 50,
      }),
      prisma.sportsbookEvent.count({ where: { settledAt: { gte: dayAgo } } }),
      prisma.sportsbookBet.count({ where: { settledAt: { gte: dayAgo } } }),
    ]);
    const leagues = parseLeagueStatus(state?.leagueStatus);
    const review = await marketReview(prisma, { limit: state?.datapointsLimit ?? 0, period: state?.datapointsPeriod ?? '' }, now);
    const count = (sport: string, status: string) => upcoming.find((row) => row.sport === sport && row.status === status)?._count._all ?? 0;
    const remaining = state?.datapointsRemaining ?? null;
    return {
      generatedAt: now.toISOString(),
      configured: config.configured,
      pollMinutes: config.pollMinutes,
      feed: {
        status: sportsbookFeedStatus({ configured: config.configured, lastPolledAt: state?.lastPolledAt }, now),
        lastPolledAt: isoOrNull(state?.lastPolledAt),
        lastAttemptAt: isoOrNull(state?.lastAttemptAt),
        lastResultCheckAt: isoOrNull(state?.lastResultCheckAt),
        consecutiveFailures: state?.consecutiveFailures ?? 0,
        lastError: state?.lastError ?? '',
        lastErrorAt: isoOrNull(state?.lastErrorAt),
        pollInProgress: Boolean(state?.pollLeaseUntil && state.pollLeaseUntil > now),
      },
      quota: {
        used: state?.datapointsUsed ?? 0,
        limit: state?.datapointsLimit ?? 0,
        remaining,
        period: state?.datapointsPeriod ?? '',
        lastRunDatapoints: state?.lastDatapoints ?? 0,
        observedAt: isoOrNull(state?.quotaObservedAt),
        oddsPaused: remaining !== null && remaining <= SPORTSBOOK_QUOTA_ODDS_FLOOR,
        resultsPaused: remaining !== null && remaining <= SPORTSBOOK_QUOTA_RESULTS_FLOOR,
      },
      leagues: SPORTSBOOK_LEAGUES.map(({ key, name }) => ({
        key, name,
        lastAttemptAt: leagues[key]?.lastAttemptAt ?? null,
        lastSuccessAt: leagues[key]?.lastSuccessAt ?? null,
        lastError: leagues[key]?.lastError ?? '',
        lastErrorAt: leagues[key]?.lastErrorAt ?? null,
        eventsSeen: leagues[key]?.eventsSeen ?? 0,
        upcoming: count(key, 'PRE'),
        pulled: count(key, 'PULLED'),
      })),
      exposure: {
        openTickets: openTotals._count._all,
        openStakeCents: Number(openTotals._sum.stakeCents ?? 0n),
        openPayoutCents: Number(openTotals._sum.payoutCents ?? 0n),
      },
      settledLast24h: { events: settledEvents, tickets: settledTickets },
      review,
      unresolved: unresolved.map((event) => ({
        id: event.id, sport: event.sport as SportsbookLeagueKey, homeTeam: event.homeTeam, awayTeam: event.awayTeam,
        startsAt: event.startsAt.toISOString(), status: event.status as SportsbookEventStatus,
        openTickets: event.bets.length,
        openStakeCents: event.bets.reduce((sum, bet) => sum + Number(bet.stakeCents), 0),
        openPayoutCents: event.bets.reduce((sum, bet) => sum + Number(bet.payoutCents), 0),
        resultCheckCount: event.resultCheckCount,
        resultCheckedAt: isoOrNull(event.resultCheckedAt),
        nextResultCheckAt: isoOrNull(event.nextResultCheckAt),
        resultError: event.resultError,
      })),
    };
  },

  /**
   * Ask the provider for this game's result now, outside its schedule. Settlement is the same
   * locked, exactly-once path the poller uses, so racing the poller cannot pay twice.
   */
  async recheck(
    prisma: PrismaClient,
    config: FeedConfig,
    actor: AuditActor,
    eventId: string,
    now = new Date(),
    deps: FeedDeps = {},
  ): Promise<AdminSportsbookActionDto> {
    if (!config.apiKey) throw AppError.conflict('SPORTSBOOK_FEED_OFF', 'The odds feed has no provider key on this server.');
    const event = await prisma.sportsbookEvent.findUnique({ where: { id: eventId } });
    if (!event) throw AppError.notFound('SPORTSBOOK_EVENT_NOT_FOUND', 'That sportsbook game does not exist.');
    if (event.settledAt) throw AppError.conflict('SPORTSBOOK_ALREADY_SETTLED', 'That game is already settled.');
    if (event.startsAt > now) throw AppError.conflict('SPORTSBOOK_NOT_STARTED', 'That game has not started, so there is no result to check.');
    await prisma.sportsbookProviderState.upsert({ where: { id: SPORTSBOOK_PROVIDER_ID }, create: { id: SPORTSBOOK_PROVIDER_ID }, update: {} });
    const state = await prisma.sportsbookProviderState.findUniqueOrThrow({ where: { id: SPORTSBOOK_PROVIDER_ID } });
    const session = ProviderSession.fromState(config.apiKey, state, now, deps);
    const checked = await checkSportsbookResult(prisma, session, event, now, 'ADMIN_RECHECK');
    await prisma.sportsbookProviderState.update({
      where: { id: SPORTSBOOK_PROVIDER_ID }, data: { ...session.usageData(now), lastResultCheckAt: now },
    });
    await AdminAuditService.record(prisma, actor, {
      action: 'sportsbook.recheck', targetType: 'sportsbook-event', targetId: event.id,
      before: { status: event.status, resultCheckCount: event.resultCheckCount, resultError: event.resultError },
      after: checked,
    });
    return { message: checked.detail, report: await this.report(prisma, config, now) };
  },

  /**
   * 1.8.0-E release gate: fetch one league's live snapshot for today and report what the feed makes
   * of it, without storing events. One request, so a few datapoints.
   */
  async providerCheck(
    prisma: PrismaClient,
    config: FeedConfig,
    actor: AuditActor,
    leagueKey: SportsbookLeagueKey,
    now = new Date(),
    deps: FeedDeps = {},
  ): Promise<AdminSportsbookProviderCheckDto> {
    if (!config.apiKey) throw AppError.conflict('SPORTSBOOK_FEED_OFF', 'The odds feed has no provider key on this server.');
    const league = SPORTSBOOK_LEAGUES.find((row) => row.key === leagueKey)!;
    await prisma.sportsbookProviderState.upsert({ where: { id: SPORTSBOOK_PROVIDER_ID }, create: { id: SPORTSBOOK_PROVIDER_ID }, update: {} });
    const state = await prisma.sportsbookProviderState.findUniqueOrThrow({ where: { id: SPORTSBOOK_PROVIDER_ID } });
    const session = ProviderSession.fromState(config.apiKey, state, now, deps);
    const date = dateKey(now);
    let summary: AdminSportsbookProviderCheckDto['summary'] = null;
    let error = '';
    try {
      const payload = await session.get(`/sports/${league.sportId}/events/${date}`, {
        market_ids: '1', affiliate_ids: '3', main_line: 'true', hide_closed: 'true',
      });
      if (!Array.isArray(payload.events)) error = 'The response has no events list.';
      else summary = summarizeSnapshot(payload.events);
    } catch (caught) {
      if (!(caught instanceof ProviderError)) throw caught;
      error = caught.message;
    }
    await prisma.sportsbookProviderState.update({ where: { id: SPORTSBOOK_PROVIDER_ID }, data: session.usageData(now) });
    await AdminAuditService.record(prisma, actor, {
      action: 'sportsbook.provider-check', targetType: 'sportsbook-league', targetId: league.key,
      after: { date, error, events: summary?.events ?? 0, parsed: summary?.parsed ?? 0, datapoints: session.datapoints },
    });
    return {
      league: league.key, date, checkedAt: now.toISOString(), ok: !error, error, summary,
      quota: { datapoints: session.datapoints, used: session.used, limit: session.limit, remaining: session.remaining, period: session.period },
    };
  },

  /** Refund every open ticket on a game the provider will never grade. Cannot be undone. */
  async void(
    prisma: PrismaClient,
    config: FeedConfig,
    actor: AuditActor,
    eventId: string,
    reason: string,
    now = new Date(),
  ): Promise<AdminSportsbookActionDto> {
    const message = await prisma.$transaction(async (tx) => {
      const before = await tx.sportsbookEvent.findUnique({ where: { id: eventId } });
      if (!before) throw AppError.notFound('SPORTSBOOK_EVENT_NOT_FOUND', 'That sportsbook game does not exist.');
      const settled = await settleSportsbookEventTx(tx, eventId, 'VOID', null, null, now, 'ADMIN_VOID');
      if (!settled) throw AppError.conflict('SPORTSBOOK_ALREADY_SETTLED', 'That game is already settled.');
      await AdminAuditService.record(tx, actor, {
        action: 'sportsbook.void', targetType: 'sportsbook-event', targetId: eventId, reason,
        before: { status: before.status, startsAt: before.startsAt, matchup: `${before.awayTeam} at ${before.homeTeam}` },
        after: { status: 'VOID', tickets: settled.tickets, refundedCents: settled.creditedCents.toString() },
      });
      return `Voided ${before.awayTeam} at ${before.homeTeam}; ${settled.tickets} ticket(s) refunded.`;
    });
    return { message, report: await this.report(prisma, config, now) };
  },
};
