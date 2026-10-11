import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12A } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ReputationService } from '../reputation.service.js';
import { SportsbookService } from '../sportsbook.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.8.0-B sportsbook board and tickets with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
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

  async function event(data: Partial<{ sport: string; startsAt: Date; oddsUpdatedAt: Date | null; homeOdds: number | null; awayOdds: number | null; status: string; homeScore: number; awayScore: number }> = {}) {
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
    const accountName = 'book_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: accountName, email: accountName + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    await app.prisma.sportsbookEvent.deleteMany({ where: { id: { in: eventIds } } });
    if (savedProviderState) {
      const { id, updatedAt: _updatedAt, ...rest } = savedProviderState;
      await app.prisma.sportsbookProviderState.update({ where: { id }, data: rest });
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
});
