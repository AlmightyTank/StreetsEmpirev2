import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgTripsD2 } from '@streets/rulesets';
import { hashParts, rollAirport, seededRng, startingStock } from '@streets/rules-engine';
import type { CombatPageDto, ConvoysDto, GameActionResult, TravelDto, TripLaunchResult, TripOutpostVisitResult } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { outpostBoxWorthCents } from '../turf.service.js';

/**
 * Trips D2 gate, live: airport security grounds a very hot boss and robs and delays a hot
 * one; allies who live where a boss is hit can answer the boss's call and fight for them;
 * a boss in town can walk an outpost, keep its crew from walking out and carry its cash;
 * and two bosses in one city can sit down, after which neither can hit the other.
 * Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('trips D2 with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let allianceId = '';
  const cityIds: Record<string, string> = {};
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const pimps: number[] = [];
  const rules = classicOgTripsD2;
  const trips = rules.travel.trips;
  const minute = 60_000;
  /** 0 flies out of New York; 1 lives in Las Vegas and hunts; 2 lives in Las Vegas and is 0's ally. */
  const homes = ['new-york-city', 'las-vegas', 'las-vegas'];

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const city of await app.prisma.city.findMany({ select: { id: true, slug: true } })) cityIds[city.slug] = city.id;
    const round = await app.prisma.round.create({ data: {
      name: 'Trips D2 fixture', slug: `trips-d2-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (let index = 0; index < homes.length; index++) {
      const name = `dtwo_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
      pimps.push(8100 + index);
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[index]!, cityId: cityIds[homes[index]!]!, displayName: name, publicPimpId: pimps[index]!,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
    const tag = randomUUID().slice(0, 4).toUpperCase();
    allianceId = (await app.prisma.alliance.create({ data: {
      roundId, name: `D2 ${tag}`, nameNormalized: `d2 ${tag}`.toLowerCase(), tag, tagNormalized: tag.toLowerCase(), leaderId: players[0]!,
    } })).id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    const mine = { roundPlayerId: { in: players } };
    await app.prisma.sitDown.deleteMany({ where: { OR: [{ proposerId: { in: players } }, { inviteeId: { in: players } }] } });
    await app.prisma.bossHit.deleteMany({ where: { OR: [{ attackerId: { in: players } }, { ownerId: { in: players } }] } });
    await app.prisma.bossTrip.deleteMany({ where: mine });
    await app.prisma.convoyRecon.deleteMany({ where: mine });
    await app.prisma.combatInjury.deleteMany({ where: mine });
    await app.prisma.turf.deleteMany({ where: { roundId } });
    await app.prisma.processedAction.deleteMany({ where: mine });
    await app.prisma.playerActivity.deleteMany({ where: mine });
    for (let index = 0; index < players.length; index++) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 120, thugs: 40, woundedThugs: 0, busyThugs: 0, postedThugs: 0, pistols: 40, beer: 500, condoms: 5_000, crack: 900, lowRiders: 2,
        turns: 144, cashCents: 80_000_000n, heat: 0, awayNetWorthCents: 0n, outpostNetWorthCents: 0n, postedNetWorthCents: 0n,
        lockedUntil: null, movingUntil: null, laidUpUntil: null, hideoutLookoutsLevel: 5,
        allianceId: index === 1 ? null : allianceId,
        cityId: cityIds[homes[index]!]!, createdAt: new Date(Date.now() - 2 * 86_400_000),
        lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id: players[index]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const post = (player: number, url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[player]! }, payload });
  const get = (player: number, url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[player]! } });
  const row = (player: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[player]! } });
  const trip = () => app.prisma.bossTrip.findFirstOrThrow({ where: { roundPlayerId: players[0]! }, orderBy: { departedAt: 'desc' } });
  const fly = (payload: Record<string, unknown> = {}) =>
    post(0, '/travel/trip', { to: 'las-vegas', stayMinutes: 360, bankrollCents: 5_000_000, actionId: randomUUID(), ...payload });
  const land = async () => {
    const current = await trip();
    const flight = current.arrivesAt.getTime() - current.departedAt.getTime();
    const stay = current.stayUntil.getTime() - current.arrivesAt.getTime();
    const arrivesAt = new Date(Date.now() - 5 * minute);
    await app.prisma.bossTrip.update({ where: { id: current.id }, data: {
      departedAt: new Date(arrivesAt.getTime() - flight), arrivesAt,
      stayUntil: new Date(arrivesAt.getTime() + stay), returnsAt: new Date(arrivesAt.getTime() + stay + flight),
    } });
  };
  const spot = async (): Promise<string> => {
    for (let attempt = 0; attempt < 30; attempt++) {
      expect((await post(1, '/convoys/recon', { actionId: randomUUID() })).statusCode).toBe(200);
      const found = (await get(1, '/convoys')).json<ConvoysDto>().bosses[0]?.tripId;
      if (found) return found;
    }
    throw new Error('Thirty recons never spotted the boss.');
  };

  it('grounds a very hot boss, and robs and delays a hot one it pulls aside', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { heat: trips.airport.noFlyHeat } });
    expect((await fly()).json().error.code).toBe('NO_FLY');

    const heat = trips.airport.noFlyHeat - 1;
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { heat } });
    // Find an action id whose roll pulls the boss aside, the way the server rolls it.
    let actionId = '';
    while (!actionId) {
      const candidate = randomUUID();
      if (rollAirport(trips.airport, { heat, bankrollCents: 5_000_000n, rng: seededRng(hashParts(candidate, 'airport')) }).pulled) actionId = candidate;
    }
    const sent = await fly({ actionId });
    expect(sent.statusCode, sent.body).toBe(200);
    const result = sent.json<GameActionResult<TripLaunchResult>>().result;
    expect(result.airport).toEqual({ seizedCents: 5_000_000 * trips.airport.seizePercent / 100, delayMinutes: trips.airport.delayMinutes });
    const pulled = await trip();
    expect(pulled.bankrollCents).toBe(5_000_000n - BigInt(result.airport!.seizedCents));
    expect(pulled.arrivesAt.getTime() - pulled.departedAt.getTime()).toBe((trips.flightMinutes + trips.airport.delayMinutes) * minute);
    expect((await get(0, '/travel')).json<TravelDto>().trips?.trip).toMatchObject({ airportSeizedCents: result.airport!.seizedCents, airportDelayMinutes: trips.airport.delayMinutes });
  });

  it('counts bodyguards at security: a crew gets a boss pulled aside when the boss alone would not be', async () => {
    const heat = trips.airport.checkFromHeat;
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { heat } });
    // Alone at this Heat the chance is nothing; five bodyguards make it real.
    let actionId = '';
    while (!actionId) {
      const candidate = randomUUID();
      const rng = () => seededRng(hashParts(candidate, 'airport'));
      if (rollAirport(trips.airport, { heat, bodyguards: 5, bankrollCents: 5_000_000n, rng: rng() }).pulled) actionId = candidate;
    }
    expect(rollAirport(trips.airport, { heat, bankrollCents: 5_000_000n, rng: seededRng(hashParts(actionId, 'airport')) }).pulled).toBe(false);
    const sent = await fly({ actionId, bodyguards: 5 });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json<GameActionResult<TripLaunchResult>>().result.airport).toBeDefined();
  });

  it('checks the flight home once, as the boss leaves town', async () => {
    const heat = trips.airport.noFlyHeat - 1;
    // Keep flying until security pulls the boss aside on the way home, the way the server rolls it.
    let expected = { pulled: false, seizedCents: 0n, delayMinutes: 0 };
    for (let attempt = 0; attempt < 20 && !expected.pulled; attempt++) {
      await app.prisma.bossTrip.deleteMany({ where: { roundPlayerId: players[0]! } });
      await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { heat: 0, cashCents: 80_000_000n, turns: 144, awayNetWorthCents: 0n } });
      expect((await fly()).statusCode).toBe(200);
      await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { heat } });
      const out = await trip();
      expected = rollAirport(trips.airport, { heat, bankrollCents: out.bankrollCents, rng: seededRng(hashParts(out.id, 'airport-home')) });
    }
    expect(expected.pulled).toBe(true);
    const out = await trip();
    // Checked out a minute ago; the flight home would have landed long since.
    const checkedOut = new Date(Date.now() - minute);
    const flight = out.arrivesAt.getTime() - out.departedAt.getTime();
    await app.prisma.bossTrip.update({ where: { id: out.id }, data: {
      departedAt: new Date(checkedOut.getTime() - 60 * minute - flight), arrivesAt: new Date(checkedOut.getTime() - 60 * minute),
      stayUntil: checkedOut, returnsAt: new Date(checkedOut.getTime() + trips.flightMinutes * minute),
    } });
    await get(0, '/travel');
    const checked = await trip();
    expect(checked.airportHomeCheckedAt).toEqual(checkedOut);
    expect(checked.bankrollCents).toBe(out.bankrollCents - expected.seizedCents);
    expect(checked.returnsAt.getTime()).toBe(checkedOut.getTime() + (trips.flightMinutes + trips.airport.delayMinutes) * minute);
    // Reading again does not roll again.
    await get(0, '/travel');
    expect((await trip()).bankrollCents).toBe(checked.bankrollCents);
    expect((await trip()).returnsAt).toEqual(checked.returnsAt);
  });

  it('lets allies who live there answer the boss\'s call and hold off the hit', async () => {
    expect((await fly()).statusCode).toBe(200);
    await land();
    const tripId = await spot();
    expect((await post(1, '/convoys/boss-hit', { tripId, squad: 3, actionId: randomUUID() })).statusCode).toBe(200);
    // Close enough for the boss's lookouts to see it coming.
    await app.prisma.bossHit.updateMany({ where: { tripId, status: 'PENDING' }, data: { landsAt: new Date(Date.now() + 2 * minute) } });
    const seen = (await get(0, '/convoys')).json<ConvoysDto>().bossHits.find((hit) => hit.role === 'owner')!;
    expect(seen).toMatchObject({ canCallAllies: true, alliesCalled: false });
    expect((await post(2, '/convoys/boss-hit/backup', { hitId: seen.id, thugs: 30, actionId: randomUUID() })).json().error.code).toBe('CANNOT_SEND');
    const called = await post(0, '/convoys/boss-hit/call', { hitId: seen.id });
    expect(called.statusCode, called.body).toBe(200);
    expect(called.json()).toEqual({ called: 1 });
    const allyView = (await get(2, '/convoys')).json<ConvoysDto>().bossHits.find((hit) => hit.id === seen.id)!;
    expect(allyView).toMatchObject({ role: 'ally', answer: { reason: null } });
    const sent = await post(2, '/convoys/boss-hit/backup', { hitId: seen.id, thugs: 30, actionId: randomUUID() });
    expect(sent.statusCode, sent.body).toBe(200);
    expect((await row(2)).busyThugs).toBe(30);

    const before = await trip();
    await app.prisma.bossHit.updateMany({ where: { id: seen.id }, data: { landsAt: new Date(Date.now() - 1_000) } });
    await get(0, '/travel');
    const landed = await app.prisma.bossHit.findUniqueOrThrow({ where: { id: seen.id } });
    expect((landed.result as { held: boolean; allies: number }).held).toBe(true);
    expect((landed.result as { allies: number }).allies).toBe(30);
    expect((await trip()).bankrollCents).toBe(before.bankrollCents);
    expect((await row(0)).laidUpUntil).toBeNull();
    // The ally's thugs come home at their next read.
    await get(2, '/travel');
    expect((await row(2)).busyThugs).toBe(0);
  });

  it('walks an outpost: the crew stays put and the boss carries the box cash', async () => {
    const turf = await app.prisma.turf.create({ data: {
      roundId, cityId: cityIds['las-vegas']!, district: 'CASINO', holderId: players[0]!, cornerThugs: 10, cornerPistols: 10, heldSince: new Date(),
      localsThugs: 0, upkeepAt: new Date(),
    } });
    const box = await app.prisma.turfOutpost.create({ data: { turfId: turf.id, ownerId: players[0]!, cashCents: 3_000_000n } });
    const boxWorth = outpostBoxWorthCents(rules, { cashCents: 3_000_000n, beer: 0, products: {} });
    const pistolWorth = BigInt(rules.economy.netWorth.perPistolCents);
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { postedThugs: 10, postedNetWorthCents: 10n * pistolWorth, outpostNetWorthCents: boxWorth } });

    expect((await post(0, '/travel/trip/outpost', { outpostId: box.id, actionId: randomUUID() })).json().error.code).toBe('NOT_IN_TOWN');
    expect((await fly()).statusCode).toBe(200);
    await land();
    const page = (await get(0, '/travel')).json<TravelDto>();
    expect(page.trips?.outpostsHere).toEqual([expect.objectContaining({ id: box.id, cashCents: 3_000_000, canCollect: true })]);

    const visited = await post(0, '/travel/trip/outpost', { outpostId: box.id, collectCents: 3_000_000, actionId: randomUUID() });
    expect(visited.statusCode, visited.body).toBe(200);
    expect(visited.json<GameActionResult<TripOutpostVisitResult>>().result.collectedCents).toBe(3_000_000);
    expect((await trip()).bankrollCents).toBe(5_000_000n + 3_000_000n);
    const after = await app.prisma.turfOutpost.findUniqueOrThrow({ where: { id: box.id } });
    expect(after.cashCents).toBe(0n);
    expect(after.moraleUntil!.getTime()).toBeGreaterThan(Date.now() + (trips.outpostVisits.moraleHours - 1) * 60 * minute);
    expect((await row(0)).outpostNetWorthCents).toBe(0n);

    // Five hours with empty boxes. The corner the boss walked keeps its crew; one it did
    // not walk, held the same way, loses some.
    const control = await app.prisma.turf.upsert({
      where: { roundId_cityId_district: { roundId, cityId: cityIds['las-vegas']!, district: 'NIGHTCLUB' } },
      create: { roundId, cityId: cityIds['las-vegas']!, district: 'NIGHTCLUB', holderId: players[0]!, cornerThugs: 10, cornerPistols: 10, heldSince: new Date(), localsThugs: 0, upkeepAt: new Date() },
      update: { holderId: players[0]!, cornerThugs: 10, cornerPistols: 10, heldSince: new Date(), localsThugs: 0, upkeepAt: new Date() },
    });
    await app.prisma.turfOutpost.create({ data: { turfId: control.id, ownerId: players[0]! } });
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { postedThugs: 20, postedNetWorthCents: 20n * pistolWorth } });
    await app.prisma.turf.updateMany({ where: { id: { in: [turf.id, control.id] } }, data: { upkeepAt: new Date(Date.now() - 5 * 60 * minute) } });
    await app.prisma.turfOutpost.update({ where: { id: box.id }, data: { visitedAt: new Date(Date.now() - 6 * 60 * minute) } });
    const worked = await post(0, '/scout', { district: 'WINO_SLUMS', turns: 1, actionId: randomUUID() });
    expect(worked.statusCode, worked.body).toBe(200);
    expect((await app.prisma.turf.findUniqueOrThrow({ where: { id: control.id } })).cornerThugs).toBeLessThan(10);
    expect((await app.prisma.turf.findUniqueOrThrow({ where: { id: turf.id } })).cornerThugs).toBe(10);
  });

  it('lets two bosses in one city sit down, and then neither can hit the other', async () => {
    // Two locals, neither visiting, cannot.
    expect((await post(2, '/travel/sit-down', { targetPublicPimpId: pimps[1] })).json().error.code).toBe('CANNOT_SIT_DOWN');
    expect((await fly()).statusCode).toBe(200);
    // In the air is not in town.
    expect((await post(0, '/travel/sit-down', { targetPublicPimpId: pimps[1] })).json().error.code).toBe('CANNOT_SIT_DOWN');
    await land();
    const candidates = (await get(0, '/travel')).json<TravelDto>().trips?.sitDowns?.candidates ?? [];
    expect(candidates.map((entry) => entry.publicPimpId)).toContain(pimps[1]);
    // An ally is not a candidate: allies cannot hit each other anyway.
    expect(candidates.map((entry) => entry.publicPimpId)).not.toContain(pimps[2]);

    const asked = await post(0, '/travel/sit-down', { targetPublicPimpId: pimps[1] });
    expect(asked.statusCode, asked.body).toBe(200);
    const incoming = (await get(1, '/travel')).json<TravelDto>().trips?.sitDowns?.incoming ?? [];
    expect(incoming).toHaveLength(1);
    const agreed = await post(1, '/travel/sit-down/answer', { sitDownId: incoming[0]!.id, accept: true });
    expect(agreed.statusCode, agreed.body).toBe(200);
    expect(agreed.json().status).toBe('AGREED');

    const tripId = await spot();
    // The visiting boss shows as blocked in the hunter's list, and the hit is refused.
    const listed = (await get(1, '/convoys')).json<ConvoysDto>().bosses.find((target) => target.tripId === tripId)!;
    expect(listed.blockedReason).toMatch(/sat down/);
    expect((await post(1, '/convoys/boss-hit', { tripId, squad: 3, actionId: randomUUID() })).json().error.code).toBe('TRUCE');
  });

  it('shows a truced crew as blocked on the combat page', async () => {
    const now = new Date();
    await app.prisma.sitDown.create({ data: {
      roundId, city: 'las-vegas', proposerId: players[1]!, inviteeId: players[2]!, status: 'AGREED',
      proposedAt: now, expiresAt: now, answeredAt: now, truceUntil: new Date(now.getTime() + 60 * minute),
    } });
    const page = (await get(1, '/combat')).json<CombatPageDto>();
    const ally = page.targets.find((target) => target.publicPimpId === pimps[2]);
    expect(ally?.blockedReason).toMatch(/sat down/);
    expect((await post(1, '/combat/raid', { roundId, targetPublicPimpId: pimps[2], attackingThugs: 5, actionId: randomUUID() })).json().error.code).toBe('TRUCE');
  });
});
