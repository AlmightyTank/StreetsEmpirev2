import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { classicOgV12A } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ReputationService } from '../reputation.service.js';
import { SportsbookService, settleSportsbookEvent } from '../sportsbook.service.js';
import { refreshSportsbookCache } from '../sportsbook-feed.service.js';
import { AdminSportsbookService } from '../admin-sportsbook.service.js';

// Slices B and C share one provider-state row, so they run in one file, one test at a time.
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.8.0-B/C sportsbook board, tickets and feed with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  let accountName = '';
  /** Provider event ids the feed tests create through a refresh, cleaned up by prefix. */
  const providerPrefix = 'c-' + randomUUID().slice(0, 8) + '-';
  const roundIds: string[] = [];
  const eventIds: string[] = [];
  let savedProviderState: Awaited<ReturnType<FastifyInstance['prisma']['sportsbookProviderState']['findUnique']>> = null;
  const now = new Date('2030-03-01T18:00:00.000Z');
  const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

  async function fixture() {
    const round = await app.prisma.round.create({
      data: {
        name: 'Sportsbook B fixture', slug: 'sportsbook-b-' + randomUUID(),
        rulesetId: classicOgV12A.meta.id, rulesetVersion: classicOgV12A.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    return app.prisma.roundPlayer.create({
      data: {
        ...classicOgV12A.round.startingPlayer,
        ...startingStock(classicOgV12A),
        cashCents: 500_000n,
        roundId: round.id, accountId, cityId: city.id,
        displayName: 'book_' + randomUUID().slice(0, 6),
        publicPimpId: 9800 + roundIds.length,
        reputation: { create: ReputationService.seedFor(classicOgV12A) },
      },
    });
  }

  async function event(data: Partial<{ providerEventId: string; sport: string; startsAt: Date; oddsUpdatedAt: Date | null; homeOdds: number | null; awayOdds: number | null; status: string; homeScore: number; awayScore: number; lastSeenAt: Date; settledAt: Date }> = {}) {
    const created = await app.prisma.sportsbookEvent.create({
      data: {
        providerEventId: 'test-' + randomUUID(), sport: 'NBA', homeTeam: 'Home Club', awayTeam: 'Away Club',
        startsAt: minutes(120), oddsUpdatedAt: minutes(-5), homeOdds: -150, awayOdds: 130, ...data,
      },
    });
    eventIds.push(created.id);
    return created;
  }

  async function feedPolledAt(lastPolledAt: Date | null) {
    await app.prisma.sportsbookProviderState.upsert({
      where: { id: 'therundown' }, create: { id: 'therundown', lastPolledAt }, update: { lastPolledAt },
    });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    savedProviderState = await app.prisma.sportsbookProviderState.findUnique({ where: { id: 'therundown' } });
    accountName = 'book_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: accountName, email: accountName + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    await app.prisma.sportsbookEvent.deleteMany({ where: { OR: [{ id: { in: eventIds } }, { providerEventId: { startsWith: providerPrefix } }] } });
    if (savedProviderState) {
      const { id, updatedAt: _updatedAt, leagueStatus, ...rest } = savedProviderState;
      await app.prisma.sportsbookProviderState.update({ where: { id }, data: { ...rest, leagueStatus: leagueStatus as Prisma.InputJsonValue } });
    } else {
      await app.prisma.sportsbookProviderState.deleteMany({ where: { id: 'therundown' } });
    }
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('explains every closed line with the same checks a wager enforces', async () => {
    await feedPolledAt(minutes(-10));
    const open = await event({ sport: 'NFL' });
    const staleLine = await event({ sport: 'NFL', oddsUpdatedAt: minutes(-60) });
    const noLine = await event({ sport: 'MLB', homeOdds: null, awayOdds: null });

    const board = await SportsbookService.board(app.prisma, { configured: true, pollMinutes: 30 }, now);
    const state = (id: string) => board.events.find((row) => row.id === id)?.lineState;
    expect(board.feed).toMatchObject({ status: 'FRESH', pollMinutes: 30, oddsMaxAgeMinutes: 45 });
    expect(board.serverTime).toBe(now.toISOString());
    expect(state(open.id)).toBe('OPEN');
    expect(state(staleLine.id)).toBe('STALE_ODDS');
    expect(state(noLine.id)).toBe('NO_LINE');
    const nfl = board.leagues.find((league) => league.key === 'NFL')!;
    expect(nfl.eventCount).toBeGreaterThanOrEqual(2);
    expect(nfl.eventCount - nfl.openCount).toBeGreaterThanOrEqual(1);

    const player = await fixture();
    for (const closed of [staleLine, noLine]) {
      await expect(SportsbookService.placeBet(app.prisma, player.id, {
        eventId: closed.id, selection: 'HOME', stakeCents: 1_000, actionId: randomUUID(),
      }, now)).rejects.toMatchObject({ code: expect.stringMatching(/^SPORTSBOOK_/) });
    }

    await feedPolledAt(minutes(-90));
    const stale = await SportsbookService.board(app.prisma, { configured: true, pollMinutes: 30 }, now);
    expect(stale.feed.status).toBe('STALE');
    expect(stale.enabled).toBe(false);
    expect(stale.events.find((row) => row.id === open.id)?.lineState).toBe('FEED_UNAVAILABLE');
    expect((await SportsbookService.board(app.prisma, { configured: false, pollMinutes: 30 }, now)).feed.status).toBe('OFF');
  });

  it('refuses a moved price instead of pinning odds the player never saw', async () => {
    await feedPolledAt(minutes(-10));
    const player = await fixture();
    const game = await event({ awayOdds: 130 });

    await expect(SportsbookService.placeBet(app.prisma, player.id, {
      eventId: game.id, selection: 'AWAY', stakeCents: 10_000, actionId: randomUUID(), expectedOdds: 145,
    }, now)).rejects.toMatchObject({ code: 'SPORTSBOOK_ODDS_CHANGED' });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents).toBe(500_000n);
    expect(await app.prisma.sportsbookBet.count({ where: { roundPlayerId: player.id } })).toBe(0);

    const placed = await SportsbookService.placeBet(app.prisma, player.id, {
      eventId: game.id, selection: 'AWAY', stakeCents: 10_000, actionId: randomUUID(), expectedOdds: 130,
    }, now);
    expect(placed.bet).toMatchObject({ oddsAmerican: 130, stakeCents: 10_000, payoutCents: 23_000 });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents).toBe(490_000n);
  });

  it('splits open tickets from settled history with a lifetime record and cash returned', async () => {
    const player = await fixture();
    const upcoming = await event({ startsAt: minutes(60) });
    const later = await event({ startsAt: minutes(240) });
    const final = await event({ startsAt: minutes(-300), status: 'FINAL', homeScore: 3, awayScore: 5 });
    const tied = await event({ startsAt: minutes(-300), status: 'FINAL', homeScore: 2, awayScore: 2 });
    const voided = await event({ startsAt: minutes(-300), status: 'VOID' });
    const ticket = (eventId: string, data: { selection: string; oddsAmerican: number; stakeCents: bigint; payoutCents: bigint; status: string; settledAt?: Date }) =>
      app.prisma.sportsbookBet.create({ data: { roundPlayerId: player.id, eventId, actionId: randomUUID(), ...data } });

    await ticket(later.id, { selection: 'HOME', oddsAmerican: -150, stakeCents: 3_000n, payoutCents: 5_000n, status: 'OPEN' });
    await ticket(upcoming.id, { selection: 'AWAY', oddsAmerican: 130, stakeCents: 1_000n, payoutCents: 2_300n, status: 'OPEN' });
    await ticket(final.id, { selection: 'AWAY', oddsAmerican: 150, stakeCents: 2_000n, payoutCents: 5_000n, status: 'WON', settledAt: minutes(-60) });
    await ticket(final.id, { selection: 'HOME', oddsAmerican: -120, stakeCents: 1_200n, payoutCents: 2_200n, status: 'LOST', settledAt: minutes(-59) });
    await ticket(tied.id, { selection: 'HOME', oddsAmerican: -110, stakeCents: 1_100n, payoutCents: 2_100n, status: 'PUSH', settledAt: minutes(-58) });
    await ticket(voided.id, { selection: 'AWAY', oddsAmerican: 110, stakeCents: 500n, payoutCents: 1_050n, status: 'VOID', settledAt: minutes(-57) });

    const tickets = await SportsbookService.tickets(app.prisma, player.id);
    // Open tickets come in kickoff order so the next game to start is first.
    expect(tickets.open.map((bet) => bet.stakeCents)).toEqual([1_000, 3_000]);
    expect(tickets.open[0]).toMatchObject({ pickTeam: 'Away Club', status: 'OPEN', returnCents: 0, settledAt: null });
    expect(tickets.settled.map((bet) => bet.status)).toEqual(['VOID', 'PUSH', 'LOST', 'WON']);
    expect(tickets.settled.find((bet) => bet.status === 'WON')).toMatchObject({
      pickTeam: 'Away Club', eventStatus: 'FINAL', homeScore: 3, awayScore: 5, returnCents: 5_000,
    });
    expect(tickets.settled.find((bet) => bet.status === 'PUSH')?.returnCents).toBe(1_100);
    expect(tickets.settled.find((bet) => bet.status === 'VOID')?.returnCents).toBe(500);
    expect(tickets.settled.find((bet) => bet.status === 'LOST')?.returnCents).toBe(0);
    expect(tickets.summary).toEqual({
      openCount: 2, openStakeCents: 4_000, openPayoutCents: 7_300,
      won: 1, lost: 1, push: 1, void: 1,
      // +3,000 profit on the win, -1,200 lost stake; push and void are even.
      netCents: 1_800,
    });
  });

  // ---- 1.8.0-C: feed reliability and operations -------------------------------------------

  const feedNow = new Date('2031-05-01T15:00:00.000Z');
  const at = (count: number) => new Date(feedNow.getTime() + count * 60_000);
  const LEAGUE_BY_SPORT_ID: Record<string, string> = { 2: 'NFL', 4: 'NBA', 3: 'MLB', 6: 'NHL' };
  const quotaHeaders = { 'x-datapoints': '3', 'x-datapoints-used': '1000', 'x-datapoints-limit': '20000', 'x-datapoints-remaining': '19000', 'x-datapoints-period': 'month' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...quotaHeaders } });
  const noSleep = async () => {};

  function listing(providerEventId: string, startsAt: Date, status = 'STATUS_SCHEDULED') {
    return {
      event_id: providerEventId, event_date: startsAt.toISOString(), status,
      teams: [{ name: 'Road Team', is_away: true }, { name: 'House Team', is_away: false }],
      markets: [{ market_id: 1, participants: [{ name: 'Road Team', price: 140 }, { name: 'House Team', price: -160 }] }],
    };
  }

  /** A fake TheRundown: odds snapshots per league for the first polled date, results by event id. */
  function provider(handlers: {
    odds?: (league: string, date: string) => Response;
    result?: (providerEventId: string) => Response;
  }) {
    const calls: string[] = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      const odds = url.pathname.match(/\/sports\/(\d+)\/events\/([\d-]+)$/);
      if (odds) return handlers.odds?.(LEAGUE_BY_SPORT_ID[odds[1]!]!, odds[2]!) ?? reply(200, { events: [] });
      const result = url.pathname.match(/\/events\/([^/]+)$/);
      if (result) return handlers.result?.(decodeURIComponent(result[1]!)) ?? reply(200, { event: { status: 'STATUS_SCHEDULED' } });
      return reply(404, {});
    }) as typeof fetch;
    return { fetch: fetchImpl, sleep: noSleep, calls };
  }

  async function resetFeedState(data: Prisma.SportsbookProviderStateUncheckedUpdateInput = {}) {
    await app.prisma.sportsbookProviderState.upsert({
      where: { id: 'therundown' },
      create: { id: 'therundown' },
      update: {
        pollLeaseUntil: null, lastAttemptAt: null, lastPolledAt: null, consecutiveFailures: 0, leagueStatus: {},
        datapointsRemaining: null, quotaObservedAt: null, lastError: '', ...data,
      },
    });
  }

  async function ticketOn(playerId: string, eventId: string, selection = 'AWAY') {
    return app.prisma.sportsbookBet.create({ data: {
      roundPlayerId: playerId, eventId, actionId: randomUUID(), selection, oddsAmerican: 130, stakeCents: 10_000n, payoutCents: 23_000n,
    } });
  }

  it('keeps polling the other leagues when one fails, and closes a line the provider dropped', async () => {
    await resetFeedState();
    const today = feedNow.toISOString().slice(0, 10);
    const gone = await event({ providerEventId: providerPrefix + 'gone', sport: 'NBA', startsAt: at(180), oddsUpdatedAt: at(-30), lastSeenAt: at(-30) });
    const settled = await event({ providerEventId: providerPrefix + 'settled', sport: 'NFL', startsAt: at(240), status: 'VOID', settledAt: at(-60) });
    const feed = provider({
      odds: (league, date) => {
        if (league === 'MLB') return reply(500, {});
        if (date !== today) return reply(200, { events: [] });
        if (league === 'NFL') return reply(200, { events: [listing(providerPrefix + 'fresh', at(300)), listing(providerPrefix + 'settled', at(240))] });
        return reply(200, { events: [] });
      },
    });

    const result = await refreshSportsbookCache(app.prisma, 'test-key', feedNow, feed);
    expect(result).toMatchObject({ skipped: null, oddsPolled: true, snapshots: 6, failedSnapshots: 2 });
    expect(result.pulled).toBeGreaterThanOrEqual(1);
    expect(result.errors.join(' ')).toContain('MLB');
    // Two dates × three attempts for MLB, one request per date for the other three leagues.
    expect(feed.calls.filter((path) => path.startsWith('/api/v2/sports/3/'))).toHaveLength(6);

    const state = await app.prisma.sportsbookProviderState.findUniqueOrThrow({ where: { id: 'therundown' } });
    expect(state).toMatchObject({ lastPolledAt: feedNow, lastAttemptAt: feedNow, pollLeaseUntil: null, consecutiveFailures: 0, datapointsRemaining: 19_000 });
    const leagues = state.leagueStatus as Record<string, { lastSuccessAt: string | null; lastError: string }>;
    expect(leagues.NFL).toMatchObject({ lastSuccessAt: feedNow.toISOString(), lastError: '' });
    expect(leagues.MLB!.lastError).toContain('500');

    const fresh = await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { providerEventId: providerPrefix + 'fresh' } });
    expect(fresh).toMatchObject({ status: 'PRE', homeOdds: -160, awayOdds: 140, oddsUpdatedAt: feedNow });
    expect((await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: settled.id } })).status).toBe('VOID');
    expect((await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: gone.id } })).status).toBe('PULLED');

    const board = await SportsbookService.board(app.prisma, { configured: true, pollMinutes: 30 }, feedNow);
    expect(board.events.find((row) => row.id === gone.id)?.lineState).toBe('PULLED');
    expect(board.events.find((row) => row.id === fresh.id)?.lineState).toBe('OPEN');
    const player = await fixture();
    await expect(SportsbookService.placeBet(app.prisma, player.id, {
      eventId: gone.id, selection: 'HOME', stakeCents: 1_000, actionId: randomUUID(),
    }, feedNow)).rejects.toMatchObject({ code: 'SPORTSBOOK_LINE_PULLED' });

    // The game comes back on the next snapshot and reopens.
    const back = provider({ odds: (league, date) => reply(200, { events: league === 'NBA' && date === today ? [listing(providerPrefix + 'gone', at(180))] : [] }) });
    await refreshSportsbookCache(app.prisma, 'test-key', at(1), back);
    expect((await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: gone.id } })).status).toBe('PRE');
  });

  it('spends nothing while another poller holds the feed, and records a run that got no odds', async () => {
    const quiet = provider({});
    await resetFeedState({ pollLeaseUntil: at(5) });
    expect((await refreshSportsbookCache(app.prisma, 'test-key', feedNow, quiet)).skipped).toBe('BUSY');
    await resetFeedState({ lastAttemptAt: at(-1) });
    expect((await refreshSportsbookCache(app.prisma, 'test-key', feedNow, { ...quiet, minIntervalMs: 10 * 60_000 })).skipped).toBe('BUSY');
    expect(quiet.calls).toHaveLength(0);

    await resetFeedState({ lastPolledAt: at(-30), consecutiveFailures: 2 });
    const down = provider({ odds: () => reply(503, {}) });
    await expect(refreshSportsbookCache(app.prisma, 'test-key', feedNow, down)).rejects.toThrow(/no odds snapshot/);
    const afterOutage = await app.prisma.sportsbookProviderState.findUniqueOrThrow({ where: { id: 'therundown' } });
    expect(afterOutage).toMatchObject({ lastPolledAt: at(-30), consecutiveFailures: 3, pollLeaseUntil: null, lastErrorAt: feedNow });
    expect(afterOutage.lastError).toContain('503');

    await resetFeedState();
    const badKey = provider({ odds: () => reply(401, {}) });
    await expect(refreshSportsbookCache(app.prisma, 'test-key', feedNow, badKey)).rejects.toThrow(/rejected the API key/);
    expect(badKey.calls).toHaveLength(1);
  });

  it('paces result checks and settles each game exactly once, even when settlements race', async () => {
    await resetFeedState();
    const player = await fixture();
    const game = await event({ providerEventId: providerPrefix + 'result', sport: 'NBA', startsAt: at(-150) });
    await ticketOn(player.id, game.id, 'AWAY');
    let result = { status: 'STATUS_IN_PROGRESS', score: { score_away: 50, score_home: 48 } };
    const feed = provider({ result: (id) => (id === providerPrefix + 'result' ? reply(200, { event: result }) : reply(200, { event: { status: 'STATUS_SCHEDULED' } })) });
    const resultCalls = () => feed.calls.filter((path) => path.endsWith('/events/' + providerPrefix + 'result')).length;

    await refreshSportsbookCache(app.prisma, 'test-key', feedNow, feed);
    expect(resultCalls()).toBe(1);
    expect(await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({
      status: 'LIVE', resultCheckCount: 1, resultCheckedAt: feedNow, nextResultCheckAt: at(30), settledAt: null,
    });

    await refreshSportsbookCache(app.prisma, 'test-key', at(10), feed);
    expect(resultCalls()).toBe(1);

    result = { status: 'STATUS_FINAL', score: { score_away: 101, score_home: 99 } };
    const settledRun = await refreshSportsbookCache(app.prisma, 'test-key', at(31), feed);
    expect(resultCalls()).toBe(2);
    expect(settledRun.settled).toBe(1);
    expect(await app.prisma.sportsbookBet.findFirstOrThrow({ where: { eventId: game.id } })).toMatchObject({ status: 'WON' });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents).toBe(523_000n);

    // A settled game is never checked or paid again.
    await refreshSportsbookCache(app.prisma, 'test-key', at(400), feed);
    expect(resultCalls()).toBe(2);

    const raced = await event({ providerEventId: providerPrefix + 'raced', sport: 'NHL', startsAt: at(-300) });
    await ticketOn(player.id, raced.id, 'HOME');
    const outcomes = await Promise.all([
      settleSportsbookEvent(app.prisma, raced.id, 'FINAL', 3, 2, feedNow),
      settleSportsbookEvent(app.prisma, raced.id, 'FINAL', 3, 2, feedNow),
      settleSportsbookEvent(app.prisma, raced.id, 'FINAL', 3, 2, feedNow),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents).toBe(546_000n);
  });

  it('shows admins the stuck games, rechecks one on demand, and voids with an audit trail', async () => {
    await resetFeedState({ lastPolledAt: at(-5), datapointsRemaining: 300, quotaObservedAt: at(-5), datapointsPeriod: 'month' });
    const actor = { id: accountId, username: accountName };
    const config = { configured: true, pollMinutes: 30, apiKey: 'test-key' };
    const player = await fixture();
    const stuck = await event({ providerEventId: providerPrefix + 'stuck', sport: 'MLB', startsAt: at(-600), status: 'LIVE' });
    await app.prisma.sportsbookEvent.update({ where: { id: stuck.id }, data: { resultCheckCount: 7, resultError: 'Provider marked the game final without both scores.' } });
    await ticketOn(player.id, stuck.id);
    const pulled = await event({ providerEventId: providerPrefix + 'pulled', sport: 'NFL', startsAt: at(600), status: 'PULLED' });
    await ticketOn(player.id, pulled.id);

    const report = await AdminSportsbookService.report(app.prisma, config, feedNow);
    expect(report.feed).toMatchObject({ status: 'FRESH', pollInProgress: false });
    expect(report.quota).toMatchObject({ remaining: 300, oddsPaused: true, resultsPaused: false });
    expect(report.unresolved.find((row) => row.id === stuck.id)).toMatchObject({
      openTickets: 1, openStakeCents: 10_000, resultCheckCount: 7, resultError: expect.stringContaining('without both scores'),
    });
    expect(report.unresolved.some((row) => row.id === pulled.id)).toBe(false);
    expect(report.exposure.openTickets).toBeGreaterThanOrEqual(2);

    await expect(AdminSportsbookService.recheck(app.prisma, config, actor, pulled.id, feedNow))
      .rejects.toMatchObject({ code: 'SPORTSBOOK_NOT_STARTED' });
    await expect(AdminSportsbookService.recheck(app.prisma, { ...config, apiKey: '' }, actor, stuck.id, feedNow))
      .rejects.toMatchObject({ code: 'SPORTSBOOK_FEED_OFF' });

    const feed = provider({ result: () => reply(200, { event: { status: 'STATUS_POSTPONED' } }) });
    const rechecked = await AdminSportsbookService.recheck(app.prisma, config, actor, stuck.id, feedNow, feed);
    expect(rechecked.message).toBe('Voided; 1 ticket(s) refunded.');
    expect(rechecked.report.unresolved.some((row) => row.id === stuck.id)).toBe(false);

    const voided = await AdminSportsbookService.void(app.prisma, config, actor, pulled.id, 'Provider dropped the game for good.', feedNow);
    expect(voided.message).toContain('1 ticket(s) refunded');
    await expect(AdminSportsbookService.void(app.prisma, config, actor, pulled.id, 'Provider dropped the game for good.', feedNow))
      .rejects.toMatchObject({ code: 'SPORTSBOOK_ALREADY_SETTLED' });
    // Both stakes came back; nothing was paid twice.
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents).toBe(520_000n);

    const audits = await app.prisma.adminAuditLog.findMany({ where: { targetId: { in: [stuck.id, pulled.id] } }, orderBy: { createdAt: 'asc' } });
    expect(audits.map((row) => row.action)).toEqual(['sportsbook.recheck', 'sportsbook.void']);
    expect(audits[1]).toMatchObject({ reason: 'Provider dropped the game for good.', after: expect.objectContaining({ tickets: 1, refundedCents: '10000' }) });
    await app.prisma.adminAuditLog.deleteMany({ where: { targetId: { in: [stuck.id, pulled.id] } } });
  });
});
