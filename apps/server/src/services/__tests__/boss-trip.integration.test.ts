import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgTripsA, classicOgV08H } from '@streets/rulesets';
import { calculateNetWorthCents, hotelCents, startingStock, tripNetWorthCents } from '@streets/rules-engine';
import type {
  CombatPageDto,
  GameActionResult,
  ScoutResult,
  TravelDto,
  TripExtendResult,
  TripHeadHomeResult,
  TripLaunchResult,
} from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Trips A gate, live: a trip conserves the bankroll and spends only the ticket and the
 * hotel; the boss's home stays home (same city, still a target, still working); the
 * lieutenant skims Scout while the boss is away and never after; a stay extends only in
 * town and out of the bankroll; checking out refunds nothing; coming home is lazy and
 * settles once however often it is read. Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('boss trips with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const cityIds: Record<string, string> = {};
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgTripsA;
  const trips = rules.travel.trips;
  const minute = 60_000;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const city of await app.prisma.city.findMany({ select: { id: true, slug: true } })) cityIds[city.slug] = city.id;
    const round = await app.prisma.round.create({ data: {
      name: 'Boss trip fixture', slug: `boss-trip-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (let index = 0; index < 2; index++) {
      const name = `boss_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[index]!, cityId: cityIds['new-york-city']!, displayName: name, publicPimpId: 7700 + index,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.round.update({
      where: { id: roundId },
      data: { rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, endsAt: new Date(Date.now() + 10 * 86_400_000) },
    });
    await app.prisma.bossTrip.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.relocation.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: { in: players } } });
    for (const id of players) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 120, thugs: 40, woundedThugs: 0, pistols: 40, beer: 500, condoms: 5_000, crack: 900, lowRiders: 2,
        turns: 144, cashCents: 80_000_000n, heat: 0, lockedUntil: null, movingUntil: null, awayNetWorthCents: 0n,
        cityId: cityIds['new-york-city']!, createdAt: new Date('2000-01-01'), raidProtectedUntil: null,
        lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const post = (player: number, url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[player]! }, payload });
  const get = (player: number, url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[player]! } });
  const row = (player: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[player]! } });
  const trip = (player: number) => app.prisma.bossTrip.findFirstOrThrow({ where: { roundPlayerId: players[player]! }, orderBy: { departedAt: 'desc' } });
  const fly = (player: number, payload: Partial<{ to: string; stayMinutes: number; bankrollCents: number; actionId: string }> = {}) =>
    post(player, '/travel/trip', { to: 'las-vegas', stayMinutes: 120, bankrollCents: 1_000_000, actionId: randomUUID(), ...payload });
  const scout = (player: number) => post(player, '/scout', { district: 'WINO_SLUMS', turns: 2, actionId: randomUUID() });
  /** Shift the trip so the boss landed `minutesInTown` ago, keeping its stay and flights. */
  const land = async (player: number, minutesInTown = 5) => {
    const current = await trip(player);
    const flight = current.arrivesAt.getTime() - current.departedAt.getTime();
    const stay = current.stayUntil.getTime() - current.arrivesAt.getTime();
    const arrivesAt = new Date(Date.now() - minutesInTown * minute);
    await app.prisma.bossTrip.update({ where: { id: current.id }, data: {
      departedAt: new Date(arrivesAt.getTime() - flight), arrivesAt,
      stayUntil: new Date(arrivesAt.getTime() + stay), returnsAt: new Date(arrivesAt.getTime() + stay + flight),
    } });
  };
  /** Shift the whole trip into the past, so the boss is due home. */
  const landHome = async (player: number) => {
    const current = await trip(player);
    const shift = current.returnsAt.getTime() - Date.now() + minute;
    const back = (at: Date) => new Date(at.getTime() - shift);
    await app.prisma.bossTrip.update({ where: { id: current.id }, data: {
      departedAt: back(current.departedAt), arrivesAt: back(current.arrivesAt), stayUntil: back(current.stayUntil), returnsAt: back(current.returnsAt),
    } });
  };

  it('flies the boss out on the ticket, the hotel and the bankroll, and leaves home where it is', async () => {
    const before = await row(0);
    const sent = await fly(0);
    expect(sent.statusCode, sent.body).toBe(200);
    const result = sent.json<GameActionResult<TripLaunchResult>>().result;
    const hotel = hotelCents(trips, 'las-vegas', 120);
    expect(BigInt(result.hotelCents)).toBe(hotel);
    expect(result.ticketCents).toBe(trips.ticketCents);

    const during = await row(0);
    expect(during.cashCents).toBe(before.cashCents - BigInt(trips.ticketCents) - hotel - 1_000_000n);
    expect(during.turns).toBe(before.turns - trips.launchTurns);
    expect(during.awayNetWorthCents).toBe(tripNetWorthCents(rules, 1_000_000n));
    expect(during.netWorthCents).toBe(calculateNetWorthCents({ ...during, products: {} }, rules));
    // Home stays home: same city, still a target there, and the operation still works.
    expect(during.cityId).toBe(cityIds['new-york-city']);
    expect((await get(1, '/combat')).json<CombatPageDto>().targets.map((target) => target.publicPimpId)).toContain(before.publicPimpId);
    const worked = await scout(0);
    expect(worked.statusCode, worked.body).toBe(200);

    const page = (await get(0, '/travel')).json<TravelDto>();
    expect(page.trips?.trip).toMatchObject({ city: 'las-vegas', phase: 'outbound', bankrollCents: 1_000_000, canHeadHome: false });
    expect(page.trips?.blockedCode).toBe('TRIP_OUT');
    expect((await fly(0)).json().error.code).toBe('TRIP_OUT');
    expect((await post(0, '/travel/move', { to: 'atlanta', actionId: randomUUID() })).json().error.code).toBe('TRIP_OUT');
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: players[0]!, type: 'TRIP_STARTED' } })).toBe(1);
  });

  it('answers a replayed launch with the first result and charges once', async () => {
    const before = await row(0);
    const actionId = randomUUID();
    const first = await fly(0, { actionId });
    const second = await fly(0, { actionId });
    expect(first.statusCode, first.body).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(await app.prisma.bossTrip.count({ where: { roundPlayerId: players[0]! } })).toBe(1);
    const after = await row(0);
    expect(after.cashCents).toBe(before.cashCents - BigInt(first.json<GameActionResult<TripLaunchResult>>().result.ticketCents) - hotelCents(trips, 'las-vegas', 120) - 1_000_000n);
  });

  it('lets the lieutenant skim Scout while the boss is away, and never once they are home', async () => {
    expect((await fly(0)).statusCode).toBe(200);
    const away = (await scout(0)).json<GameActionResult<ScoutResult>>().result;
    expect(away.lieutenantCutCents).toBeGreaterThan(0);
    const gross = BigInt(away.cashEarnedCents + away.lieutenantCutCents!);
    expect(BigInt(away.lieutenantCutCents!)).toBe((gross * BigInt(Math.round(trips.lieutenantCut * 10_000))) / 10_000n);

    await landHome(0);
    const home = (await scout(0)).json<GameActionResult<ScoutResult>>().result;
    expect(home.cashEarnedCents).toBeGreaterThan(0);
    expect(home.lieutenantCutCents).toBeUndefined();
  });

  it('extends a stay only in town, out of the bankroll', async () => {
    expect((await fly(0)).statusCode).toBe(200);
    expect((await post(0, '/travel/trip/extend', { blocks: 1, actionId: randomUUID() })).json().error.code).toBe('NOT_IN_TOWN');

    await land(0);
    const before = await trip(0);
    const cashBefore = (await row(0)).cashCents;
    const sent = await post(0, '/travel/trip/extend', { blocks: 1, actionId: randomUUID() });
    expect(sent.statusCode, sent.body).toBe(200);
    const result = sent.json<GameActionResult<TripExtendResult>>().result;
    const extra = hotelCents(trips, 'las-vegas', trips.extendMinutes);
    expect(BigInt(result.hotelCents)).toBe(extra);

    const after = await trip(0);
    expect(after.bankrollCents).toBe(before.bankrollCents - extra);
    expect(after.hotelCents).toBe(before.hotelCents + extra);
    expect(after.stayUntil.getTime() - before.stayUntil.getTime()).toBe(trips.extendMinutes * minute);
    expect(after.returnsAt.getTime() - before.returnsAt.getTime()).toBe(trips.extendMinutes * minute);
    const player = await row(0);
    // Nothing is wired from home.
    expect(player.cashCents).toBe(cashBefore);
    expect(player.awayNetWorthCents).toBe(tripNetWorthCents(rules, after.bankrollCents));

    // A bankroll that cannot cover it cannot stay on.
    await app.prisma.bossTrip.update({ where: { id: after.id }, data: { bankrollCents: extra - 1n } });
    expect((await post(0, '/travel/trip/extend', { blocks: 1, actionId: randomUUID() })).json().error.code).toBe('NOT_ENOUGH_BANKROLL');
  });

  it('checks out early for nothing back, and comes home once however often it is read', async () => {
    expect((await fly(0, { bankrollCents: 2_500_000 })).statusCode).toBe(200);
    expect((await post(0, '/travel/trip/home', { actionId: randomUUID() })).json().error.code).toBe('NOT_IN_TOWN');
    await land(0);
    const checkedOut = await post(0, '/travel/trip/home', { actionId: randomUUID() });
    expect(checkedOut.statusCode, checkedOut.body).toBe(200);
    const returnsAt = new Date(checkedOut.json<GameActionResult<TripHeadHomeResult>>().result.returnsAt).getTime();
    expect(returnsAt).toBeGreaterThan(Date.now());
    expect(returnsAt).toBeLessThanOrEqual(Date.now() + trips.flightMinutes * minute);
    expect((await get(0, '/travel')).json<TravelDto>().trips?.trip?.phase).toBe('inbound');

    const away = await row(0);
    await landHome(0);
    const first = (await get(0, '/travel')).json<TravelDto>();
    await get(0, '/travel');
    const home = await row(0);
    expect(home.cashCents).toBe(away.cashCents + 2_500_000n);
    expect(home.awayNetWorthCents).toBe(0n);
    expect((await trip(0)).status).toBe('RETURNED');
    expect(first.trips?.trip).toBeNull();
    expect(first.trips?.lastTrip).toMatchObject({ city: 'las-vegas', startBankrollCents: 2_500_000, bankrollCents: 2_500_000 });
    expect(first.trips?.blockedCode).toBeNull();
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: players[0]!, type: 'TRIP_RETURNED' } })).toBe(1);
  });

  it('refuses a trip the rules do not allow', async () => {
    expect((await fly(0, { bankrollCents: trips.carryOnCapCents + 1 })).json().error.code).toBe('OVER_CARRY_ON');
    expect((await fly(0, { stayMinutes: 90 })).json().error.code).toBe('BAD_STAY');
    expect((await fly(0, { to: 'new-york-city' })).json().error.code).toBe('ALREADY_HOME');
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { cashCents: 100n } });
    expect((await fly(0)).json().error.code).toBe('NOT_ENOUGH_CASH');

    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: classicOgV08H.meta.id, rulesetVersion: classicOgV08H.meta.version } });
    expect((await fly(1)).json().error.code).toBe('TRIPS_DISABLED');
    expect((await get(1, '/travel')).json<TravelDto>().trips).toBeNull();
    expect(await app.prisma.bossTrip.count({ where: { roundPlayerId: { in: players } } })).toBe(0);
  });
});
