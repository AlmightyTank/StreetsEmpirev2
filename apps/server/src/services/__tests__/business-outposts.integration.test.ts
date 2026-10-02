import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV11E, type BusinessKey } from '@streets/rulesets';
import {
  businessIncomeCentsPerHour,
  businessStaff,
  businessUpkeep,
  startingStock,
} from '@streets/rules-engine';
import { BusinessActionService } from '../business-action.service.js';
import { BusinessService } from '../business.service.js';
import { ReputationService } from '../reputation.service.js';
import { TurfService } from '../turf.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV11E;
const home = rules.round.startingCitySlug;
const away = Object.keys(rules.cities ?? {}).find((slug) => slug !== home)!;
const district = 'NIGHTCLUB' as const;
const kind = rules.business.lots[district][0] as BusinessKey;

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.1.0-E outpost businesses with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let homeCityId = '';
  let awayCityId = '';
  let playerId = '';
  let turfId = '';
  let businessId = '';
  const accountIds: string[] = [];

  const actionId = () => randomUUID();

  async function account(): Promise<string> {
    const name = `bizout_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    const id = registered.json().account.id as string;
    accountIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({
      data: {
        name: 'Business E outpost fixture',
        slug: `business-e-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    homeCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    awayCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: away } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId: await account(),
        cityId: homeCityId,
        displayName: 'Business E tester',
        publicPimpId: 8900,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    playerId = player.id;
    await TurfService.ensureRound(app.prisma, roundId, rules);
    const block = await app.prisma.turf.findUniqueOrThrow({
      where: { roundId_cityId_district: { roundId, cityId: awayCityId, district } },
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
    await app.prisma.turfOutpost.deleteMany({ where: { ownerId: playerId } });
    await app.prisma.business.updateMany({
      where: { roundId },
      data: { level: 0, staff: 0, staffTarget: 0, staffOwnerId: null, registerCents: 0n, racket: null, racketSince: null },
    });
    await app.prisma.turf.updateMany({
      where: { roundId },
      data: { holderId: null, cornerThugs: 0, cornerPistols: 0, heldSince: null },
    });
    const now = new Date();
    await app.prisma.turf.update({
      where: { id: turfId },
      data: {
        holderId: playerId,
        cornerThugs: 6,
        cornerPistols: 6,
        heldSince: new Date(now.getTime() - 200 * HOUR_MS),
        upkeepAt: now,
      },
    });
    await app.prisma.turfOutpost.create({
      data: { turfId, ownerId: playerId, cashCents: 0n, beer: 2_000, products: { CRACK: 5_000 } },
    });
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: {
        cashCents: 100_000_000n,
        turns: 144,
        thugs: 80,
        woundedThugs: 0,
        busyThugs: 0,
        postedThugs: 6,
        businessThugs: 0,
        whores: 50,
        businessWhores: 0,
        beer: 5_000,
        crack: 5_000,
        pistols: 74,
        postedNetWorthCents: BigInt(6 * rules.economy.netWorth.perPistolCents),
        outpostNetWorthCents: 0n,
        thugHappiness: 100,
        whoreHappiness: 100,
      },
    });
  });

  it('builds away only through an owned outpost and settles its supply and register into that box', async () => {
    const built = await BusinessActionService.build(app.prisma, playerId, {
      city: away, district, lot: 1, actionId: actionId(),
    });
    expect(built.result).toMatchObject({ kind, level: 1 });

    const staff = businessStaff(rules, kind, 1);
    const beforeHome = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const beforeBox = await app.prisma.turfOutpost.findUniqueOrThrow({ where: { turfId } });
    const now = new Date();
    await app.prisma.business.update({
      where: { id: businessId },
      data: { accruedAt: new Date(now.getTime() - 2 * HOUR_MS) },
    });

    await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, now, () => 1));

    const afterHome = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const afterBox = await app.prisma.turfOutpost.findUniqueOrThrow({ where: { turfId } });
    const row = await app.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const need = businessUpkeep(rules, staff, 2);
    const perHour = businessIncomeCentsPerHour(rules, {
      citySlug: away, district, business: kind, level: 1, away: true,
    });
    const earned = BigInt(Math.floor(perHour * 2));

    expect(afterHome.beer).toBe(beforeHome.beer);
    expect(afterHome.crack).toBe(beforeHome.crack);
    expect(afterBox.beer).toBe(beforeBox.beer - need.beer);
    expect((afterBox.products as Record<string, number>).CRACK).toBe(5_000 - need.product);
    expect(afterBox.cashCents).toBe(earned);
    expect(row.registerCents).toBe(0n);
    expect(afterHome.outpostNetWorthCents).toBeGreaterThan(0n);
  });

  it('never overflows the box: register money waits there until a run makes room', async () => {
    await BusinessActionService.build(app.prisma, playerId, {
      city: away, district, lot: 1, actionId: actionId(),
    });
    const cap = BigInt(rules.turf!.outposts!.cashCapCents);
    await app.prisma.turfOutpost.update({ where: { turfId }, data: { cashCents: cap - 1_000n } });
    const now = new Date();
    await app.prisma.business.update({
      where: { id: businessId },
      data: { registerCents: 0n, accruedAt: new Date(now.getTime() - 2 * HOUR_MS) },
    });

    await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, now, () => 1));

    const box = await app.prisma.turfOutpost.findUniqueOrThrow({ where: { turfId } });
    const row = await app.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(box.cashCents).toBe(cap);
    expect(row.registerCents).toBeGreaterThan(0n);

    await expect(BusinessActionService.collect(app.prisma, playerId, { actionId: actionId() }))
      .rejects.toMatchObject({ code: 'BUSINESS_NOTHING_TO_COLLECT' });
    expect((await app.prisma.business.findUniqueOrThrow({ where: { id: businessId } })).registerCents).toBe(row.registerCents);
  });
});
