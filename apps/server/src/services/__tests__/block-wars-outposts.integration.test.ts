import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV11E } from '@streets/rulesets';
import { businessStaff, startingStock } from '@streets/rules-engine';
import { BlockWarService } from '../block-war.service.js';
import { BlockWarSettleService } from '../block-war-settle.service.js';
import { ReputationService } from '../reputation.service.js';
import { TurfService, outpostBoxWorthCents } from '../turf.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV11E;
const attackerCitySlug = rules.round.startingCitySlug;
const defenderCitySlug = Object.keys(rules.cities ?? {}).find((slug) => slug !== attackerCitySlug)!;
const district = 'CASINO' as const;

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.1.0-E outpost block wars with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let attackerCityId = '';
  let defenderCityId = '';
  let attackerId = '';
  let defenderId = '';
  let turfId = '';
  let businessId = '';
  let t0 = new Date();
  const accountIds: string[] = [];

  const actionId = () => randomUUID();

  async function account(): Promise<string> {
    const name = `bizwar_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    const id = registered.json().account.id as string;
    accountIds.push(id);
    return id;
  }

  async function player(accountId: string, publicPimpId: number, cityId: string): Promise<string> {
    const row = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId,
        cityId,
        displayName: `bizwar_${publicPimpId}`,
        publicPimpId,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    return row.id;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({
      data: {
        name: 'Business E outpost war fixture',
        slug: `business-e-war-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    roundId = round.id;
    attackerCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: attackerCitySlug } })).id;
    defenderCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: defenderCitySlug } })).id;
    attackerId = await player(await account(), 8950, attackerCityId);
    defenderId = await player(await account(), 8951, defenderCityId);

    await TurfService.ensureRound(app.prisma, roundId, rules);
    const block = await app.prisma.turf.findUniqueOrThrow({
      where: { roundId_cityId_district: { roundId, cityId: attackerCityId, district } },
      include: { businesses: { orderBy: { lot: 'asc' } } },
    });
    turfId = block.id;
    businessId = block.businesses[0]!.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } });
    await app?.close();
  });

  beforeEach(async () => {
    t0 = new Date(Date.now() - 60_000);
    await app.prisma.blockWar.deleteMany({ where: { roundId } });
    await app.prisma.turfOutpost.deleteMany({ where: { ownerId: defenderId } });
    await app.prisma.business.updateMany({
      where: { roundId },
      data: { level: 0, staff: 0, staffTarget: 0, staffOwnerId: null, registerCents: 0n, torchUntil: null, torchById: null },
    });
    await app.prisma.turf.updateMany({
      where: { roundId },
      data: {
        holderId: null, cornerThugs: 0, cornerPistols: 0, cornerShotguns: 0, cornerTek9s: 0, cornerAk47s: 0,
        heldSince: null, shieldUntil: null, fatigue: 0, fatigueAt: t0, capturedAts: [], siegedSince: null,
      },
    });

    const staff = businessStaff(rules, 'CASINO_FRONT', 3);
    await app.prisma.turf.update({
      where: { id: turfId },
      data: {
        holderId: defenderId,
        cornerThugs: 6,
        cornerPistols: 6,
        heldSince: new Date(t0.getTime() - 200 * HOUR_MS),
        upkeepAt: t0,
      },
    });
    await app.prisma.business.update({
      where: { id: businessId },
      data: { level: 3, staff, staffTarget: staff, staffOwnerId: defenderId, registerCents: 2_000_000n, accruedAt: t0 },
    });

    const box = { cashCents: 4_000_000n, beer: 400, products: { CRACK: 800 } };
    const worth = outpostBoxWorthCents(rules, box);
    await app.prisma.turfOutpost.create({ data: { turfId, ownerId: defenderId, ...box } });

    const crew = {
      cashCents: 100_000_000n,
      turns: 144,
      thugs: 80,
      woundedThugs: 0,
      busyThugs: 0,
      businessThugs: 0,
      whores: 50,
      businessWhores: 0,
      beer: 5_000,
      crack: 5_000,
      pistols: 80,
      shotguns: 0,
      tek9s: 0,
      ak47s: 0,
      heat: 0,
      lastTurnCalculationAt: t0,
      racketEffects: {},
    };
    await app.prisma.roundPlayer.update({
      where: { id: attackerId },
      data: { ...crew, postedThugs: 0, postedNetWorthCents: 0n, outpostNetWorthCents: 0n },
    });
    await app.prisma.roundPlayer.update({
      where: { id: defenderId },
      data: {
        ...crew,
        postedThugs: 6,
        pistols: 74,
        businessThugs: staff,
        postedNetWorthCents: BigInt(6 * rules.economy.netWorth.perPistolCents),
        outpostNetWorthCents: worth,
      },
    });

    await app.prisma.turfPresence.deleteMany({ where: { roundPlayerId: attackerId } });
    await app.prisma.turfPresence.create({
      data: { roundPlayerId: attackerId, cityId: attackerCityId, district, turns: 100, at: t0 },
    });
  });

  it('lets the remote holder torch by city and removes captured box value on a Take', async () => {
    const declared = await BlockWarService.declare(app.prisma, attackerId, {
      district,
      goal: 'TAKE',
      squad: 30,
      actionId: actionId(),
    }, t0);
    const warId = declared.result.warId;

    const torched = await BlockWarService.torch(app.prisma, defenderId, {
      city: attackerCitySlug,
      district,
      lot: 1,
      actionId: actionId(),
    }, t0);
    expect(torched.result.message).toContain('burning');
    expect((await app.prisma.business.findUniqueOrThrow({ where: { id: businessId } })).torchUntil).not.toBeNull();

    const beforeDefender = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: defenderId } });
    const box = await app.prisma.turfOutpost.findUniqueOrThrow({ where: { turfId } });
    const worth = outpostBoxWorthCents(rules, {
      cashCents: box.cashCents,
      beer: box.beer,
      products: box.products as Record<string, number>,
    });

    await BlockWarSettleService.advance(app.prisma, warId, new Date(t0.getTime() + 1_000), {
      winner: 'ATTACKER',
      reason: 'CONCEDED',
    });

    const afterDefender = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: defenderId } });
    expect(beforeDefender.outpostNetWorthCents - afterDefender.outpostNetWorthCents).toBe(worth);
    expect(await app.prisma.turfOutpost.findUnique({ where: { turfId } })).toBeNull();

    const finished = await app.prisma.blockWar.findUniqueOrThrow({ where: { id: warId } });
    expect(finished).toMatchObject({ status: 'ENDED', winner: 'ATTACKER', goal: 'TAKE' });
    const result = finished.result as { outpostLoot?: { cashCents: number; beer: number; products: Record<string, number> } };
    expect(result.outpostLoot).toEqual({
      cashCents: 1_000_000,
      beer: 100,
      products: { CRACK: 200 },
    });
  });
});
