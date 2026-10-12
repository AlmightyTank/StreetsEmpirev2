import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { classicOgV17E, classicOgV18E, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ReputationService } from '../reputation.service.js';
import { SportsbookService, settleSportsbookEvent } from '../sportsbook.service.js';
import { refreshSportsbookCache } from '../sportsbook-feed.service.js';
import { AdminSportsbookService } from '../admin-sportsbook.service.js';

// Slices B and C share one provider-state row, so they run in one file, one test at a time.
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.8.0-B/C/D sportsbook board, tickets, feed and limits with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  let accountName = '';
  /** Provider event ids the feed tests create through a refresh, cleaned up by prefix. */
  const providerPrefix = 'c-' + randomUUID().slice(0, 8) + '-';
  const roundIds: string[] = [];
  const eventIds: string[] = [];
  const cacheFilePaths = new Set<string>();
  let savedProviderState: Awaited<ReturnType<FastifyInstance['prisma']['sportsbookProviderState']['findUnique']>> = null;
  const now = new Date('2030-03-01T18:00:00.000Z');
  const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

  /** 1.8.0-E: the sportsbook is pinned to its ruleset, so fixtures play 1.8.0-E unless told otherwise. */
  async function fixture(ruleset: Ruleset = classicOgV18E) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Sportsbook fixture', slug: 'sportsbook-' + randomUUID(),
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer,
        ...startingStock(ruleset),
        cashCents: 500_000n,
        roundId: round.id, accountId, cityId: city.id,
        displayName: 'book_' + randomUUID().slice(0, 6),
        publicPimpId: 9800 + roundIds.length,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
    await app.prisma.casinoSession.create({
      data: { roundPlayerId: player.id, cityId: city.id, bankrollCents: 500_000n, openedAt: now },
    });
    return player;
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
    // Feed runs these tests made carry their fixed future clocks.
    await app.prisma.sportsbookFeedRun.deleteMany({ where: { startedAt: { gte: new Date('2030-01-01T00:00:00.000Z') } } });
    if (savedProviderState) {
      const { id, updatedAt: _updatedAt, leagueStatus, ...rest } = savedProviderState;
      await app.prisma.sportsbookProviderState.update({ where: { id }, data: { ...rest, leagueStatus: leagueStatus as Prisma.InputJsonValue } });
    } else {
      await app.prisma.sportsbookProviderState.deleteMany({ where: { id: 'therundown' } });
    }
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
    await Promise.all([...cacheFilePaths].map((filePath) => rm(filePath, { force: true })));
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
    expect((await app.prisma.casinoSession.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'OPEN' } })).bankrollCents).toBe(490_000n);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents).toBe(500_000n);
  });

  it('splits open tickets from settled history with a lifetime chip record', async () => {
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
      if (result) return handlers.result?.(decodeURIComponent(result[1]!)) ?? reply(200, { meta: null, events: [{ status: 'STATUS_SCHEDULED' }] });
      return reply(404, {});
    }) as typeof fetch;
    const cacheFilePath = join(tmpdir(), `streets-sportsbook-${randomUUID()}.json`);
    cacheFilePaths.add(cacheFilePath);
    return { fetch: fetchImpl, sleep: noSleep, calls, cacheFilePath };
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

  /** Settlements pay casino chips into the open floor bankroll; round cash never moves. */
  async function chipsAndCash(playerId: string) {
    const session = await app.prisma.casinoSession.findFirstOrThrow({ where: { roundPlayerId: playerId, status: 'OPEN' } });
    const player = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    return { bankrollCents: session.bankrollCents, cashCents: player.cashCents };
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
    await refreshSportsbookCache(app.prisma, 'test-key', at(31), back);
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
    const feed = provider({ result: (id) => (id === providerPrefix + 'result' ? reply(200, { meta: null, events: [result] }) : reply(200, { meta: null, events: [{ status: 'STATUS_SCHEDULED' }] })) });
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
    expect((await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: game.id } })).settledVia).toBe('FEED');
    expect(await chipsAndCash(player.id)).toEqual({ bankrollCents: 523_000n, cashCents: 500_000n });

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
    expect(await chipsAndCash(player.id)).toEqual({ bankrollCents: 546_000n, cashCents: 500_000n });
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

    const feed = provider({ result: () => reply(200, { meta: null, events: [{ status: 'STATUS_POSTPONED' }] }) });
    const rechecked = await AdminSportsbookService.recheck(app.prisma, config, actor, stuck.id, feedNow, feed);
    expect(rechecked.message).toBe('Voided; 1 ticket(s) refunded.');
    expect((await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: stuck.id } })).settledVia).toBe('ADMIN_RECHECK');
    expect(rechecked.report.unresolved.some((row) => row.id === stuck.id)).toBe(false);

    const voided = await AdminSportsbookService.void(app.prisma, config, actor, pulled.id, 'Provider dropped the game for good.', feedNow);
    expect(voided.message).toContain('1 ticket(s) refunded');
    expect((await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: pulled.id } })).settledVia).toBe('ADMIN_VOID');
    await expect(AdminSportsbookService.void(app.prisma, config, actor, pulled.id, 'Provider dropped the game for good.', feedNow))
      .rejects.toMatchObject({ code: 'SPORTSBOOK_ALREADY_SETTLED' });
    // Both stakes came back; nothing was paid twice.
    expect(await chipsAndCash(player.id)).toEqual({ bankrollCents: 520_000n, cashCents: 500_000n });

    const audits = await app.prisma.adminAuditLog.findMany({ where: { targetId: { in: [stuck.id, pulled.id] } }, orderBy: { createdAt: 'asc' } });
    expect(audits.map((row) => row.action)).toEqual(['sportsbook.recheck', 'sportsbook.void']);
    expect(audits[1]).toMatchObject({ reason: 'Provider dropped the game for good.', after: expect.objectContaining({ tickets: 1, refundedCents: '10000' }) });
    await app.prisma.adminAuditLog.deleteMany({ where: { targetId: { in: [stuck.id, pulled.id] } } });
  });

  // ---- 1.8.0-D: limits, repeat and concurrent wagers, casino chips, settlement edges --------

  const dNow = new Date('2032-02-01T16:00:00.000Z');
  const dAt = (count: number) => new Date(dNow.getTime() + count * 60_000);
  const openGame = (data: Parameters<typeof event>[0] = {}) => event({ startsAt: dAt(180), oddsUpdatedAt: dAt(-5), ...data });
  const chipsOf = async (id: string) => (await app.prisma.casinoSession.findFirstOrThrow({ where: { roundPlayerId: id, status: 'OPEN' } })).bankrollCents;
  const wager = (playerId: string, eventId: string, stakeCents: number, extra: Partial<{ selection: 'HOME' | 'AWAY'; actionId: string; expectedOdds: number }> = {}) =>
    SportsbookService.placeBet(app.prisma, playerId, { eventId, selection: 'AWAY', stakeCents, actionId: randomUUID(), ...extra }, dNow);
  async function playerWith(bankrollCents: bigint) {
    const player = await fixture();
    await app.prisma.casinoSession.updateMany({ where: { roundPlayerId: player.id, status: 'OPEN' }, data: { bankrollCents } });
    return player;
  }

  it('turns a repeated or raced request into one ticket and one debit', async () => {
    await resetFeedState({ lastPolledAt: dAt(-5) });
    const player = await playerWith(1_000_000n);
    const game = await openGame();
    const input = { eventId: game.id, selection: 'AWAY' as const, stakeCents: 10_000, actionId: randomUUID() };
    const raced = await Promise.all([1, 2, 3].map(() => SportsbookService.placeBet(app.prisma, player.id, input, dNow)));
    expect(raced.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(raced.map((result) => result.bet.id)).size).toBe(1);
    expect(await chipsOf(player.id)).toBe(990_000n);

    // A retry after the line moved still returns the ticket as accepted, at its pinned price.
    await app.prisma.sportsbookEvent.update({ where: { id: game.id }, data: { awayOdds: 175 } });
    const retry = await SportsbookService.placeBet(app.prisma, player.id, input, dNow);
    expect(retry).toMatchObject({ replayed: true, bet: { oddsAmerican: 130, payoutCents: 23_000 } });
    await expect(SportsbookService.placeBet(app.prisma, player.id, { ...input, stakeCents: 20_000 }, dNow))
      .rejects.toMatchObject({ code: 'ACTION_ID_REUSED' });
    expect(await app.prisma.sportsbookBet.count({ where: { roundPlayerId: player.id } })).toBe(1);
    expect(await chipsOf(player.id)).toBe(990_000n);
  });

  it('never lets concurrent wagers overspend casino chips or the daily limit', async () => {
    await resetFeedState({ lastPolledAt: dAt(-5) });
    const short = await playerWith(3_000_000n);
    const games = await Promise.all(Array.from({ length: 5 }, () => openGame()));
    const spent = await Promise.allSettled(games.map((game) => wager(short.id, game.id, 1_000_000)));
    expect(spent.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(3);
    expect(spent.filter((outcome) => outcome.status === 'rejected').map((outcome) => (outcome as PromiseRejectedResult).reason.code))
      .toEqual(['NOT_ENOUGH_BANKROLL', 'NOT_ENOUGH_BANKROLL']);
    expect(await chipsOf(short.id)).toBe(0n);

    const rich = await playerWith(100_000_000n);
    const slate = await Promise.all(Array.from({ length: 8 }, () => openGame()));
    const daily = await Promise.allSettled(slate.map((game) => wager(rich.id, game.id, 2_000_000)));
    expect(daily.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(6);
    expect(daily.filter((outcome) => outcome.status === 'rejected').every((outcome) => (outcome as PromiseRejectedResult).reason.code === 'SPORTSBOOK_DAILY_LIMIT')).toBe(true);
    const staked = await app.prisma.sportsbookBet.aggregate({ where: { roundPlayerId: rich.id }, _sum: { stakeCents: true } });
    expect(staked._sum.stakeCents).toBe(12_000_000n);
    expect(await chipsOf(rich.id)).toBe(88_000_000n);
  });

  it('caps long-shot winnings, one game, open tickets and one side of the book', async () => {
    await resetFeedState({ lastPolledAt: dAt(-5) });
    const player = await playerWith(100_000_000n);
    const longShot = await openGame({ awayOdds: 400 });
    await expect(wager(player.id, longShot.id, 1_500_000)).rejects.toMatchObject({ code: 'SPORTSBOOK_MAX_PROFIT' });
    await expect(wager(player.id, longShot.id, 1_250_000)).resolves.toMatchObject({ bet: { payoutCents: 6_250_000 } });

    const game = await openGame();
    await wager(player.id, game.id, 1_500_000);
    // Both sides of one game count toward the same $25,000.
    await expect(wager(player.id, game.id, 1_500_000, { selection: 'HOME' })).rejects.toMatchObject({ code: 'SPORTSBOOK_GAME_LIMIT' });
    await wager(player.id, game.id, 1_000_000, { selection: 'HOME' });

    const crowded = await openGame({ awayOdds: 150 });
    const other = await fixture();
    await app.prisma.sportsbookBet.create({ data: {
      roundPlayerId: other.id, eventId: crowded.id, actionId: randomUUID(), selection: 'AWAY', oddsAmerican: 150,
      stakeCents: 66_000_000n, payoutCents: 165_000_000n, createdAt: dNow,
    } });
    await expect(wager(player.id, crowded.id, 1_000_000)).rejects.toMatchObject({ code: 'SPORTSBOOK_SIDE_LIMIT', message: expect.stringContaining('can take $6,666') });
    await expect(wager(player.id, crowded.id, 1_000_000, { selection: 'HOME' })).resolves.toBeTruthy();

    const busy = await playerWith(10_000_000n);
    const filler = await openGame();
    await app.prisma.sportsbookBet.createMany({ data: Array.from({ length: 20 }, () => ({
      roundPlayerId: busy.id, eventId: filler.id, actionId: randomUUID(), selection: 'HOME', oddsAmerican: -150,
      stakeCents: 1_000n, payoutCents: 1_667n, createdAt: dAt(-2_000),
    })) });
    await expect(wager(busy.id, (await openGame()).id, 1_000)).rejects.toMatchObject({ code: 'SPORTSBOOK_OPEN_TICKETS' });
    const limits = await SportsbookService.limits(app.prisma, busy.id, dNow);
    expect(limits).toMatchObject({ openTickets: 20, openStakeCents: 20_000, dailyStakeCents: 0 });
  });

  it('spends an open casino bankroll and returns a later payout to its casino wallet', async () => {
    await resetFeedState({ lastPolledAt: dAt(-5) });
    const player = await fixture();
    const first = await openGame();
    const second = await openGame();
    await wager(player.id, first.id, 100_000);
    await wager(player.id, second.id, 50_000, { selection: 'HOME' });
    expect(await chipsOf(player.id)).toBe(350_000n);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents).toBe(500_000n);

    // A result credits the same open floor bankroll.
    await settleSportsbookEvent(app.prisma, first.id, 'FINAL', 90, 100, dAt(240));
    expect(await chipsOf(player.id)).toBe(580_000n);

    // If the player has left the floor, the payout waits in that casino city's chip wallet.
    const session = await app.prisma.casinoSession.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'OPEN' } });
    await app.prisma.casinoSession.update({ where: { id: session.id }, data: { status: 'CLOSED', bankrollCents: 0n, closedAt: dAt(250) } });
    await app.prisma.casinoWallet.create({ data: { roundPlayerId: player.id, cityId: session.cityId, chipsCents: 580_000n } });
    await settleSportsbookEvent(app.prisma, second.id, 'FINAL', 110, 100, dAt(260));
    expect((await app.prisma.casinoWallet.findUniqueOrThrow({ where: { roundPlayerId_cityId: { roundPlayerId: player.id, cityId: session.cityId } } })).chipsCents).toBe(663_333n);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents).toBe(500_000n);

    await expect(wager(player.id, (await openGame()).id, 10_000)).rejects.toMatchObject({ code: 'CASINO_SESSION_REQUIRED' });
  });

  it('settles pushes, cancellations and late corrections exactly once, without touching turns', async () => {
    await resetFeedState({ lastPolledAt: dAt(-5) });
    const player = await playerWith(1_000_000n);
    const turns = player.turns;
    const [tie, cancelled, lost, moved] = await Promise.all([openGame(), openGame(), openGame(), openGame()]);
    await wager(player.id, tie.id, 10_000);
    await wager(player.id, cancelled.id, 20_000);
    await wager(player.id, lost.id, 30_000);
    await wager(player.id, moved.id, 40_000);
    expect(await chipsOf(player.id)).toBe(900_000n);

    // Line movement after acceptance never touches a pinned ticket.
    await app.prisma.sportsbookEvent.update({ where: { id: moved.id }, data: { awayOdds: 200, homeOdds: -240, oddsUpdatedAt: dAt(30) } });

    await settleSportsbookEvent(app.prisma, tie.id, 'FINAL', 3, 3, dAt(300));
    await settleSportsbookEvent(app.prisma, cancelled.id, 'VOID', null, null, dAt(300));
    await settleSportsbookEvent(app.prisma, lost.id, 'FINAL', 5, 2, dAt(300));
    await settleSportsbookEvent(app.prisma, moved.id, 'FINAL', 2, 5, dAt(300));
    const statuses = async () => Object.fromEntries((await app.prisma.sportsbookBet.findMany({ where: { roundPlayerId: player.id }, select: { eventId: true, status: true, oddsAmerican: true, payoutCents: true } }))
      .map((row) => [row.eventId, row]));
    const settled = await statuses();
    expect(settled[tie.id]!.status).toBe('PUSH');
    expect(settled[cancelled.id]!.status).toBe('VOID');
    expect(settled[lost.id]!.status).toBe('LOST');
    expect(settled[moved.id]).toMatchObject({ status: 'WON', oddsAmerican: 130, payoutCents: 92_000n });
    // Stakes back on the push and void, nothing on the loss, the pinned payout on the win.
    expect(await chipsOf(player.id)).toBe(1_022_000n);

    // The provider corrects every score afterwards: nothing is graded or paid again.
    const late = await Promise.all([
      settleSportsbookEvent(app.prisma, tie.id, 'FINAL', 4, 3, dAt(400)),
      settleSportsbookEvent(app.prisma, cancelled.id, 'FINAL', 1, 0, dAt(400)),
      settleSportsbookEvent(app.prisma, lost.id, 'FINAL', 2, 5, dAt(400)),
      settleSportsbookEvent(app.prisma, moved.id, 'VOID', null, null, dAt(400)),
    ]);
    expect(late).toEqual([null, null, null, null]);
    expect(await statuses()).toEqual(settled);
    expect(await chipsOf(player.id)).toBe(1_022_000n);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).turns).toBe(turns);
  });

  // ---- 1.8.0-E: historical rulesets, market review and the provider release gate ----------

  const eNow = new Date('2033-03-01T15:00:00.000Z');
  const eAt = (count: number) => new Date(eNow.getTime() + count * 60_000);

  it('keeps the sportsbook out of rounds pinned before 1.8.0-E, while their old tickets still settle', async () => {
    await resetFeedState({ lastPolledAt: eAt(-5) });
    const older = await fixture(classicOgV17E);
    const game = await event({ startsAt: eAt(120), oddsUpdatedAt: eAt(-5) });
    await expect(SportsbookService.placeBet(app.prisma, older.id, {
      eventId: game.id, selection: 'AWAY', stakeCents: 10_000, actionId: randomUUID(),
    }, eNow)).rejects.toMatchObject({ code: 'SPORTSBOOK_CLOSED', message: "Sports betting is not part of this round's rules." });
    expect(await SportsbookService.limits(app.prisma, older.id, eNow)).toMatchObject({ available: false });
    expect(await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: older.id } })).toMatchObject({ cashCents: 500_000n });

    // A ticket from before chip origins were stored still settles as casino chips, never cash.
    await app.prisma.sportsbookBet.create({ data: {
      roundPlayerId: older.id, eventId: game.id, actionId: randomUUID(), selection: 'AWAY', oddsAmerican: 130,
      stakeCents: 10_000n, payoutCents: 23_000n, createdAt: eAt(-60),
    } });
    await settleSportsbookEvent(app.prisma, game.id, 'FINAL', 1, 4, eAt(300));
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: older.id } })).cashCents).toBe(500_000n);
    expect((await app.prisma.casinoSession.findFirstOrThrow({ where: { roundPlayerId: older.id, status: 'OPEN' } })).bankrollCents).toBe(523_000n);
    expect((await SportsbookService.tickets(app.prisma, older.id)).settled[0]).toMatchObject({ status: 'WON', returnCents: 23_000 });

    const current = await fixture();
    expect(await SportsbookService.limits(app.prisma, current.id, eNow)).toMatchObject({ available: true, limits: classicOgV18E.casino.sportsbook.limits });
  });

  it('scores the first market against the expansion checks from real runs and grading', async () => {
    await resetFeedState({ datapointsLimit: 20_000, datapointsPeriod: 'month' });
    const config = { configured: true, pollMinutes: 30, apiKey: 'test-key' };
    // Nothing yet: every check that needs history fails, so expansion stays closed.
    const empty = await AdminSportsbookService.report(app.prisma, config, eNow);
    expect(empty.review.ready).toBe(false);

    // 20 days of runs, two a day from 15:00 UTC (so 21 calendar dates), one failure; 300 datapoints a day projects 9,000 a month.
    await app.prisma.sportsbookFeedRun.createMany({ data: Array.from({ length: 40 }, (_, index) => ({
      startedAt: eAt(-(20 * 24 * 60) + index * 12 * 60), oddsPolled: true, requests: 8, datapoints: 150,
      snapshots: index === 7 ? 0 : 8, failedSnapshots: index === 7 ? 8 : 0, pulled: 0, resultChecks: 2, settled: 2, failed: index === 7, error: '',
    })) });
    const graded = await Promise.all(Array.from({ length: 60 }, (_, index) => event({
      providerEventId: providerPrefix + 'graded-' + index, startsAt: eAt(-3 * 24 * 60), status: index === 59 ? 'VOID' : 'FINAL',
    })));
    await app.prisma.sportsbookEvent.updateMany({ where: { id: { in: graded.map((row) => row.id) } }, data: { settledAt: eAt(-3 * 24 * 60 + 200), settledVia: 'FEED' } });

    const ready = await AdminSportsbookService.report(app.prisma, config, eNow);
    const result = (key: string) => ready.review.criteria.find((criterion) => criterion.key === key)?.pass;
    expect(ready.review).toMatchObject({
      runs: 40, failedRuns: 1, daysWithSnapshots: 21, datapoints: 6_000, datapointsPerDay: 300, projectedPerPeriod: 9_000,
      settled: { total: 60, feed: 60, voidedByFeed: 1, adminRecheck: 0, adminVoid: 0 },
      hoursToSettle: { median: 3.3, p90: 3.3 },
    });
    expect(['history', 'sample', 'auto', 'failures', 'quota'].map(result)).toEqual([true, true, true, true, true]);
    expect(ready.review.ready).toBe(result('stuck'));

    // Two admin voids out of 62 drop the feed's share below 98%.
    const voided = await Promise.all([1, 2].map((n) => event({ providerEventId: providerPrefix + 'admin-' + n, startsAt: eAt(-2 * 24 * 60), status: 'VOID' })));
    await app.prisma.sportsbookEvent.updateMany({ where: { id: { in: voided.map((row) => row.id) } }, data: { settledAt: eAt(-2 * 24 * 60 + 60), settledVia: 'ADMIN_VOID' } });
    const shaky = await AdminSportsbookService.report(app.prisma, config, eNow);
    expect(shaky.review.criteria.find((criterion) => criterion.key === 'auto')).toMatchObject({ pass: false, value: '96.8%' });
    expect(shaky.review.ready).toBe(false);
  });

  it('checks a live provider snapshot for the release gate without storing it', async () => {
    await resetFeedState();
    const actor = { id: accountId, username: accountName };
    const config = { configured: true, pollMinutes: 30, apiKey: 'test-key' };
    const today = eNow.toISOString().slice(0, 10);
    const feed = provider({ odds: (league, date) => reply(200, { events: league === 'NHL' && date === today ? [
      listing(providerPrefix + 'check-1', eAt(240)),
      listing(providerPrefix + 'check-2', eAt(300), 'STATUS_POSTPONED'),
      { event_id: providerPrefix + 'check-3', event_date: eAt(360).toISOString(), teams: [], markets: [] },
    ] : [] }) });
    const check = await AdminSportsbookService.providerCheck(app.prisma, config, actor, 'NHL', eNow, feed);
    expect(check).toMatchObject({
      league: 'NHL', date: today, ok: true, error: '',
      summary: { events: 3, parsed: 2, withoutPrices: 0, skipped: { NO_TEAMS: 1 } },
      quota: { datapoints: 3, remaining: 19_000 },
    });
    expect(check.summary!.statuses).toEqual(expect.arrayContaining([
      { raw: 'STATUS_SCHEDULED', outcome: 'PRE', count: 1 },
      { raw: 'STATUS_POSTPONED', outcome: 'CANCELLED', count: 1 },
    ]));
    expect(feed.calls).toEqual(['/api/v2/sports/6/events/' + today]);
    expect(await app.prisma.sportsbookEvent.count({ where: { providerEventId: { startsWith: providerPrefix + 'check-' } } })).toBe(0);
    expect((await app.prisma.sportsbookProviderState.findUniqueOrThrow({ where: { id: 'therundown' } })).datapointsRemaining).toBe(19_000);

    const failing = await AdminSportsbookService.providerCheck(app.prisma, config, actor, 'NFL', eNow, provider({ odds: () => reply(401, {}) }));
    expect(failing).toMatchObject({ ok: false, summary: null, error: expect.stringContaining('rejected the API key') });
    await expect(AdminSportsbookService.providerCheck(app.prisma, { ...config, apiKey: '' }, actor, 'NFL', eNow)).rejects.toMatchObject({ code: 'SPORTSBOOK_FEED_OFF' });
    const audits = await app.prisma.adminAuditLog.findMany({ where: { action: 'sportsbook.provider-check', actorAccountId: accountId } });
    expect(audits).toHaveLength(2);
    await app.prisma.adminAuditLog.deleteMany({ where: { action: 'sportsbook.provider-check', actorAccountId: accountId } });
  });

  it('manually pulls provider odds into the shared player cache', async () => {
    await resetFeedState();
    const actor = { id: accountId, username: accountName };
    const config = { configured: true, pollMinutes: 30, apiKey: 'test-key' };
    const today = eNow.toISOString().slice(0, 10);
    const feed = provider({
      odds: (league, date) => reply(200, {
        events: league === 'NFL' && date === today ? [listing(providerPrefix + 'manual-pull', eAt(180))] : [],
      }),
    });

    // A pull also checks results for games earlier tests left open; count only the odds snapshots.
    const snapshots = () => feed.calls.filter((path) => /\/sports\/\d+\/events\/\d{4}-\d{2}-\d{2}$/.test(path));
    const result = await AdminSportsbookService.pullNow(app.prisma, config, actor, eNow, feed);
    expect(result.message).toContain('8 snapshots fetched');
    expect(snapshots()).toHaveLength(8);
    const stored = await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { providerEventId: providerPrefix + 'manual-pull' } });
    expect(stored).toMatchObject({ status: 'PRE', homeOdds: -160, awayOdds: 140, oddsUpdatedAt: eNow });
    const board = await SportsbookService.board(app.prisma, { configured: true, pollMinutes: 30 }, eNow);
    expect(board.events.find((row) => row.id === stored.id)?.lineState).toBe('OPEN');

    const stillFresh = await AdminSportsbookService.pullNow(app.prisma, config, actor, eAt(29), feed);
    expect(stillFresh.message).toContain('no odds snapshot requests were made');
    expect(snapshots()).toHaveLength(8);
    const diskCache = JSON.parse(await readFile(feed.cacheFilePath, 'utf8')) as { version: number; updatedAt: string; snapshots: Array<{ league: string; date: string }> };
    expect(diskCache).toMatchObject({ version: 1, updatedAt: eNow.toISOString() });
    expect(diskCache.snapshots).toContainEqual(expect.objectContaining({ league: 'NFL', date: today }));

    // Today is always due again; tomorrow's slates came back empty, so they wait out the
    // longer empty-future recheck window (SPORTSBOOK_EMPTY_FUTURE_RECHECK_MS).
    const dueAgain = await AdminSportsbookService.pullNow(app.prisma, config, actor, eAt(30), feed);
    expect(dueAgain.message).toContain('4 snapshots fetched');
    expect(snapshots()).toHaveLength(12);
    expect(snapshots().slice(8).every((path) => path.endsWith('/' + today))).toBe(true);

    const audit = await app.prisma.adminAuditLog.findFirst({
      where: { action: 'sportsbook.manual-pull', targetId: 'therundown', actorAccountId: accountId },
    });
    expect(audit).toBeTruthy();
    await app.prisma.adminAuditLog.deleteMany({ where: { action: 'sportsbook.manual-pull', targetId: 'therundown', actorAccountId: accountId } });
  });

  it('prices and settles a game from TheRundown v2 payloads end to end', async () => {
    await resetFeedState();
    const now2 = new Date('2033-06-01T15:00:00.000Z');
    const today = now2.toISOString().slice(0, 10);
    const id = providerPrefix + 'v2';
    const v2Listing = (status: string, score: Record<string, unknown> = {}) => ({
      event_id: id, sport_id: 2, event_date: new Date(now2.getTime() + 180 * 60_000).toISOString(),
      score: { event_status: status, score_away: 0, score_home: 0, ...score },
      teams: [
        { team_id: 31, name: 'Philadelphia', mascot: 'Eagles', abbreviation: 'PHI', is_away: true, is_home: false },
        { team_id: 15, name: 'Jacksonville', mascot: 'Jaguars', abbreviation: 'JAX', is_away: false, is_home: true },
      ],
      markets: [{ market_id: 1, period_id: 0, name: 'moneyline', participants: [
        { id: 31, type: 'TYPE_TEAM', name: 'Philadelphia Eagles', lines: [{ id: 1, value: '', prices: { 3: { price: -175, is_main_line: true } } }] },
        { id: 15, type: 'TYPE_TEAM', name: 'Jacksonville Jaguars', lines: [{ id: 2, value: '', prices: { 3: { price: 145, is_main_line: true } } }] },
      ] }],
    });
    let result = v2Listing('STATUS_SCHEDULED');
    const feed = provider({
      odds: (league, date) => reply(200, { events: league === 'NFL' && date === today ? [v2Listing('STATUS_SCHEDULED')] : [] }),
      result: (eventId) => reply(200, eventId === id ? { meta: null, events: [result] } : { meta: null, events: [{ status: 'STATUS_SCHEDULED' }] }),
    });
    await refreshSportsbookCache(app.prisma, 'test-key', now2, feed);
    const stored = await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { providerEventId: id } });
    expect(stored).toMatchObject({ homeTeam: 'Jacksonville Jaguars', awayTeam: 'Philadelphia Eagles', homeOdds: 145, awayOdds: -175, status: 'PRE' });
    const board = await SportsbookService.board(app.prisma, { configured: true, pollMinutes: 30 }, now2);
    expect(board.events.find((row) => row.id === stored.id)?.lineState).toBe('OPEN');

    const player = await fixture();
    await SportsbookService.placeBet(app.prisma, player.id, { eventId: stored.id, selection: 'HOME', stakeCents: 10_000, actionId: randomUUID(), expectedOdds: 145 }, now2);
    result = v2Listing('STATUS_FINAL', { score_away: 17, score_home: 24 });
    await refreshSportsbookCache(app.prisma, 'test-key', new Date(now2.getTime() + 7 * 3_600_000), feed);
    expect(await app.prisma.sportsbookEvent.findUniqueOrThrow({ where: { id: stored.id } })).toMatchObject({ status: 'FINAL', homeScore: 24, awayScore: 17, settledVia: 'FEED' });
    // $100 at +145 pays $245.
    expect((await app.prisma.casinoSession.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'OPEN' } })).bankrollCents).toBe(514_500n);
  });
});
