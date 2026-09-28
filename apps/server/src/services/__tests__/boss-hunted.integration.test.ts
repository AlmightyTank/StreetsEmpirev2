import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgTripsC } from '@streets/rulesets';
import { rideAlongHourCents, startingStock } from '@streets/rules-engine';
import type { BattleReportDto, ConvoysDto, GameActionResult, ScoutResult, TravelDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Trips C gate, live: a local's area recon can spot a boss visiting their city; a hit
 * that lands while the boss is in town takes part of the bankroll, ends the stay, flies
 * the boss home and lays them up; a boss who checks out first gets away; the attacker's
 * squad and haul come home at their next read; a laid-up boss cannot travel and the
 * lieutenant keeps skimming; and home defends raids weaker while the boss is away. Money
 * is conserved end to end. Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('hunted bosses with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const cityIds: Record<string, string> = {};
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const pimps: number[] = [];
  const rules = classicOgTripsC;
  const hunted = rules.travel.trips.hunted;
  const minute = 60_000;
  /** 0 flies to Vegas, 1 lives in Vegas and hunts, 2 lives in New York and raids. */
  const homes = ['new-york-city', 'las-vegas', 'new-york-city'];

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const city of await app.prisma.city.findMany({ select: { id: true, slug: true } })) cityIds[city.slug] = city.id;
    const round = await app.prisma.round.create({ data: {
      name: 'Hunted fixture', slug: `hunted-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (let index = 0; index < homes.length; index++) {
      const name = `hunt_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
      pimps.push(7900 + index);
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[index]!, cityId: cityIds[homes[index]!]!, displayName: name, publicPimpId: pimps[index]!,
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
    const mine = { roundPlayerId: { in: players } };
    await app.prisma.bossHit.deleteMany({ where: { OR: [{ attackerId: { in: players } }, { ownerId: { in: players } }] } });
    await app.prisma.bossTrip.deleteMany({ where: mine });
    await app.prisma.convoyTail.deleteMany({ where: { OR: [{ attackerId: { in: players } }, { ownerId: { in: players } }] } });
    await app.prisma.run.deleteMany({ where: mine });
    await app.prisma.convoyRecon.deleteMany({ where: mine });
    await app.prisma.raidBattle.deleteMany({ where: { OR: [{ attackerId: { in: players } }, { defenderId: { in: players } }] } });
    await app.prisma.combatInjury.deleteMany({ where: mine });
    await app.prisma.combatIntel.deleteMany({ where: { OR: [{ observerId: { in: players } }, { targetId: { in: players } }] } });
    await app.prisma.playerProduct.deleteMany({ where: mine });
    await app.prisma.processedAction.deleteMany({ where: mine });
    await app.prisma.playerActivity.deleteMany({ where: mine });
    await app.prisma.economyLedgerEntry.deleteMany({ where: mine });
    for (let index = 0; index < players.length; index++) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 120, thugs: 40, woundedThugs: 0, busyThugs: 0, pistols: 40, beer: 500, condoms: 5_000, crack: 900, lowRiders: 2,
        turns: 144, cashCents: 80_000_000n, heat: 0, awayNetWorthCents: 0n, lockedUntil: null, movingUntil: null, laidUpUntil: null,
        cityId: cityIds[homes[index]!]!, createdAt: new Date(Date.now() - 2 * 86_400_000),
        raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null,
        lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id: players[index]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const post = (player: number, url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[player]! }, payload });
  const get = (player: number, url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[player]! } });
  const row = (player: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[player]! } });
  const trip = () => app.prisma.bossTrip.findFirstOrThrow({ where: { roundPlayerId: players[0]! }, orderBy: { departedAt: 'desc' } });
  const fly = (bankrollCents = 10_000_000) => post(0, '/travel/trip', { to: 'las-vegas', stayMinutes: 360, bankrollCents, actionId: randomUUID() });
  /** Put the boss in town, landed `minutesInTown` ago. */
  const land = async (minutesInTown = 5) => {
    const current = await trip();
    const flight = current.arrivesAt.getTime() - current.departedAt.getTime();
    const stay = current.stayUntil.getTime() - current.arrivesAt.getTime();
    const arrivesAt = new Date(Date.now() - minutesInTown * minute);
    await app.prisma.bossTrip.update({ where: { id: current.id }, data: {
      departedAt: new Date(arrivesAt.getTime() - flight), arrivesAt,
      stayUntil: new Date(arrivesAt.getTime() + stay), returnsAt: new Date(arrivesAt.getTime() + stay + flight),
    } });
  };
  /** Recon Las Vegas until the low-profile boss shows up. Each recon rolls afresh. */
  const spot = async (): Promise<ConvoysDto> => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const recon = await post(1, '/convoys/recon', { actionId: randomUUID() });
      expect(recon.statusCode, recon.body).toBe(200);
      const page = (await get(1, '/convoys')).json<ConvoysDto>();
      if (page.bosses.length) return page;
    }
    throw new Error('Thirty recons never spotted the boss.');
  };
  const hit = (tripId: string, squad = 5) => post(1, '/convoys/boss-hit', { tripId, squad, actionId: randomUUID() });
  /** Let the pending hit's window close. */
  const due = () => app.prisma.bossHit.updateMany({ where: { status: 'PENDING' }, data: { landsAt: new Date(Date.now() - 1_000) } });
  const scout = async (player: number) => (await post(player, '/scout', { district: 'WINO_SLUMS', turns: 2, actionId: randomUUID() })).json<GameActionResult<ScoutResult>>().result;

  it('spots, robs and lays up a boss in town, and brings the squad and the haul home', async () => {
    expect((await fly()).statusCode).toBe(200);
    await land();
    const page = await spot();
    expect(page.bosses[0]).toMatchObject({ city: 'las-vegas', inTownNow: true, alone: true, bankroll: 'heavy', blockedReason: null });
    const tripId = page.bosses[0]!.tripId;

    const attackerBefore = await row(1);
    const started = await hit(tripId);
    expect(started.statusCode, started.body).toBe(200);
    expect((await row(1)).busyThugs).toBe(5);
    expect((await hit(tripId)).json().error.code).toMatch(/ALREADY_HIT|SQUAD_OUT/);

    const ownerAway = await row(0);
    const before = await trip();
    await due();
    // The attacker's own read lands it, in the boss's transaction.
    const after = (await get(1, '/convoys')).json<ConvoysDto>();
    const landed = await app.prisma.bossHit.findFirstOrThrow({ where: { tripId: before.id } });
    expect(landed.status).toBe('LANDED');
    const taken = BigInt((landed.result as { cashCents: string }).cashCents);
    expect(taken).toBeGreaterThan(0n);
    expect(taken).toBeLessThanOrEqual(before.bankrollCents * BigInt(hunted.bankrollPercent.max) / 100n);

    const robbed = await trip();
    expect(robbed.bankrollCents).toBe(before.bankrollCents - taken);
    expect(robbed.stayUntil).toEqual(landed.landsAt);
    expect(robbed.returnsAt.getTime() - robbed.stayUntil.getTime()).toBe(rules.travel.trips.flightMinutes * minute);
    const owner = await row(0);
    expect(owner.laidUpUntil!.getTime()).toBe(landed.landsAt.getTime() + hunted.layUpMinutes * minute);
    expect(owner.awayNetWorthCents).toBeLessThan(ownerAway.awayNetWorthCents);

    // The squad and the haul reach the attacker at their next read.
    await get(1, '/travel');
    const attacker = await row(1);
    expect(attacker.busyThugs).toBe(0);
    expect(attacker.cashCents).toBe(attackerBefore.cashCents + taken);
    expect(after.bossHits.some((entry) => entry.role === 'attacker')).toBe(true);
    const ownerHits = (await get(0, '/convoys')).json<ConvoysDto>().bossHits;
    expect(ownerHits[0]).toMatchObject({ role: 'owner', status: 'LANDED', report: { escaped: false, cashCents: -Number(taken) } });
  });

  it('keeps a laid-up boss home, still skimmed, and lets them travel once healed', async () => {
    expect((await fly()).statusCode).toBe(200);
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { laidUpUntil: new Date(Date.now() + 60 * minute) } });
    // Home after the trip: the boss is back, but still laid up.
    const current = await trip();
    await app.prisma.bossTrip.update({ where: { id: current.id }, data: {
      departedAt: new Date(Date.now() - 500 * minute), arrivesAt: new Date(Date.now() - 455 * minute),
      stayUntil: new Date(Date.now() - 95 * minute), returnsAt: new Date(Date.now() - 50 * minute),
    } });
    const page = (await get(0, '/travel')).json<TravelDto>();
    expect(page.trips?.trip).toBeNull();
    expect(page.trips?.blockedCode).toBe('LAID_UP');
    expect(page.trips?.laidUpUntil).not.toBeNull();
    expect((await fly()).json().error.code).toBe('LAID_UP');
    expect((await scout(0)).lieutenantCutCents).toBeGreaterThan(0);

    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { laidUpUntil: new Date(Date.now() - minute) } });
    expect((await scout(0)).lieutenantCutCents).toBeUndefined();
    expect((await fly()).statusCode).toBe(200);
  });

  it('lets a boss who checks out first get away, and the squad comes home empty-handed', async () => {
    expect((await fly()).statusCode).toBe(200);
    await land();
    const tripId = (await spot()).bosses[0]!.tripId;
    const attackerBefore = await row(1);
    expect((await hit(tripId)).statusCode).toBe(200);
    expect((await post(0, '/travel/trip/home', { actionId: randomUUID() })).statusCode).toBe(200);
    // Checked out a couple of minutes before the window closes.
    const out = await trip();
    const checkedOut = new Date(Date.now() - 2 * minute);
    await app.prisma.bossTrip.update({ where: { id: out.id }, data: { stayUntil: checkedOut, returnsAt: new Date(checkedOut.getTime() + rules.travel.trips.flightMinutes * minute) } });
    const ownerBefore = await trip();
    await due();
    await get(0, '/travel');
    const escaped = await app.prisma.bossHit.findFirstOrThrow({ where: { tripId: ownerBefore.id } });
    expect(escaped.status).toBe('ESCAPED');
    expect((await trip()).bankrollCents).toBe(ownerBefore.bankrollCents);
    expect((await row(0)).laidUpUntil).toBeNull();
    await get(1, '/travel');
    const attacker = await row(1);
    expect(attacker.busyThugs).toBe(0);
    expect(attacker.cashCents).toBe(attackerBefore.cashCents);
  });

  it('refuses a hit it cannot see or reach', async () => {
    expect((await fly()).statusCode).toBe(200);
    const tripId = (await trip()).id;
    // Not spotted yet.
    expect((await post(1, '/convoys/boss-hit', { tripId, squad: 5, actionId: randomUUID() })).json().error.code).toBe('NOT_SPOTTED');
    // A New York crew cannot reach a boss in Las Vegas.
    expect((await post(2, '/convoys/boss-hit', { tripId, squad: 5, actionId: randomUUID() })).json().error.code).toBe('OUT_OF_REACH');
    // Your own boss is not a target.
    expect((await post(0, '/convoys/boss-hit', { tripId, squad: 5, actionId: randomUUID() })).json().error.code).toBe('OWN_TRIP');
  });

  it('lays the boss up and sends the run home when a convoy hit beats a run the boss is riding', async () => {
    const launched = await post(0, '/travel/launch', { to: 'las-vegas', route: 0, lowRiders: 1, escortThugs: 0, cashCents: 1_000_000, cargo: {}, rideAlong: true, actionId: randomUUID() });
    expect(launched.statusCode, launched.body).toBe(200);
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: players[0]! }, include: { stops: { orderBy: { order: 'asc' } } } });
    // Police stops are another suite's business; put the run in Las Vegas five minutes ago.
    const shift = run.stops[0]!.arriveAt.getTime() - (Date.now() - 5 * minute);
    await app.prisma.run.update({ where: { id: run.id }, data: { roadChecks: 99 } });
    for (const stop of run.stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: {
        departAt: new Date(stop.departAt.getTime() - shift), arriveAt: new Date(stop.arriveAt.getTime() - shift),
        leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - shift) : null,
      } });
    }
    expect((await post(1, '/convoys/recon', { actionId: randomUUID() })).statusCode).toBe(200);
    const tail = await post(1, '/convoys/tail', { runId: run.id, squad: 20, actionId: randomUUID() });
    expect(tail.statusCode, tail.body).toBe(200);
    await app.prisma.convoyTail.updateMany({ where: { runId: run.id, status: 'PENDING' }, data: { startedAt: new Date(Date.now() - 4 * minute), landsAt: new Date(Date.now() - 1_000) } });
    await get(0, '/travel');

    const landed = await app.prisma.convoyTail.findFirstOrThrow({ where: { runId: run.id } });
    expect((landed.result as { won: boolean }).won).toBe(true);
    const owner = await row(0);
    expect(owner.laidUpUntil!.getTime()).toBe(landed.landsAt.getTime() + hunted.layUpMinutes * minute);
    const after = await app.prisma.run.findFirstOrThrow({ where: { id: run.id }, include: { stops: { orderBy: { order: 'asc' } } } });
    expect(after.stops[0]!.leaveAt).toEqual(landed.landsAt);
  });

  it('refunds hotel hours billed after the hit that sent the boss home', async () => {
    const launched = await post(0, '/travel/launch', { to: 'las-vegas', route: 0, lowRiders: 1, escortThugs: 0, cashCents: 1_000_000, cargo: {}, rideAlong: true, actionId: randomUUID() });
    expect(launched.statusCode, launched.body).toBe(200);
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: players[0]! }, include: { stops: { orderBy: { order: 'asc' } } } });
    const shiftStops = async (minutesInTown: number) => {
      const current = await app.prisma.runStop.findMany({ where: { runId: run.id }, orderBy: { order: 'asc' } });
      const shift = current[0]!.arriveAt.getTime() - (Date.now() - minutesInTown * minute);
      for (const stop of current) {
        await app.prisma.runStop.update({ where: { id: stop.id }, data: {
          departAt: new Date(stop.departAt.getTime() - shift), arriveAt: new Date(stop.arriveAt.getTime() - shift),
          leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - shift) : null,
        } });
      }
      return new Date(Date.now() - minutesInTown * minute);
    };
    await app.prisma.run.update({ where: { id: run.id }, data: { roadChecks: 99 } });
    await shiftStops(5);
    expect((await post(1, '/convoys/recon', { actionId: randomUUID() })).statusCode).toBe(200);
    expect((await post(1, '/convoys/tail', { runId: run.id, squad: 20, actionId: randomUUID() })).statusCode).toBe(200);
    // Nobody reads the run for two and a half hours; the hit landed ten minutes into the stay.
    const arrived = await shiftStops(150);
    await app.prisma.convoyTail.updateMany({ where: { runId: run.id, status: 'PENDING' }, data: {
      startedAt: new Date(arrived.getTime() + 2 * minute), landsAt: new Date(arrived.getTime() + 10 * minute),
    } });
    await get(0, '/travel');
    const after = await app.prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    const hour = rideAlongHourCents(rules.travel.trips, 'las-vegas', 0);
    expect(after.hotelHours).toBe(1);
    expect(after.hotelCents).toBe(hour);
  });

  it('defends home weaker while the boss is away', async () => {
    const raid = () => post(2, '/combat/raid', { roundId, targetPublicPimpId: pimps[0], attackingThugs: 10, actionId: randomUUID() });
    const home = await raid();
    expect(home.statusCode, home.body).toBe(200);
    const atHome = await app.prisma.raidBattle.findFirstOrThrow({ where: { attackerId: players[2]!, defenderId: players[0]! }, orderBy: { createdAt: 'desc' } });
    expect((atHome.calculation as Record<string, unknown>).bossAwayMultiplier).toBeUndefined();

    await app.prisma.raidBattle.deleteMany({ where: { attackerId: players[2]! } });
    await app.prisma.roundPlayer.updateMany({ where: { id: { in: [players[0]!, players[2]!] } }, data: { raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null, turns: 144 } });
    expect((await fly()).statusCode).toBe(200);
    const away = await raid();
    expect(away.statusCode, away.body).toBe(200);
    expect(away.json<BattleReportDto>()).toBeTruthy();
    const whileAway = await app.prisma.raidBattle.findFirstOrThrow({ where: { attackerId: players[2]!, defenderId: players[0]! }, orderBy: { createdAt: 'desc' } });
    expect((whileAway.calculation as Record<string, unknown>).bossAwayMultiplier).toBe(hunted.awayDefenseMultiplier);
  });
});
