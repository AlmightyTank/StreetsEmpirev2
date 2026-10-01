import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgTripsD } from '@streets/rulesets';
import { gunRentCents, hotelCents, lodgingCents, startingStock, tripNetWorthCents } from '@streets/rules-engine';
import type { ConvoysDto, GameActionResult, TravelDto, TripLaunchResult } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Trips D gate, live: bodyguards fly out of home stock on their own tickets and lodging and
 * come home with the boss; guns are rented only through Tommy's out-of-town connect, in
 * town, one per bodyguard, out of the bankroll, and never become yours; bodyguards fight a
 * hit on the boss; and the in-person jobs complete only from a real trip, with Tommy's job
 * opening the connect. Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('boss bodyguards with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const cityIds: Record<string, string> = {};
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgTripsD;
  const trips = rules.travel.trips;
  const guards = trips.bodyguards;
  const minute = 60_000;
  /** 0 flies, 1 lives in Las Vegas and hunts. */
  const homes = ['new-york-city', 'las-vegas'];

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const city of await app.prisma.city.findMany({ select: { id: true, slug: true } })) cityIds[city.slug] = city.id;
    const round = await app.prisma.round.create({ data: {
      name: 'Bodyguard fixture', slug: `bodyguards-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (let index = 0; index < homes.length; index++) {
      const name = `guard_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[index]!, cityId: cityIds[homes[index]!]!, displayName: name, publicPimpId: 8000 + index,
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
    await app.prisma.convoyRecon.deleteMany({ where: mine });
    await app.prisma.combatInjury.deleteMany({ where: mine });
    await app.prisma.playerUnlock.deleteMany({ where: mine });
    await app.prisma.playerQuest.deleteMany({ where: mine });
    await app.prisma.processedAction.deleteMany({ where: mine });
    await app.prisma.playerActivity.deleteMany({ where: mine });
    for (let index = 0; index < players.length; index++) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 120, thugs: 40, woundedThugs: 0, busyThugs: 0, pistols: 40, beer: 500, condoms: 5_000, crack: 900, lowRiders: 2,
        turns: 144, cashCents: 80_000_000n, heat: 0, awayNetWorthCents: 0n, lockedUntil: null, movingUntil: null, laidUpUntil: null,
        shotgunUnlocked: false, tek9Unlocked: false, ak47Unlocked: false,
        cityId: cityIds[homes[index]!]!, createdAt: new Date(Date.now() - 2 * 86_400_000),
        lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id: players[index]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const post = (player: number, url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[player]! }, payload });
  const get = (player: number, url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[player]! } });
  const row = (player: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[player]! } });
  const trip = () => app.prisma.bossTrip.findFirstOrThrow({ where: { roundPlayerId: players[0]! }, orderBy: { departedAt: 'desc' } });
  const fly = (payload: Partial<{ to: string; bodyguards: number; bankrollCents: number }> = {}) =>
    post(0, '/travel/trip', { to: 'las-vegas', stayMinutes: 120, bankrollCents: 5_000_000, actionId: randomUUID(), ...payload });
  const rent = (guns: Record<string, number>) => post(0, '/travel/trip/guns', { guns, actionId: randomUUID() });
  const connect = () => app.prisma.playerUnlock.create({ data: { roundPlayerId: players[0]!, key: guards.gunConnectUnlockKey, sourceQuestKey: 'TEST' } });
  /** Put the boss in town, landed a few minutes ago. */
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
  /** Shift the whole trip into the past so the boss is due home. */
  const comeHome = async () => {
    const current = await trip();
    const shift = current.returnsAt.getTime() - Date.now() + minute;
    const back = (at: Date) => new Date(at.getTime() - shift);
    await app.prisma.bossTrip.update({ where: { id: current.id }, data: {
      departedAt: back(current.departedAt), arrivesAt: back(current.arrivesAt), stayUntil: back(current.stayUntil), returnsAt: back(current.returnsAt),
      ...(current.lastHitAt ? { lastHitAt: back(current.lastHitAt) } : {}),
    } });
    await get(0, '/travel');
  };
  /** Recon Las Vegas until the boss shows up, then send a squad and let it land. */
  const hitBoss = async (squad: number) => {
    let tripId = '';
    for (let attempt = 0; attempt < 30 && !tripId; attempt++) {
      expect((await post(1, '/convoys/recon', { actionId: randomUUID() })).statusCode).toBe(200);
      tripId = (await get(1, '/convoys')).json<ConvoysDto>().bosses[0]?.tripId ?? '';
    }
    expect(tripId).not.toBe('');
    const sent = await post(1, '/convoys/boss-hit', { tripId, squad, actionId: randomUUID() });
    expect(sent.statusCode, sent.body).toBe(200);
    await app.prisma.bossHit.updateMany({ where: { tripId, status: 'PENDING' }, data: { landsAt: new Date(Date.now() - 1_000) } });
    await get(0, '/travel');
    return app.prisma.bossHit.findFirstOrThrow({ where: { tripId }, orderBy: { startedAt: 'desc' } });
  };

  it('flies bodyguards out of home on their own tickets and lodging, and brings them home', async () => {
    const before = await row(0);
    const sent = await fly({ bodyguards: 4 });
    expect(sent.statusCode, sent.body).toBe(200);
    const result = sent.json<GameActionResult<TripLaunchResult>>().result;
    expect(result.bodyguards).toBe(4);
    expect(BigInt(result.ticketCents)).toBe(BigInt(trips.ticketCents + 4 * guards.ticketCents));
    expect(BigInt(result.hotelCents)).toBe(hotelCents(trips, 'las-vegas', 120) + lodgingCents(trips, 4, 120));
    const away = await row(0);
    expect(away.thugs).toBe(before.thugs - 4);
    expect(away.pistols).toBe(before.pistols);
    expect(away.awayNetWorthCents).toBe(tripNetWorthCents(rules, 5_000_000n, 4));
    expect((await fly({ bodyguards: guards.max + 1 })).json().error.code).toBe('TRIP_OUT');

    await comeHome();
    const home = await row(0);
    expect(home.thugs).toBe(before.thugs);
    expect(home.awayNetWorthCents).toBe(0n);
  });

  it('rents guns only with the connect, in town, one per bodyguard, from the bankroll', async () => {
    expect((await fly({ bodyguards: 3 })).statusCode).toBe(200);
    await land();
    expect((await rent({ PISTOL: 1 })).json().error.code).toBe('RENT_BLOCKED');
    await connect();
    const page = (await get(0, '/travel')).json<TravelDto>();
    expect(page.trips?.gunConnect).toEqual({ unlocked: true, weapons: ['PISTOL'] });
    expect(page.trips?.trip?.rentBlockedReason).toBeNull();
    expect((await rent({ SHOTGUN: 1 })).json().error.code).toBe('NO_WEAPON_ACCESS');
    expect((await rent({ PISTOL: 4 })).json().error.code).toBe('TOO_MANY_GUNS');

    const before = await trip();
    const cashBefore = (await row(0)).cashCents;
    const sent = await rent({ PISTOL: 3 });
    expect(sent.statusCode, sent.body).toBe(200);
    const after = await trip();
    const cost = gunRentCents(guards, { PISTOL: 3 });
    expect(after.bankrollCents).toBe(before.bankrollCents - cost);
    expect(after.gunRentCents).toBe(cost);
    expect(after.rentedGuns).toMatchObject({ PISTOL: 3 });
    expect((await row(0)).cashCents).toBe(cashBefore);
    expect((await rent({ PISTOL: 1 })).json().error.code).toBe('RENT_BLOCKED');

    // Handed back at check-out: none of it comes home.
    const pistols = (await row(0)).pistols;
    await comeHome();
    expect((await row(0)).pistols).toBe(pistols);
  });

  it('lets armed bodyguards hold off a small squad: no loot, no lay-up', async () => {
    await connect();
    expect((await fly({ bodyguards: guards.max })).statusCode).toBe(200);
    await land();
    expect((await rent({ PISTOL: guards.max })).statusCode).toBe(200);
    const before = await trip();
    const landed = await hitBoss(1);
    const outcome = landed.result as { held: boolean; cashCents: string };
    expect(outcome.held).toBe(true);
    expect(outcome.cashCents).toBe('0');
    expect((await trip()).bankrollCents).toBe(before.bankrollCents);
    expect((await row(0)).laidUpUntil).toBeNull();
    expect((await trip()).status).toBe('ACTIVE');
  });

  it('lets a big squad through a lone bodyguard, and the boss is robbed and laid up', async () => {
    expect((await fly({ bodyguards: 1 })).statusCode).toBe(200);
    await land();
    const landed = await hitBoss(40);
    const outcome = landed.result as { held: boolean; cashCents: string; laidUpUntil: string | null };
    expect(outcome.held).toBe(false);
    expect(BigInt(outcome.cashCents)).toBeGreaterThan(0n);
    expect((await row(0)).laidUpUntil).not.toBeNull();
  });

  it('completes in-person jobs only from real trips, and Tommy\'s job opens the connect', async () => {
    const accept = async (key: string) => {
      const response = await post(0, `/quests/${key}/accept`, { actionId: randomUUID() });
      expect(response.statusCode, response.body).toBe(200);
    };
    const status = async (key: string) => (await app.prisma.playerQuest.findFirst({
      where: { roundPlayerId: players[0]!, questDefinition: { key } }, orderBy: { attempt: 'desc' },
    }))?.status;
    const claim = async (key: string) => {
      const response = await post(0, `/quests/${key}/claim`, { actionId: randomUUID() });
      expect(response.statusCode, response.body).toBe(200);
    };

    expect((await get(0, '/quests')).statusCode).toBe(200);
    await accept('VIC_FACE_TO_FACE');
    // Work at home does nothing for it.
    expect((await post(0, '/scout', { district: 'WINO_SLUMS', turns: 2, actionId: randomUUID() })).statusCode).toBe(200);
    expect(await status('VIC_FACE_TO_FACE')).toBe('ACTIVE');
    expect((await fly()).statusCode).toBe(200);
    await comeHome();
    expect(await status('VIC_FACE_TO_FACE')).toBe('READY_TO_TURN_IN');
    await claim('VIC_FACE_TO_FACE');

    await accept('TOMMY_OUT_OF_TOWN_IRON');
    expect((await fly({ to: 'las-vegas' })).statusCode).toBe(200);
    await comeHome();
    expect(await status('TOMMY_OUT_OF_TOWN_IRON')).toBe('ACTIVE');
    expect((await fly({ to: 'detroit' })).statusCode).toBe(200);
    await comeHome();
    expect(await status('TOMMY_OUT_OF_TOWN_IRON')).toBe('READY_TO_TURN_IN');
    await claim('TOMMY_OUT_OF_TOWN_IRON');
    expect(await app.prisma.playerUnlock.count({ where: { roundPlayerId: players[0]!, key: guards.gunConnectUnlockKey } })).toBe(1);
  });
});
