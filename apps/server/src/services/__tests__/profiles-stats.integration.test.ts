import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PublicPlayerProfileDto } from '@streets/shared';
import { classicOgV08H } from '@streets/rulesets';
import { RoundService } from '../round.service.js';
import { SeasonStatsService } from '../season-stats.service.js';

/**
 * 0.9.0-F. Seasonal stats are read back from real history rows, so this runs
 * the SQL against PostgreSQL: TURF / PROFILE integration style, opt-in.
 */
describe.runIf(process.env.PROFILE_INTEGRATION === '1')('0.9.0-F profiles, stats and titles with PostgreSQL', () => {
  const rules = classicOgV08H;
  let app: FastifyInstance;
  const roundIds: string[] = [];
  const accountIds: string[] = [];
  let liveRoundId = '';
  let cityId = '';
  let otherCityId = '';
  let alice = { id: '', cookie: '', playerId: '', pastPlayerId: '' };
  let bob = { id: '', cookie: '', playerId: '' };

  async function register() {
    const username = `pf_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, email: `${username}@example.invalid`, password: randomUUID() },
    });
    expect(response.statusCode, response.body).toBeLessThan(300);
    const id = response.json().account.id as string;
    accountIds.push(id);
    return { id, username, cookie: response.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
  }

  async function round(name: string, status: 'ACTIVE' | 'ENDED', endsAt: Date) {
    const created = await app.prisma.round.create({
      data: {
        name,
        slug: `pf-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status,
        startsAt: new Date(endsAt.getTime() - 28 * 86_400_000),
        endsAt,
      },
    });
    roundIds.push(created.id);
    return created;
  }

  async function player(roundId: string, accountId: string, publicPimpId: number, extra: Record<string, unknown> = {}) {
    return app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        roundId,
        accountId,
        cityId,
        displayName: `pf${publicPimpId}`,
        publicPimpId,
        ...extra,
      },
    });
  }

  async function profile(cookie: string, publicPimpId: number): Promise<PublicPlayerProfileDto> {
    const response = await app.inject({ method: 'GET', url: `/api/game/players/${publicPimpId}`, headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().player;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } })).id;
    otherCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } })).id;

    const a = await register();
    const b = await register();
    const now = Date.now();
    const past = await round('PF Past Season', 'ENDED', new Date(now - 10 * 86_400_000));
    const live = await round('PF Live Season', 'ACTIVE', new Date(now + 10 * 86_400_000));
    liveRoundId = live.id;

    const alicePast = await player(past.id, a.id, 7101, { nationalRank: 2, localRank: 1, netWorthCents: 9_000_000n });
    const alicePlayer = await player(live.id, a.id, 7201, { whores: 30, thugs: 20, peakCrew: 90 });
    const bobPlayer = await player(live.id, b.id, 7202, { whores: 5, thugs: 5 });
    alice = { id: a.id, cookie: a.cookie, playerId: alicePlayer.id, pastPlayerId: alicePast.id };
    bob = { id: b.id, cookie: b.cookie, playerId: bobPlayer.id };

    // Past season: ten runs home earns Road Warrior for good.
    for (let index = 0; index < 10; index += 1) {
      await app.prisma.run.create({
        data: {
          roundPlayerId: alicePast.id, status: 'RETURNED', homeCity: 'new-york-city', lowRiders: 1,
          escortThugs: 1, cashCents: 0n, startCashCents: 0n, turnsSpent: 5,
        },
      });
    }

    const liveAt = new Date(now - 3_600_000);
    // Street work, production, sales (single and checkout), convoy hit, claims.
    await app.prisma.playerActivity.createMany({
      data: [
        { roundPlayerId: alice.playerId, type: 'SCOUT', payload: { turns: 20, cashCents: 50_000, whores: 3, thugs: 2 }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'SCOUT', payload: { turns: 10, cashCents: 25_000, whores: 1, thugs: 0 }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'PRODUCE_CRACK', payload: { turns: 5, cashCents: 1_000, product: 40, crack: 40 }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'PRODUCE_CRACK', payload: { turns: 5, cashCents: 0, crack: 10 }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'STORE_SELL', payload: { product: 'CRACK', quantity: 25, totalCents: 300_000 }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'STORE_SELL', payload: { item: 'Condoms', quantity: 99, totalCents: 100 }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'STORE_BUY', payload: { totalCents: 900, lines: [
          { storeKey: 'PIP', direction: 'sell', quantity: 7, totalCents: 800 },
          { storeKey: 'PIP', direction: 'buy', quantity: 50, totalCents: 1_700 },
          { storeKey: 'CORNER', direction: 'sell', quantity: 9, totalCents: 10 },
        ] }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'CONVOY_ATTACK', payload: { won: true, cashCents: 4_000 }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'CONVOY_ATTACK', payload: { won: false, cashCents: 0 }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'TURF_CLAIM', payload: { won: true }, createdAt: liveAt },
        { roundPlayerId: alice.playerId, type: 'TURF_CLAIM', payload: { won: false }, createdAt: liveAt },
        // Another player's history never leaks in.
        { roundPlayerId: bob.playerId, type: 'SCOUT', payload: { turns: 999, cashCents: 999 }, createdAt: liveAt },
      ],
    });

    const battle = (attackerId: string, defenderId: string, kind: 'RAID' | 'DRIVE_BY', attackerWon: boolean, loot: number, voided = false) =>
      app.prisma.raidBattle.create({
        data: {
          kind, attackerId, defenderId, actionId: randomUUID(), attackingThugs: 5, modelVersion: 'test', calculation: {},
          attackerReport: { won: attackerWon, cashChangeCents: loot, opponentWounds: 3 },
          defenderReport: { won: !attackerWon, cashChangeCents: -loot, opponentWounds: 1 },
          ...(voided ? { voidedAt: new Date() } : {}),
        },
      });
    await battle(alice.playerId, bob.playerId, 'RAID', true, 20_000);
    await battle(alice.playerId, bob.playerId, 'RAID', true, 60_000);
    await battle(alice.playerId, bob.playerId, 'RAID', false, 0);
    await battle(alice.playerId, bob.playerId, 'DRIVE_BY', true, 0);
    await battle(bob.playerId, alice.playerId, 'RAID', false, 0);
    await battle(alice.playerId, bob.playerId, 'RAID', true, 9_999_999, true);

    // Turf: a captured push, a lost block, an hour and a half held, and a city taken for the alliance.
    const turf = await app.prisma.turf.create({ data: { roundId: liveRoundId, cityId: otherCityId, district: 'CASINO', localsThugs: 0 } });
    const push = (attackerId: string, defenderId: string, captured: boolean) => app.prisma.turfPush.create({
      data: {
        roundId: liveRoundId, turfId: turf.id, attackerId, defenderId, squad: 5, attackerCrew: {}, turnsSpent: 3,
        actionId: randomUUID(), startedAt: liveAt, landsAt: liveAt, status: 'LANDED', captured,
        settledAt: liveAt, attackerCreditedAt: liveAt, alertsCollectedAt: liveAt,
      },
    });
    await push(alice.playerId, bob.playerId, true);
    await push(alice.playerId, bob.playerId, false);
    await push(bob.playerId, alice.playerId, true);
    const heldFrom = new Date(now - 2 * 3_600_000);
    await app.prisma.turfHoldSegment.create({
      data: {
        roundId: liveRoundId, turfId: turf.id, holderId: alice.playerId, holderPublicPimpId: 7201, holderName: 'pf7201',
        allianceId: 'alliance-pf', startedAt: heldFrom, endedAt: new Date(heldFrom.getTime() + 90 * 60_000),
      },
    });
    await app.prisma.turfControlEvent.create({
      data: {
        roundId: liveRoundId, cityId: otherCityId, nextAllianceId: 'alliance-pf', nextBlocksHeld: 3, blocksTotal: 5,
        happenedAt: new Date(heldFrom.getTime() + 30 * 60_000),
      },
    });

    // Travel: one run home over New York -> Detroit and back, one leg still ahead.
    const run = await app.prisma.run.create({
      data: {
        roundPlayerId: alice.playerId, status: 'RETURNED', homeCity: 'new-york-city', lowRiders: 1,
        escortThugs: 1, cashCents: 0n, startCashCents: 0n, turnsSpent: 10,
      },
    });
    await app.prisma.runStop.createMany({
      data: [
        { runId: run.id, order: 0, city: 'detroit', route: ['new-york-city', 'detroit'], departAt: liveAt, arriveAt: liveAt },
        { runId: run.id, order: 1, city: 'new-york-city', route: ['detroit', 'new-york-city'], departAt: liveAt, arriveAt: liveAt },
      ],
    });
    const out = await app.prisma.run.create({
      data: {
        roundPlayerId: alice.playerId, homeCity: 'new-york-city', lowRiders: 1, escortThugs: 1,
        cashCents: 0n, startCashCents: 0n, turnsSpent: 10,
      },
    });
    await app.prisma.runStop.create({
      data: { runId: out.id, order: 0, city: 'atlanta', route: ['new-york-city', 'atlanta'], departAt: liveAt, arriveAt: new Date(now + 3_600_000) },
    });
    await app.prisma.runCargo.create({ data: { runId: run.id, productKey: 'CRACK', quantity: 0, startQuantity: 100 } });
    await app.prisma.runTrade.createMany({
      data: [
        { runId: run.id, city: 'detroit', productKey: 'CRACK', direction: 'sell', quantity: 100, unitCents: 1_000, totalCents: 100_000n },
        { runId: run.id, city: 'detroit', productKey: 'METH', direction: 'buy', quantity: 30, unitCents: 5_000, totalCents: 150_000n },
      ],
    });
    await app.prisma.playerReputation.createMany({
      data: [
        { roundPlayerId: alice.playerId, trader: 'PIP', points: 40 },
        { roundPlayerId: alice.playerId, trader: 'TOMMY', points: 15 },
      ],
    });

    await app.prisma.accountProfile.create({
      data: { accountId: alice.id, crewName: 'The Night Shift', featuredBadgeKeys: ['road-warrior'], activeTitleKey: 'road-warrior' },
    });

    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: liveRoundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } }).catch(() => undefined);
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } }).catch(() => undefined);
    await app?.close();
  });

  it('adds up every season total from the history tables', async () => {
    const row = await app.prisma.roundPlayer.findUniqueOrThrow({
      where: { id: alice.playerId },
      select: { id: true, whores: true, thugs: true, peakCrew: true, round: { select: { endsAt: true, rulesetId: true, rulesetVersion: true } } },
    });
    const totals = (await SeasonStatsService.totals(app.prisma, [row])).get(alice.playerId)!;
    expect(totals).toMatchObject({
      turnsWorked: 40,
      streetEarningsCents: 76_000,
      recruitsFound: 6,
      peakCrew: 90,
      raidsWon: 2,
      raidsLost: 1,
      defensesHeld: 1,
      defensesLost: 0,
      driveBysLanded: 1,
      // Own reports only: 3 per attack (4 non-voided), 1 as defender.
      thugsDefeated: 13,
      cashStolenCents: 20_000 + 60_000 + 4_000,
      biggestRaidCents: 60_000,
      blocksCaptured: 2,
      blocksLost: 1,
      blockSeconds: 90 * 60,
      citiesControlled: 1,
      runsCompleted: 1,
      driveHours: 20,
      cargoMoved: 130,
      convoyAttacksWon: 1,
      productProduced: 50,
      productSold: 25 + 7 + 100,
      largestTransactionCents: 300_000,
      traderReputation: 55,
    });
  });

  it('shows the owner everything and seals cash, crew and product flow from rivals', async () => {
    const own = await profile(alice.cookie, 7201);
    expect(own.statSheet.sealed).toBe(false);
    expect(own.statSheet.combat.cashStolenCents).toBe(84_000);
    expect(own.statSheet.street.peakCrew).toBe(90);
    expect(own.crewName).toBe('The Night Shift');
    expect(own.seasonName).toBe('PF Live Season');

    const seen = await profile(bob.cookie, 7201);
    expect(seen.statSheet.sealed).toBe(true);
    expect(seen.statSheet.combat.cashStolenCents).toBeNull();
    expect(seen.statSheet.street.peakCrew).toBeNull();
    expect(seen.statSheet.economy.productSold).toBeNull();
    expect(seen.statSheet.combat.raidsWon).toBe(2);
    expect(seen.statSheet.turf.blockHours).toBe(1.5);
    expect(seen.awards.find((award) => award.key === 'stick-up-king')!.progress).toBeNull();
  });

  it('keeps titles earned in finished seasons and lists Hall of Fame podiums', async () => {
    const seen = await profile(bob.cookie, 7201);
    const roadWarrior = seen.awards.find((award) => award.key === 'road-warrior')!;
    expect(roadWarrior).toMatchObject({ unlocked: true, earnedSeason: 'PF Past Season' });
    expect(seen.cosmetics.title).toBe('Road Warrior');
    expect(seen.showcase.map((award) => award.key)).toEqual(['road-warrior']);
    expect(seen.badges.find((badge) => badge.key === 'road-warrior')?.permanent).toBe(true);
    expect(seen.awards.find((award) => award.key === 'kingpin')!.unlocked).toBe(true);
    expect(seen.career.legacy.podiumFinishes).toBe(1);
    expect(seen.career.hallOfFame).toEqual([
      expect.objectContaining({ nationalRank: 2, podium: true, round: expect.objectContaining({ name: 'PF Past Season' }) }),
    ]);
    const pastSeason = seen.career.seasons.find((season) => season.publicPimpId === 7101)!;
    expect(pastSeason.statSheet).toMatchObject({ sealed: false, travel: { runsCompleted: 10 } });
  });

  it('saves, finds and clears crew names', async () => {
    const settings = await app.inject({ method: 'GET', url: '/api/auth/profile-settings', headers: { cookie: bob.cookie } });
    expect(settings.statusCode, settings.body).toBe(200);
    const body = settings.json().settings;
    const saved = await app.inject({
      method: 'PUT', url: '/api/auth/profile-settings', headers: { cookie: bob.cookie },
      payload: { ...body, crewName: '  Southside   Kings ' },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().settings.crewName).toBe('Southside Kings');

    const directory = await app.inject({ method: 'GET', url: '/api/game/players?view=all&q=southside', headers: { cookie: alice.cookie } });
    expect(directory.statusCode, directory.body).toBe(200);
    expect(directory.json().players.map((row: { publicPimpId: number; crewName: string }) => [row.publicPimpId, row.crewName]))
      .toEqual([[7202, 'Southside Kings']]);

    const bad = await app.inject({
      method: 'PUT', url: '/api/auth/profile-settings', headers: { cookie: bob.cookie },
      payload: { ...body, crewName: '<script>' },
    });
    expect(bad.statusCode).toBe(400);

    // Leaving it out keeps it; a blank clears it.
    const kept = await app.inject({ method: 'PUT', url: '/api/auth/profile-settings', headers: { cookie: bob.cookie }, payload: { ...body, crewName: undefined } });
    expect(kept.json().settings.crewName).toBe('Southside Kings');
    const cleared = await app.inject({ method: 'PUT', url: '/api/auth/profile-settings', headers: { cookie: bob.cookie }, payload: { ...body, crewName: '' } });
    expect(cleared.json().settings.crewName).toBeNull();
  });
});
