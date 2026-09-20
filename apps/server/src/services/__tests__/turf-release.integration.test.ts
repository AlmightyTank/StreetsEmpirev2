import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV06F } from '@streets/rulesets';
import { cornerMinimumFor, startingStock } from '@streets/rules-engine';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { TurfCrackdownService } from '../turf-crackdown.service.js';
import { TurfHistoryService, startTurfHold } from '../turf-history.service.js';
import { TurfWarSettlementService } from '../turf-war-settle.service.js';
import { TurfWarService } from '../turf-war.service.js';
import { cornerGunWorthCents, TurfService } from '../turf.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('0.6.0-F turf release regression with PostgreSQL', () => {
  let app: FastifyInstance;
  const accountIds: string[] = [];
  const roundIds: string[] = [];
  let currentRoundId = '';
  const rules = classicOgV06F;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    for (const label of ['alpha', 'bravo', 'charlie']) {
      const username = `turf_f_${label}_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { username, email: `${username}@example.invalid`, password: randomUUID() },
      });
      expect(registered.statusCode).toBe(201);
      accountIds.push(registered.json().account.id);
    }

    const current = async () => {
      if (!currentRoundId) throw new Error('No Turf F fixture round is active.');
      return app.prisma.round.findUniqueOrThrow({ where: { id: currentRoundId } });
    };
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
  });

  afterEach(async () => {
    currentRoundId = '';
    if (roundIds.length) {
      await app.prisma.round.deleteMany({ where: { id: { in: roundIds.splice(0) } } });
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app?.close();
  });

  async function fixture() {
    const startsAt = new Date('2026-09-01T00:00:00.000Z');
    const endsAt = new Date('2026-09-29T00:00:00.000Z');
    const round = await app.prisma.round.create({
      data: {
        name: 'Turf F release fixture',
        slug: `turf-f-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt,
        endsAt,
      },
    });
    roundIds.push(round.id);
    currentRoundId = round.id;

    const home = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const now = new Date('2026-09-20T12:00:00.000Z');
    const rich = {
      ...rules.round.startingPlayer,
      ...startingStock(rules),
      whores: 50,
      thugs: 120,
      woundedThugs: 0,
      busyThugs: 0,
      postedThugs: 0,
      postedNetWorthCents: 0n,
      outpostNetWorthCents: 0n,
      pistols: 0,
      shotguns: 0,
      tek9s: 0,
      ak47s: 120,
      condoms: 5_000,
      medicine: 500,
      beer: 5_000,
      crack: 5_000,
      turns: 144,
      cashCents: 50_000_000n,
      lastTurnCalculationAt: now,
      lastActiveAt: now,
    };

    const players = [];
    for (let index = 0; index < accountIds.length; index++) {
      const account = await app.prisma.account.findUniqueOrThrow({ where: { id: accountIds[index]! } });
      const player = await app.prisma.roundPlayer.create({
        data: {
          ...rich,
          netWorthCents: NetWorthService.calculate(rich, rules),
          roundId: round.id,
          accountId: account.id,
          cityId: home.id,
          displayName: account.username,
          publicPimpId: 8201 + index,
          reputation: { create: ReputationService.seedFor(rules) },
        },
      });
      players.push(player);
    }

    await TurfService.ensureRound(app.prisma, round.id, rules);
    return { round, home, players, now };
  }

  function postedWorth(ak47s: number) {
    return cornerGunWorthCents(rules, { pistols: 0, shotguns: 0, tek9s: 0, ak47s });
  }

  async function postBlock(input: {
    roundId: string;
    cityId: string;
    district: 'CASINO' | 'NIGHTCLUB' | 'LOW_RENT' | 'URBAN_GHETTO' | 'WINO_SLUMS';
    holderId: string;
    thugs: number;
    at: Date;
  }) {
    const row = await app.prisma.turf.update({
      where: { roundId_cityId_district: { roundId: input.roundId, cityId: input.cityId, district: input.district } },
      data: {
        holderId: input.holderId,
        cornerThugs: input.thugs,
        cornerPistols: 0,
        cornerShotguns: 0,
        cornerTek9s: 0,
        cornerAk47s: input.thugs,
        heldSince: input.at,
        shieldUntil: null,
        upkeepAt: input.at,
        localsReclaimAt: null,
      },
    });
    await app.prisma.roundPlayer.update({
      where: { id: input.holderId },
      data: {
        postedThugs: { increment: input.thugs },
        ak47s: { decrement: input.thugs },
        postedNetWorthCents: { increment: postedWorth(input.thugs) },
      },
    });
    await startTurfHold(app.prisma, row.id, input.at);
    return row;
  }

  it('creates all 40 blocks and keeps an away outpost box private to its owner', async () => {
    const { round, home, players, now } = await fixture();
    expect(await app.prisma.turf.count({ where: { roundId: round.id } })).toBe(40);

    const awaySlug = Object.keys(rules.cities).find((slug) => slug !== home.slug)!;
    const away = await app.prisma.city.findUniqueOrThrow({ where: { slug: awaySlug } });
    const block = await postBlock({
      roundId: round.id,
      cityId: away.id,
      district: 'CASINO',
      holderId: players[0]!.id,
      thugs: 10,
      at: now,
    });
    await app.prisma.turfOutpost.create({
      data: {
        turfId: block.id,
        ownerId: players[0]!.id,
        cashCents: 250_000n,
        beer: 40,
        products: { CRACK: 25 },
      },
    });

    const mine = await TurfService.byCity(app.prisma, players[0]!.id, rules, now);
    const rival = await TurfService.byCity(app.prisma, players[1]!.id, rules, now);
    const mineBlock = mine!.get(awaySlug)!.blocks.find((row) => row.district === 'CASINO')!;
    const rivalBlock = rival!.get(awaySlug)!.blocks.find((row) => row.district === 'CASINO')!;

    expect(mineBlock).toMatchObject({
      isMine: true,
      cornerThugs: 10,
      outpost: { cashCents: 250_000, beer: 40, products: { CRACK: 25 } },
    });
    expect(rivalBlock.holder?.publicPimpId).toBe(players[0]!.publicPimpId);
    expect(rivalBlock.cornerThugs).toBe(10);
    expect(rivalBlock.outpost).toBeNull();
  });

  it('starts and lands a real delayed player turf push without corrupting crew custody', async () => {
    const { round, home, players, now } = await fixture();
    const attacker = players[0]!;
    const defender = players[1]!;
    await postBlock({
      roundId: round.id,
      cityId: home.id,
      district: 'CASINO',
      holderId: defender.id,
      thugs: 20,
      at: now,
    });
    await app.prisma.turfPresence.create({
      data: { roundPlayerId: attacker.id, cityId: home.id, district: 'CASINO', turns: 100, at: now },
    });

    const squad = cornerMinimumFor(rules, 'CASINO', attacker.thugs);
    const started = await TurfWarService.start(
      app.prisma,
      attacker.id,
      { district: 'CASINO', squad, actionId: randomUUID() },
      now,
    );
    expect(started.result.squad).toBe(squad);

    const pending = await app.prisma.turfPush.findUniqueOrThrow({ where: { id: started.result.pushId } });
    expect(pending.status).toBe('PENDING');
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: attacker.id } })).busyThugs).toBe(squad);

    const landed = await TurfWarSettlementService.land(app.prisma, pending.id, pending.landsAt);
    expect(landed).toBe(true);
    const finalPush = await app.prisma.turfPush.findUniqueOrThrow({ where: { id: pending.id } });
    expect(finalPush.status).toBe('LANDED');
    expect(finalPush.settledAt).toEqual(pending.landsAt);
    expect(finalPush.result).not.toBeNull();

    const block = await app.prisma.turf.findUniqueOrThrow({
      where: { roundId_cityId_district: { roundId: round.id, cityId: home.id, district: 'CASINO' } },
    });
    expect([attacker.id, defender.id]).toContain(block.holderId);

    const states = await app.prisma.roundPlayer.findMany({ where: { id: { in: [attacker.id, defender.id] } } });
    for (const state of states) {
      expect(state.thugs).toBeGreaterThanOrEqual(0);
      expect(state.busyThugs).toBeGreaterThanOrEqual(0);
      expect(state.postedThugs).toBeGreaterThanOrEqual(0);
      expect(state.postedNetWorthCents).toBeGreaterThanOrEqual(0n);
      expect(state.ak47s).toBeGreaterThanOrEqual(0);
    }
  });

  it('records city control and cumulative block-time for three allied holders', async () => {
    const { round, home, players, now } = await fixture();
    const alliance = await app.prisma.alliance.create({
      data: {
        roundId: round.id,
        name: 'Release Aces',
        nameNormalized: `release-aces-${round.id}`,
        tag: 'RFA',
        tagNormalized: `rfa-${round.id}`,
        leaderId: players[0]!.id,
      },
    });
    await app.prisma.roundPlayer.updateMany({
      where: { id: { in: players.map((player) => player.id) } },
      data: { allianceId: alliance.id, allianceJoinedAt: now },
    });

    const heldAt = new Date(now.getTime() - 2 * 3_600_000);
    const districts = ['CASINO', 'NIGHTCLUB', 'LOW_RENT'] as const;
    for (let index = 0; index < districts.length; index++) {
      await postBlock({
        roundId: round.id,
        cityId: home.id,
        district: districts[index]!,
        holderId: players[index]!.id,
        thugs: 8,
        at: heldAt,
      });
    }

    const cities = await TurfService.byCity(app.prisma, players[0]!.id, rules, now);
    expect(cities!.get(home.slug)!.control).toMatchObject({
      alliance: { name: 'Release Aces', tag: 'RFA' },
      blocksHeld: 3,
      blocksTotal: 5,
      share: 0.6,
      isYours: true,
    });

    const board = await TurfHistoryService.board(
      app.prisma,
      round.id,
      rules,
      { id: players[0]!.id, allianceId: alliance.id },
      now,
    );
    expect(board?.alliances[0]).toMatchObject({
      name: 'Release Aces',
      tag: 'RFA',
      currentBlocks: 3,
      isYours: true,
      hallOfFameLeader: true,
    });
    expect(board!.alliances[0]!.heldSeconds).toBeGreaterThanOrEqual(6 * 3_600 - 5);
    expect(board!.crews.filter((row) => row.currentBlocks === 1)).toHaveLength(3);
  });

  it('applies the seeded Federal sweep once and never double-picks a corner crew', async () => {
    const { round, home, players } = await fixture();
    const schedule = TurfCrackdownService.schedule(round, rules)!;
    const targetSlug = TurfCrackdownService.targetCitySlug(round.id, rules)!;
    const targetCity = await app.prisma.city.findUniqueOrThrow({ where: { slug: targetSlug } });
    const holder = players[0]!;

    const heldAt = new Date(schedule.sweepAt.getTime() - 24 * 3_600_000);
    const block = await postBlock({
      roundId: round.id,
      cityId: targetCity.id,
      district: 'CASINO',
      holderId: holder.id,
      thugs: 10,
      at: heldAt,
    });
    await app.prisma.turf.update({ where: { id: block.id }, data: { upkeepAt: schedule.sweepAt } });

    if (targetCity.id !== home.id) {
      await app.prisma.turfOutpost.create({
        data: {
          turfId: block.id,
          ownerId: holder.id,
          cashCents: 0n,
          beer: 1_000,
          products: { CRACK: 1_000 },
        },
      });
    }

    const first = await TurfCrackdownService.settleDue(
      app.prisma,
      round,
      rules,
      new Date(schedule.sweepAt.getTime() + 60_000),
    );
    expect(first).toMatchObject({ holdersAffected: 1, thugsPickedUp: 2 });
    expect(first?.sweptAt).toEqual(schedule.sweepAt);

    const afterFirst = await app.prisma.turf.findUniqueOrThrow({ where: { id: block.id } });
    const playerAfterFirst = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: holder.id } });
    expect(afterFirst.cornerThugs).toBe(8);
    expect(playerAfterFirst.heat).toBe(12);
    expect(playerAfterFirst.postedThugs).toBe(8);

    const second = await TurfCrackdownService.settleDue(
      app.prisma,
      round,
      rules,
      new Date(schedule.sweepAt.getTime() + 2 * 60_000),
    );
    expect(second?.id).toBe(first?.id);
    expect((await app.prisma.turf.findUniqueOrThrow({ where: { id: block.id } })).cornerThugs).toBe(8);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: holder.id } })).heat).toBe(12);
  });
});
