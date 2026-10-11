import type { PrismaClient } from '@prisma/client';
import {
  SPORTSBOOK_QUOTA_ODDS_FLOOR,
  SPORTSBOOK_QUOTA_RESULTS_FLOOR,
  type AdminSportsbookActionDto,
  type AdminSportsbookDto,
  type SportsbookEventStatus,
  type SportsbookLeagueKey,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import {
  ProviderSession,
  SPORTSBOOK_PROVIDER_ID,
  checkSportsbookResult,
  parseLeagueStatus,
  type FeedDeps,
} from './sportsbook-feed.service.js';
import { SPORTSBOOK_LEAGUES, settleSportsbookEventTx, sportsbookFeedStatus } from './sportsbook.service.js';

type FeedConfig = { configured: boolean; pollMinutes: number; apiKey?: string };

const isoOrNull = (date: Date | null | undefined) => date?.toISOString() ?? null;

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
    const checked = await checkSportsbookResult(prisma, session, event, now);
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
      const settled = await settleSportsbookEventTx(tx, eventId, 'VOID', null, null, now);
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
