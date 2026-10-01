import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgTripsB } from '@streets/rulesets';
import { rideAlongHourCents, startingStock } from '@streets/rules-engine';
import type { GameActionResult, RunLaunchResult, ScoutResult, TravelDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Trips B gate, live: the boss can ride along with a run. Its towns hold it for the long
 * window; the hotel bills the run's cash once per started hour however often the run is
 * read; a run that cannot pay checks the boss out and comes home early; heading home stops
 * the bill; the lieutenant skims while the boss rides and never after; and there is only
 * one boss. Crew-only runs are unchanged. Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('boss ride-along with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgTripsB;
  const ride = rules.travel.trips.rideAlong;
  const minute = 60_000;
  const escorts = 6;
  const hour = rideAlongHourCents(rules.travel.trips, 'detroit', escorts);

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Ride-along fixture', slug: `ride-along-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    const name = `rider_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accounts.push(registered.json().account.id);
    cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId: accounts[0]!, cityId, displayName: name, publicPimpId: 7800,
      reputation: { create: ReputationService.seedFor(rules) } } });
    players.push(player.id);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.run.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.bossTrip.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.cityShelf.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.citySighting.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.economyLedgerEntry.deleteMany({ where: { roundPlayerId: { in: players } } });
    const data = { ...rules.round.startingPlayer, ...startingStock(rules),
      whores: 120, thugs: 40, woundedThugs: 0, pistols: 40, beer: 500, condoms: 5_000, crack: 900, lowRiders: 3,
      turns: 144, cashCents: 50_000_000n, heat: 0, awayNetWorthCents: 0n, lockedUntil: null, movingUntil: null, cityId,
      createdAt: new Date('2000-01-01'), lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
  });

  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[0]! }, payload });
  const get = (url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[0]! } });
  const row = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[0]! } });
  const run = () => app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: players[0]! }, include: { stops: { orderBy: { order: 'asc' } } } });
  const travel = async () => (await get('/travel')).json<TravelDto>();
  const launch = async (payload: Record<string, unknown> = {}) => {
    const sent = await post('/travel/launch', {
      to: 'detroit', route: 0, lowRiders: 2, escortThugs: escorts, cashCents: 1_000_000, cargo: {}, rideAlong: true, actionId: randomUUID(), ...payload,
    });
    // Police stops are the risk suite's business: mark every leg checked so cash only moves for the hotel.
    if (sent.statusCode === 200) await app.prisma.run.updateMany({ where: { roundPlayerId: players[0]!, status: 'ACTIVE' }, data: { roadChecks: 99 } });
    return sent;
  };
  /** Shift the run's clock so it arrived in town `minutesInTown` ago. */
  const inTownFor = async (minutesInTown: number) => {
    const current = await run();
    const shift = current.stops[0]!.arriveAt.getTime() - (Date.now() - minutesInTown * minute);
    for (const stop of current.stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: {
        departAt: new Date(stop.departAt.getTime() - shift),
        arriveAt: new Date(stop.arriveAt.getTime() - shift),
        leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - shift) : null,
      } });
    }
    if (current.hotelStayAt) {
      await app.prisma.run.update({ where: { id: current.id }, data: { hotelStayAt: new Date(current.hotelStayAt.getTime() - shift) } });
    }
  };
  const scout = async () => (await post('/scout', { district: 'WINO_SLUMS', turns: 2, actionId: randomUUID() })).json<GameActionResult<ScoutResult>>().result;

  it('takes the boss along: the town holds the run, home pays the lieutenant, and there is one boss', async () => {
    const sent = await launch();
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json<GameActionResult<RunLaunchResult>>().result.bossAboard).toBe(true);
    const out = await run();
    expect(out.bossAboard).toBe(true);
    expect(out.stops[0]!.leaveAt!.getTime() - out.stops[0]!.arriveAt.getTime()).toBe(ride.maxStayMinutes * minute);

    const page = await travel();
    expect(page.trips?.bossRun).toMatchObject({ runId: out.id, cityName: 'Detroit' });
    expect(page.trips?.blockedCode).toBe('BOSS_ON_RUN');
    expect(page.runs[0]).toMatchObject({ bossAboard: true, hotel: { hourCents: Number(hour), paidCents: 0 } });
    const flight = await post('/travel/trip', { to: 'las-vegas', stayMinutes: 120, bankrollCents: 0, actionId: randomUUID() });
    expect(flight.json().error.code).toBe('BOSS_ON_RUN');
    expect((await scout()).lieutenantCutCents).toBeGreaterThan(0);
  });

  it('refuses a ride-along while the boss is on a plane', async () => {
    const flight = await post('/travel/trip', { to: 'las-vegas', stayMinutes: 120, bankrollCents: 0, actionId: randomUUID() });
    expect(flight.statusCode, flight.body).toBe(200);
    expect((await launch()).json().error.code).toBe('BOSS_AWAY');
    expect(await app.prisma.run.count({ where: { roundPlayerId: players[0]! } })).toBe(0);
  });

  it('bills the run once per started hour, however often it is read', async () => {
    expect((await launch()).statusCode).toBe(200);
    await inTownFor(150);
    const first = await travel();
    expect(first.runs[0]!.hotel).toMatchObject({ hoursPaid: 3, paidCents: Number(3n * hour) });
    expect(first.runs[0]!.cashCents).toBe(Number(1_000_000n - 3n * hour));
    const again = await travel();
    expect(again.runs[0]!.cashCents).toBe(first.runs[0]!.cashCents);
    expect((await row()).awayNetWorthCents).toBeGreaterThan(0n);
    expect(await app.prisma.economyLedgerEntry.count({ where: { roundPlayerId: players[0]!, source: 'RUN_HOTEL' } })).toBe(1);
  });

  it('checks the boss out when the cash runs dry, and the run comes home early with what is left', async () => {
    const carried = 2n * hour + hour / 2n;
    expect((await launch({ cashCents: Number(carried) })).statusCode).toBe(200);
    const before = await row();
    await inTownFor(5 * 60);
    await travel();
    const done = await run();
    expect(done.status).toBe('RETURNED');
    expect(done.hotelCents).toBe(2n * hour);
    expect(done.stops[0]!.leaveAt!.getTime() - done.stops[0]!.arriveAt.getTime()).toBe(2 * 60 * minute);
    const after = await row();
    expect(after.cashCents).toBe(before.cashCents + carried - 2n * hour);
    expect(after.awayNetWorthCents).toBe(0n);
    // Home again: the lieutenant is back to taking nothing.
    expect((await scout()).lieutenantCutCents).toBeUndefined();
  });

  it('stops billing when the boss heads home', async () => {
    expect((await launch()).statusCode).toBe(200);
    await inTownFor(30);
    const home = await post('/travel/head-home', { actionId: randomUUID() });
    expect(home.statusCode, home.body).toBe(200);
    await inTownFor(6 * 60);
    await travel();
    const done = await run();
    expect(done.status).toBe('RETURNED');
    expect(done.hotelCents).toBe(hour);
  });

  it('leaves crew-only runs exactly as they were', async () => {
    expect((await launch({ rideAlong: false })).statusCode).toBe(200);
    const out = await run();
    expect(out.bossAboard).toBe(false);
    expect(out.stops[0]!.leaveAt!.getTime() - out.stops[0]!.arriveAt.getTime()).toBe(rules.travel.runs.townWindowMinutes * minute);
    await inTownFor(90);
    const page = await travel();
    expect(page.runs[0]).toMatchObject({ bossAboard: false, hotel: null, cashCents: 1_000_000 });
    expect(page.trips?.bossRun).toBeNull();
    expect((await scout()).lieutenantCutCents).toBeUndefined();
  });
});
