import type { PrismaClient, SportsbookProviderState } from '@prisma/client';
import {
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
  SPORTSBOOK_PROVIDER_ID,
  checkSportsbookResultChain,
  ensureSportsbookEventSource,
  parseLeagueStatus,
  refreshSportsbookCache,
  sportsbookNextRecoveryAt,
  type FeedDeps,
} from './sportsbook-feed.service.js';
import { ProviderError } from './sportsbook/sportsbook-provider.js';
import {
  createSportsbookProvider,
  DEFAULT_SPORTSBOOK_PROVIDER_ID,
  SPORTSBOOK_ODDS_CHAINS,
  SPORTSBOOK_PROVIDER_IDS,
  SPORTSBOOK_PROVIDER_QUOTA_FLOORS,
  sportsbookProviderName,
  type SportsbookProviderId,
  type SportsbookProviderKeys,
} from './sportsbook/sportsbook-providers.js';
import { SPORTSBOOK_LEAGUES, dateKey, settleSportsbookEventTx, sportsbookFeedStatus } from './sportsbook.service.js';

export type FeedConfig = { configured: boolean; pollMinutes: number; apiKey?: string; keys?: SportsbookProviderKeys };

const feedKeys = (config: FeedConfig): SportsbookProviderKeys => {
  const keys = config.keys ?? { [SPORTSBOOK_PROVIDER_ID]: config.apiKey ?? '' };
  return Object.entries(keys).some(([id, key]) => id !== 'espn' && Boolean(key)) ? { ...keys, espn: 'public' } : keys;
};

const isoOrNull = (date: Date | null | undefined) => date?.toISOString() ?? null;

/**
 * 1.8.0-E. What the first market has to show before a league or market is added: enough real
 * history, results the feed grades on its own, nothing stuck, a reliable poller, and quota to spare
 * (a second market roughly doubles each snapshot). Values are the release decision's thresholds.
 */
export const SPORTSBOOK_EXPANSION_THRESHOLDS = {
  windowDays: 30,
  minObservedDays: 30,
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
type StoredLeagueActivity = { attempted: boolean; served: boolean; primary: boolean; switched: boolean; matcherMisses: number };

function leagueActivity(value: unknown): Partial<Record<SportsbookLeagueKey, StoredLeagueActivity>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const parsed: Partial<Record<SportsbookLeagueKey, StoredLeagueActivity>> = {};
  for (const { key } of SPORTSBOOK_LEAGUES) {
    const row = (value as Record<string, unknown>)[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const data = row as Record<string, unknown>;
    parsed[key] = {
      attempted: data.attempted === true, served: data.served === true, primary: data.primary === true,
      switched: data.switched === true, matcherMisses: typeof data.matcherMisses === 'number' ? data.matcherMisses : 0,
    };
  }
  return parsed;
}

async function marketReview(
  prisma: PrismaClient,
  providerStates: SportsbookProviderState[],
  now: Date,
): Promise<AdminSportsbookReviewDto> {
  const t = SPORTSBOOK_EXPANSION_THRESHOLDS;
  const since = new Date(now.getTime() - t.windowDays * 86_400_000);
  const [runs, graded, feedSettled, stuckOver24h, openDisputes] = await Promise.all([
    prisma.sportsbookFeedRun.findMany({
      where: { startedAt: { gte: since, lte: now } }, orderBy: { startedAt: 'asc' },
      select: { startedAt: true, provider: true, requests: true, datapoints: true, snapshots: true, failed: true, matcherMisses: true, leagueActivity: true },
    }),
    prisma.sportsbookEvent.groupBy({ by: ['settledVia', 'status'], where: { settledAt: { gte: since, lte: now } }, _count: { _all: true } }),
    prisma.sportsbookEvent.findMany({ where: { settledAt: { gte: since, lte: now }, settledVia: 'FEED' }, select: { startsAt: true, settledAt: true }, take: 2_000 }),
    prisma.sportsbookEvent.count({ where: { settledAt: null, startsAt: { lte: new Date(now.getTime() - 86_400_000) }, bets: { some: { status: 'OPEN' } } } }),
    prisma.sportsbookEvent.count({ where: { status: 'DISPUTED', settledAt: null } }),
  ]);
  const count = (via: string, status?: string) => graded.filter((row) => row.settledVia === via && (!status || row.status === status)).reduce((sum, row) => sum + row._count._all, 0);
  const settled = {
    total: graded.reduce((sum, row) => sum + row._count._all, 0),
    feed: count('FEED'), voidedByFeed: count('FEED', 'VOID'), adminRecheck: count('ADMIN_RECHECK'),
    adminResolution: count('ADMIN_RESOLUTION'), adminVoid: count('ADMIN_VOID'),
  };
  const hours = feedSettled.map((row) => (row.settledAt!.getTime() - row.startsAt.getTime()) / 3_600_000).sort((a, b) => a - b);
  const failedRuns = runs.filter((run) => run.failed).length;
  const daysWithSnapshots = new Set(runs.filter((run) => run.snapshots > 0).map((run) => dateKey(run.startedAt))).size;
  const datapoints = runs.reduce((sum, run) => sum + run.datapoints, 0);
  const matcherMisses = runs.reduce((sum, run) => sum + run.matcherMisses, 0);
  // Spread over the days the feed has actually been running, so a new feed is not flattered.
  const spanDays = runs.length ? Math.min(t.windowDays, Math.max(1, (now.getTime() - runs[0]!.startedAt.getTime()) / 86_400_000)) : 0;
  const observedDays = Math.floor(spanDays);
  const datapointsPerDay = spanDays ? datapoints / spanDays : 0;
  const primaryState = providerStates.find((state) => state.id === DEFAULT_SPORTSBOOK_PROVIDER_ID);
  const daily = (primaryState?.datapointsPeriod ?? '').toLowerCase().includes('day');
  const projectedPerPeriod = runs.length ? Math.round(datapointsPerDay * (daily ? 1 : 30)) : null;
  const feedShare = settled.total ? settled.feed / settled.total : 0;
  const failedShare = runs.length ? failedRuns / runs.length : 1;
  const quotaShare = projectedPerPeriod !== null && (primaryState?.datapointsLimit ?? 0) > 0 ? projectedPerPeriod / primaryState!.datapointsLimit : null;

  const providers = SPORTSBOOK_PROVIDER_IDS.map((id) => {
    const state = providerStates.find((row) => row.id === id);
    const providerRuns = runs.filter((run) => run.provider === id);
    const units = providerRuns.reduce((sum, run) => sum + run.datapoints, 0);
    const firstRun = providerRuns[0]?.startedAt;
    const providerDays = firstRun ? Math.min(t.windowDays, Math.max(1, (now.getTime() - firstRun.getTime()) / 86_400_000)) : 0;
    const perDay = providerDays ? units / providerDays : 0;
    const planPeriod = state?.datapointsPeriod ?? '';
    const providerProjected = providerRuns.length ? Math.round(perDay * (planPeriod.toLowerCase().includes('day') ? 1 : 30)) : null;
    const planLimit = state?.datapointsLimit ?? 0;
    return {
      id, name: sportsbookProviderName(id), runs: providerRuns.length,
      failedRuns: providerRuns.filter((run) => run.failed).length,
      requests: providerRuns.reduce((sum, run) => sum + run.requests, 0), units,
      projectedUnitsPerPeriod: providerProjected, planLimit, planPeriod,
      projectedQuotaShare: providerProjected !== null && planLimit > 0 ? providerProjected / planLimit : null,
    };
  });

  const leagues = SPORTSBOOK_LEAGUES.map(({ key, name }) => {
    let servedRuns = 0; let failovers = 0; let offPrimaryRuns = 0; let leagueMatcherMisses = 0;
    const observations = new Map<string, { attempted: boolean; served: boolean }>();
    for (const run of runs) {
      const activity = leagueActivity(run.leagueActivity)[key];
      if (!activity) continue;
      const observationKey = run.startedAt.toISOString();
      const observation = observations.get(observationKey) ?? { attempted: false, served: false };
      observation.attempted ||= activity.attempted;
      observation.served ||= activity.served;
      observations.set(observationKey, observation);
      if (activity.served) {
        servedRuns += 1;
        if (!activity.primary) offPrimaryRuns += 1;
        if (activity.switched) failovers += 1;
      }
      leagueMatcherMisses += activity.matcherMisses;
    }
    const uncoveredRuns = [...observations.values()].filter((row) => row.attempted && !row.served).length;
    return {
      key, name, servedRuns, uncoveredRuns, failovers, offPrimaryRuns,
      offPrimaryShare: servedRuns ? offPrimaryRuns / servedRuns : 0, matcherMisses: leagueMatcherMisses,
    };
  });
  const adminResolved = count('ADMIN_RESOLUTION');
  const disputes = {
    open: openDisputes,
    resolved: adminResolved,
    settledWithScore: count('ADMIN_RESOLUTION', 'FINAL'),
    voided: count('ADMIN_RESOLUTION', 'VOID'),
  };

  const criteria: AdminSportsbookReviewCriterion[] = [
    { key: 'history', label: 'Beta observation window', value: `${observedDays} days`, target: `${t.minObservedDays} days`, pass: observedDays >= t.minObservedDays },
    { key: 'coverage', label: 'Days with a successful odds snapshot', value: `${daysWithSnapshots} days`, target: `at least ${t.minDaysWithSnapshots}`, pass: daysWithSnapshots >= t.minDaysWithSnapshots },
    { key: 'sample', label: 'Games graded', value: `${settled.total}`, target: `at least ${t.minGradedGames}`, pass: settled.total >= t.minGradedGames },
    { key: 'auto', label: 'Graded by the feed without an admin', value: settled.total ? percent(feedShare) : 'no games yet', target: `at least ${percent(t.minFeedGradedShare)}`, pass: settled.total > 0 && feedShare >= t.minFeedGradedShare },
    { key: 'stuck', label: 'Games still waiting 24 hours after the start', value: `${stuckOver24h}`, target: `${t.maxStuckOver24h}`, pass: stuckOver24h <= t.maxStuckOver24h },
    { key: 'failures', label: 'Feed runs that got no odds', value: runs.length ? `${failedRuns} of ${runs.length} (${percent(failedShare)})` : 'no runs yet', target: `at most ${percent(t.maxFailedRunShare)}`, pass: runs.length > 0 && failedShare <= t.maxFailedRunShare },
    { key: 'matching', label: 'Listings the canonical matcher missed', value: `${matcherMisses}`, target: '0', pass: matcherMisses === 0 },
    { key: 'disputes', label: 'Disputes still awaiting a decision', value: `${disputes.open}`, target: '0', pass: disputes.open === 0 },
    { key: 'quota', label: `Projected datapoints per ${daily ? 'day' : 'month'}`, value: quotaShare === null ? ((primaryState?.datapointsLimit ?? 0) ? 'no runs yet' : 'quota limit not reported') : `${projectedPerPeriod!.toLocaleString('en-US')} (${percent(quotaShare)} of quota)`, target: `at most ${percent(t.maxProjectedQuotaShare)} of quota`, pass: quotaShare !== null && quotaShare <= t.maxProjectedQuotaShare },
  ];
  const ready = criteria.every((criterion) => criterion.pass);
  const historyComplete = observedDays >= t.minObservedDays;
  const uncoveredRuns = leagues.reduce((sum, league) => sum + league.uncoveredRuns, 0);
  const sportsGameOdds = !historyComplete ? 'HOLD' : uncoveredRuns > 0 ? 'REVIEW' : 'NOT_NEEDED';
  const spreadsTotals = ready ? 'REVIEW' : 'HOLD';
  const paidPlan = historyComplete && providers.some((provider) =>
    provider.projectedQuotaShare !== null && provider.projectedQuotaShare > t.maxProjectedQuotaShare) ? 'REVIEW' : 'HOLD';
  const summary = !historyComplete
    ? `Keep the current moneyline chain through the full ${t.minObservedDays}-day beta window.`
    : uncoveredRuns > 0
      ? `Review SportsGameOdds: the current chain left ${uncoveredRuns} league poll${uncoveredRuns === 1 ? '' : 's'} uncovered.`
      : ready
        ? 'The current chain covered every observed moneyline poll; SportsGameOdds is not needed, and spreads/totals can move to a scoped review.'
        : 'Keep the current moneyline chain while the remaining reliability checks are corrected.';
  return {
    windowDays: t.windowDays, observedDays, runs: runs.length, failedRuns, daysWithSnapshots, datapoints,
    datapointsPerDay: Math.round(datapointsPerDay), projectedPerPeriod, period: primaryState?.datapointsPeriod ?? '',
    settled, hoursToSettle: { median: round1(quantile(hours, 0.5)), p90: round1(quantile(hours, 0.9)) },
    stuckOver24h, matcherMisses, disputes, providers, leagues,
    recommendation: { sportsGameOdds, spreadsTotals, paidPlan, summary }, criteria, ready,
  };
}

/** 1.8.0-C. Feed health, quota and unresolved results for staff, plus two audited repairs. */
export const AdminSportsbookService = {
  async report(prisma: PrismaClient, config: FeedConfig, now = new Date()): Promise<AdminSportsbookDto> {
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const [stateRows, leagueProviderRows, upcoming, openTotals, unresolved, settledEvents, settledTickets] = await Promise.all([
      prisma.sportsbookProviderState.findMany(),
      prisma.sportsbookLeagueProviderState.findMany(),
      prisma.sportsbookEvent.groupBy({
        by: ['sport', 'status'], where: { startsAt: { gt: now }, status: { in: ['PRE', 'PULLED'] } }, _count: { _all: true },
      }),
      prisma.sportsbookBet.aggregate({ where: { status: 'OPEN' }, _count: { _all: true }, _sum: { stakeCents: true, payoutCents: true } }),
      prisma.sportsbookEvent.findMany({
        where: { settledAt: null, startsAt: { lte: now }, bets: { some: { status: 'OPEN' } } },
        include: {
          bets: { where: { status: 'OPEN' }, select: { stakeCents: true, payoutCents: true } },
          sources: { orderBy: [{ resultCheckedAt: 'desc' }, { provider: 'asc' }] },
        },
        orderBy: { startsAt: 'asc' }, take: 50,
      }),
      prisma.sportsbookEvent.count({ where: { settledAt: { gte: dayAgo } } }),
      prisma.sportsbookBet.count({ where: { settledAt: { gte: dayAgo } } }),
    ]);
    const states = new Map(stateRows.map((state) => [state.id, state]));
    const leagueProviders = new Map(leagueProviderRows.map((state) => [state.league as SportsbookLeagueKey, state]));
    const primaryState = states.get(DEFAULT_SPORTSBOOK_PROVIDER_ID);
    const keys = feedKeys(config);
    const overallLastPolledAt = stateRows.filter((state) => Boolean(keys[state.id as SportsbookProviderId]))
      .map((state) => state.lastPolledAt).filter((date): date is Date => date !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const review = await marketReview(prisma, stateRows, now);
    const count = (sport: string, status: string) => upcoming.find((row) => row.sport === sport && row.status === status)?._count._all ?? 0;
    const remaining = primaryState?.datapointsRemaining ?? null;
    const providerDtos = SPORTSBOOK_PROVIDER_IDS.map((id) => {
      const state = states.get(id);
      const configured = Boolean(keys[id]);
      const providerRemaining = state?.datapointsRemaining ?? null;
      const servingLeagues = SPORTSBOOK_LEAGUES.filter(({ key }) =>
        (leagueProviders.get(key)?.activeOddsProvider ?? DEFAULT_SPORTSBOOK_PROVIDER_ID) === id).map(({ key }) => key);
      return {
        id,
        name: sportsbookProviderName(id),
        configured,
        servingLeagues,
        feed: {
          status: sportsbookFeedStatus({ configured, lastPolledAt: state?.lastPolledAt }, now),
          lastPolledAt: isoOrNull(state?.lastPolledAt),
          lastAttemptAt: isoOrNull(state?.lastAttemptAt),
          lastSuccessAt: isoOrNull(state?.lastSuccessAt),
          consecutiveFailures: state?.consecutiveFailures ?? 0,
          consecutiveSuccesses: state?.consecutiveSuccesses ?? 0,
          lastError: state?.lastError ?? '',
          lastErrorAt: isoOrNull(state?.lastErrorAt),
          circuitOpenUntil: isoOrNull(state?.circuitOpenUntil),
        },
        quota: {
          used: state?.datapointsUsed ?? 0,
          limit: state?.datapointsLimit ?? 0,
          remaining: providerRemaining,
          period: state?.datapointsPeriod ?? '',
          lastRunUnits: state?.lastDatapoints ?? 0,
          observedAt: isoOrNull(state?.quotaObservedAt),
          oddsPaused: providerRemaining !== null && providerRemaining <= SPORTSBOOK_PROVIDER_QUOTA_FLOORS[id].odds,
          resultsPaused: providerRemaining !== null && providerRemaining <= SPORTSBOOK_PROVIDER_QUOTA_FLOORS[id].results,
        },
      };
    });
    return {
      generatedAt: now.toISOString(),
      configured: config.configured,
      pollMinutes: config.pollMinutes,
      feed: {
        status: sportsbookFeedStatus({ configured: config.configured, lastPolledAt: overallLastPolledAt }, now),
        lastPolledAt: isoOrNull(overallLastPolledAt),
        lastAttemptAt: isoOrNull(primaryState?.lastAttemptAt),
        lastResultCheckAt: isoOrNull(primaryState?.lastResultCheckAt),
        consecutiveFailures: primaryState?.consecutiveFailures ?? 0,
        lastError: primaryState?.lastError ?? '',
        lastErrorAt: isoOrNull(primaryState?.lastErrorAt),
        pollInProgress: Boolean(primaryState?.pollLeaseUntil && primaryState.pollLeaseUntil > now),
      },
      quota: {
        used: primaryState?.datapointsUsed ?? 0,
        limit: primaryState?.datapointsLimit ?? 0,
        remaining,
        period: primaryState?.datapointsPeriod ?? '',
        lastRunDatapoints: primaryState?.lastDatapoints ?? 0,
        observedAt: isoOrNull(primaryState?.quotaObservedAt),
        oddsPaused: remaining !== null && remaining <= SPORTSBOOK_PROVIDER_QUOTA_FLOORS[DEFAULT_SPORTSBOOK_PROVIDER_ID].odds,
        resultsPaused: remaining !== null && remaining <= SPORTSBOOK_PROVIDER_QUOTA_FLOORS[DEFAULT_SPORTSBOOK_PROVIDER_ID].results,
      },
      providers: providerDtos,
      leagues: SPORTSBOOK_LEAGUES.map(({ key, name }) => {
        const leagueProvider = leagueProviders.get(key);
        const activeProvider = leagueProvider?.activeOddsProvider ?? DEFAULT_SPORTSBOOK_PROVIDER_ID;
        const activeState = states.get(activeProvider);
        const leagues = parseLeagueStatus(activeState?.leagueStatus);
        const alternateStatuses = SPORTSBOOK_ODDS_CHAINS[key]
          .filter((id) => id !== activeProvider && Boolean(keys[id]))
          .map((id) => parseLeagueStatus(states.get(id)?.leagueStatus)[key]);
        const nextRecovery = leagueProvider?.pinnedOddsProvider ? null
          : sportsbookNextRecoveryAt(leagues[key], alternateStatuses);
        return {
          key, name, activeProvider, activeProviderName: sportsbookProviderName(activeProvider),
          nextRecoveryAt: isoOrNull(nextRecovery),
          pinnedProvider: leagueProvider?.pinnedOddsProvider ?? null,
          chain: [...SPORTSBOOK_ODDS_CHAINS[key]],
          lastAttemptAt: leagues[key]?.lastAttemptAt ?? null,
          lastSuccessAt: leagues[key]?.lastSuccessAt ?? null,
          lastError: leagues[key]?.lastError ?? '',
          lastErrorAt: leagues[key]?.lastErrorAt ?? null,
          eventsSeen: leagues[key]?.eventsSeen ?? 0,
          upcoming: count(key, 'PRE'),
          pulled: count(key, 'PULLED'),
        };
      }),
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
        resultReviewReason: event.resultReviewReason,
        resultReviewAt: isoOrNull(event.resultReviewAt),
        sources: event.sources.filter((source) => source.resultCheckedAt !== null).map((source) => ({
          provider: source.provider,
          providerName: sportsbookProviderName(source.provider),
          status: source.status as 'PRE' | 'LIVE' | 'FINAL' | 'CANCELLED',
          homeScore: source.homeScore,
          awayScore: source.awayScore,
          checkedAt: isoOrNull(source.resultCheckedAt),
          error: source.resultError,
        })),
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
    const keys = feedKeys(config);
    const event = await prisma.sportsbookEvent.findUnique({ where: { id: eventId }, include: { sources: { orderBy: { lastSeenAt: 'desc' } } } });
    if (!event) throw AppError.notFound('SPORTSBOOK_EVENT_NOT_FOUND', 'That sportsbook game does not exist.');
    if (event.settledAt) throw AppError.conflict('SPORTSBOOK_ALREADY_SETTLED', 'That game is already settled.');
    if (event.startsAt > now) throw AppError.conflict('SPORTSBOOK_NOT_STARTED', 'That game has not started, so there is no result to check.');
    const providerIds = SPORTSBOOK_PROVIDER_IDS.filter((id) => Boolean(keys[id]));
    if (!providerIds.length) throw AppError.conflict('SPORTSBOOK_FEED_OFF', 'No results provider is available on this server.');
    if (!event.sources.some((source) => source.provider === event.oddsProvider) && keys[event.oddsProvider as SportsbookProviderId]) {
      event.sources.push(await ensureSportsbookEventSource(prisma, event.oddsProvider, event));
    }
    for (const id of providerIds) await prisma.sportsbookProviderState.upsert({ where: { id }, create: { id }, update: {} });
    const states = await prisma.sportsbookProviderState.findMany({ where: { id: { in: providerIds } } });
    const stateById = new Map(states.map((state) => [state.id, state]));
    const providers = new Map(providerIds.map((id) => [id, createSportsbookProvider(id, keys[id]!, stateById.get(id)!, now, deps)]));
    const checked = await checkSportsbookResultChain(prisma, providers, event, now, 'ADMIN_RECHECK');
    for (const [id, provider] of providers) await prisma.sportsbookProviderState.update({
      where: { id }, data: { ...provider.session.usageData(now), ...(provider.session.requests ? { lastResultCheckAt: now } : {}) },
    });
    await AdminAuditService.record(prisma, actor, {
      action: 'sportsbook.recheck', targetType: 'sportsbook-event', targetId: event.id,
      before: { status: event.status, resultCheckCount: event.resultCheckCount, resultError: event.resultError },
      after: { providers: providerIds, ...checked },
    });
    return { message: checked.detail, report: await this.report(prisma, config, now) };
  },

  /** Resolve a held disagreement using one recorded final score, or refund it. */
  async resolve(
    prisma: PrismaClient,
    config: FeedConfig,
    actor: AuditActor,
    eventId: string,
    input: { action: 'SETTLE'; provider: string; reason: string } | { action: 'VOID'; reason: string },
    now = new Date(),
  ): Promise<AdminSportsbookActionDto> {
    const message = await prisma.$transaction(async (tx) => {
      const before = await tx.sportsbookEvent.findUnique({ where: { id: eventId }, include: { sources: true } });
      if (!before) throw AppError.notFound('SPORTSBOOK_EVENT_NOT_FOUND', 'That sportsbook game does not exist.');
      if (before.settledAt) throw AppError.conflict('SPORTSBOOK_ALREADY_SETTLED', 'That game is already settled.');
      let status: 'FINAL' | 'VOID' = 'VOID';
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      let provider = '';
      if (input.action === 'SETTLE') {
        const source = before.sources.find((row) => row.provider === input.provider && row.status === 'FINAL'
          && row.homeScore !== null && row.awayScore !== null && row.resultCheckedAt !== null);
        if (!source) throw AppError.conflict('SPORTSBOOK_RESULT_UNAVAILABLE', 'That provider has not supplied a complete final score for this game.');
        status = 'FINAL'; homeScore = source.homeScore; awayScore = source.awayScore; provider = source.provider;
      }
      const settled = await settleSportsbookEventTx(tx, eventId, status, homeScore, awayScore, now, 'ADMIN_RESOLUTION', provider);
      if (!settled) throw AppError.conflict('SPORTSBOOK_ALREADY_SETTLED', 'That game is already settled.');
      await AdminAuditService.record(tx, actor, {
        action: 'sportsbook.resolve', targetType: 'sportsbook-event', targetId: eventId, reason: input.reason,
        before: { status: before.status, review: before.resultReviewReason, sources: before.sources.map((source) => ({ provider: source.provider, status: source.status, homeScore: source.homeScore, awayScore: source.awayScore })) },
        after: { action: input.action, status, provider, homeScore, awayScore, tickets: settled.tickets, creditedCents: settled.creditedCents.toString() },
      });
      return input.action === 'VOID'
        ? `Voided ${before.awayTeam} at ${before.homeTeam}; ${settled.tickets} ticket(s) refunded.`
        : `Settled ${before.awayTeam} at ${before.homeTeam} from ${sportsbookProviderName(provider)} at ${awayScore}-${homeScore}.`;
    });
    return { message, report: await this.report(prisma, config, now) };
  },

  /**
   * Run the normal odds refresh on demand. The shared file cache still enforces its 30-minute
   * cooldown; the provider lease and quota floor also apply, and the operation is audited.
   */
  async pullNow(
    prisma: PrismaClient,
    config: FeedConfig,
    actor: AuditActor,
    now = new Date(),
    deps: FeedDeps = {},
  ): Promise<AdminSportsbookActionDto> {
    const keys = feedKeys(config);
    if (!Object.values(keys).some(Boolean)) throw AppError.conflict('SPORTSBOOK_FEED_OFF', 'The odds feed has no provider key on this server.');
    const result = await refreshSportsbookCache(prisma, keys, now, deps);
    let message: string;
    if (result.skipped === 'BUSY') {
      message = 'A sportsbook feed pull is already running; no second pull was started.';
    } else if (result.skipped === 'CACHE_FRESH') {
      message = `The sportsbook odds cache was updated at ${result.cacheUpdatedAt}; no odds snapshot requests were made. Next refresh is eligible at ${result.nextOddsPollAt}.`;
    } else if (!result.oddsPolled) {
      message = result.errors.join(' · ') || 'The manual pull was skipped because provider quota is near its limit.';
    } else if (!result.snapshots) {
      message = 'The manual pull completed without a successful odds snapshot.';
    } else {
      message = `Manual odds pull finished: ${result.snapshots} snapshots fetched, ${result.failedSnapshots} failed, ${result.pulled} missing games closed.`;
      if (result.errors.length) message += ` ${result.errors.join(' · ')}`;
    }
    await AdminAuditService.record(prisma, actor, {
      action: 'sportsbook.manual-pull', targetType: 'sportsbook-provider', targetId: SPORTSBOOK_PROVIDER_ID,
      after: result,
    });
    return { message, report: await this.report(prisma, config, now) };
  },

  /** Rebuilds the fictional today-plus-two-day slate immediately, without touching settled games. */
  async refreshSlate(
    prisma: PrismaClient,
    config: FeedConfig,
    actor: AuditActor,
    now = new Date(),
  ): Promise<AdminSportsbookActionDto> {
    const result = await refreshSportsbookCache(prisma, { internal: 'internal' }, now, { minIntervalMs: 0, normalIntervalMs: 0 });
    const message = result.skipped === 'BUSY'
      ? 'A sportsbook slate refresh is already running.'
      : `Sportsbook slate refreshed: ${result.snapshots} snapshot(s), ${result.failedSnapshots} failed.`;
    await AdminAuditService.record(prisma, actor, {
      action: 'sportsbook.refresh-slate', targetType: 'sportsbook-provider', targetId: SPORTSBOOK_PROVIDER_ID,
      after: result,
    });
    return { message, report: await this.report(prisma, config, now) };
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
    providerId: SportsbookProviderId = SPORTSBOOK_PROVIDER_ID,
  ): Promise<AdminSportsbookProviderCheckDto> {
    const apiKey = feedKeys(config)[providerId];
    if (!apiKey) throw AppError.conflict('SPORTSBOOK_FEED_OFF', `${sportsbookProviderName(providerId)} has no key on this server.`);
    await prisma.sportsbookProviderState.upsert({ where: { id: providerId }, create: { id: providerId }, update: {} });
    const state = await prisma.sportsbookProviderState.findUniqueOrThrow({ where: { id: providerId } });
    const provider = createSportsbookProvider(providerId, apiKey, state, now, deps);
    const { session } = provider;
    const date = dateKey(now);
    let summary: AdminSportsbookProviderCheckDto['summary'] = null;
    let error = '';
    try {
      if (!provider.diagnose) throw new ProviderError('PAYLOAD', 'This provider does not support payload diagnostics.');
      summary = await provider.diagnose(leagueKey, date);
    } catch (caught) {
      if (!(caught instanceof ProviderError)) throw caught;
      error = caught.message;
    }
    await prisma.sportsbookProviderState.update({ where: { id: providerId }, data: session.usageData(now) });
    await AdminAuditService.record(prisma, actor, {
      action: 'sportsbook.provider-check', targetType: 'sportsbook-league', targetId: leagueKey,
      after: { provider: providerId, date, error, events: summary?.events ?? 0, parsed: summary?.parsed ?? 0, datapoints: session.datapoints },
    });
    return {
      provider: providerId, providerName: provider.name, league: leagueKey, date, checkedAt: now.toISOString(), ok: !error, error, summary,
      quota: { datapoints: session.datapoints, used: session.used, limit: session.limit, remaining: session.remaining, period: session.period },
    };
  },

  async pinLeague(
    prisma: PrismaClient,
    config: FeedConfig,
    actor: AuditActor,
    league: SportsbookLeagueKey,
    provider: SportsbookProviderId,
    reason = '',
    now = new Date(),
  ): Promise<AdminSportsbookActionDto> {
    if (!feedKeys(config)[provider]) throw AppError.conflict('SPORTSBOOK_PROVIDER_OFF', `${sportsbookProviderName(provider)} is not configured.`);
    if (!SPORTSBOOK_ODDS_CHAINS[league].includes(provider)) throw AppError.conflict('SPORTSBOOK_PROVIDER_UNSUPPORTED', `${sportsbookProviderName(provider)} does not price ${league}.`);
    const before = await prisma.sportsbookLeagueProviderState.upsert({ where: { league }, create: { league }, update: {} });
    await prisma.sportsbookLeagueProviderState.update({
      where: { league }, data: { pinnedOddsProvider: provider, activeOddsProvider: provider, activeSince: now },
    });
    await AdminAuditService.record(prisma, actor, {
      action: 'sportsbook.provider-pin', targetType: 'sportsbook-league', targetId: league, reason,
      before: { activeProvider: before.activeOddsProvider, pinnedProvider: before.pinnedOddsProvider },
      after: { activeProvider: provider, pinnedProvider: provider },
    });
    return { message: `${league} is pinned to ${sportsbookProviderName(provider)}.`, report: await this.report(prisma, config, now) };
  },

  async clearLeaguePin(
    prisma: PrismaClient,
    config: FeedConfig,
    actor: AuditActor,
    league: SportsbookLeagueKey,
    now = new Date(),
  ): Promise<AdminSportsbookActionDto> {
    const before = await prisma.sportsbookLeagueProviderState.upsert({ where: { league }, create: { league }, update: {} });
    await prisma.sportsbookLeagueProviderState.update({ where: { league }, data: { pinnedOddsProvider: null } });
    await AdminAuditService.record(prisma, actor, {
      action: 'sportsbook.provider-clear-pin', targetType: 'sportsbook-league', targetId: league,
      before: { activeProvider: before.activeOddsProvider, pinnedProvider: before.pinnedOddsProvider },
      after: { activeProvider: before.activeOddsProvider, pinnedProvider: null },
    });
    return { message: `${league} can follow the automatic provider chain again.`, report: await this.report(prisma, config, now) };
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
