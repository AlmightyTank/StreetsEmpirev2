import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV11B } from '@streets/rulesets';
import {
  businessIncomeCentsPerHour,
  businessLevelCostCents,
  businessStaff,
  businessUpkeep,
  registerCapCents,
  startingStock,
} from '@streets/rules-engine';
import { BusinessActionService } from '../business-action.service.js';
import { BusinessService } from '../business.service.js';
import { ReputationService } from '../reputation.service.js';
import { TurfService } from '../turf.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV11B;
const business = rules.business;
const home = rules.round.startingCitySlug;
const perThug = BigInt(rules.economy.netWorth.perThugCents);
const perWhore = BigInt(rules.economy.netWorth.perWhoreCents);

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.1.0-B business operations with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  let playerId = '';
  let rivalId = '';
  const accountIds: string[] = [];

  async function account(): Promise<string> {
    const name = `bizop_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    const id = registered.json().account.id as string;
    accountIds.push(id);
    return id;
  }

  async function player(accountId: string, publicPimpId: number): Promise<string> {
    const row = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId,
        cityId,
        displayName: `bizop_${publicPimpId}`,
        publicPimpId,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    return row.id;
  }

  const read = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const block = (district: string) => app.prisma.turf.findFirstOrThrow({
    where: { roundId, cityId, district },
    include: { businesses: { orderBy: { lot: 'asc' } } },
  });
  const lot = async (district: string, at: number) => (await block(district)).businesses.find((entry) => entry.lot === at)!;
  const actionId = () => randomUUID();

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({
      data: {
        name: 'Business B fixture',
        slug: `business-b-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    playerId = await player(await account(), 8400);
    rivalId = await player(await account(), 8401);
    await TurfService.ensureRound(app.prisma, roundId, rules);
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.business.updateMany({ where: { roundId }, data: { level: 0, staff: 0, staffOwnerId: null, registerCents: 0n } });
    await app.prisma.turf.updateMany({ where: { roundId }, data: { holderId: null, cornerThugs: 0, heldSince: null } });
    // A crew holding its home Nightclub and Casino blocks, with cash, crew and supply to spare.
    await app.prisma.turf.updateMany({
      where: { roundId, cityId, district: { in: ['NIGHTCLUB', 'CASINO'] } },
      data: { holderId: playerId, cornerThugs: 6, heldSince: new Date(Date.now() - 200 * HOUR_MS), upkeepAt: new Date() },
    });
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: {
        cashCents: 100_000_000n, turns: 144, thugs: 80, woundedThugs: 0, busyThugs: 0, postedThugs: 12,
        whores: 100, beer: 5_000, crack: 5_000, businessNetWorthCents: 0n,
      },
    });
    await app.prisma.roundPlayer.update({
      where: { id: rivalId },
      data: { cashCents: 100_000_000n, turns: 144, thugs: 80, postedThugs: 0, whores: 100, beer: 5_000, crack: 5_000, businessNetWorthCents: 0n },
    });
  });

  it('builds a business: cash and turns spent exactly, staff leave home, net worth keeps them', async () => {
    const cost = businessLevelCostCents(rules, 'NIGHTCLUB', 1);
    const staff = businessStaff(rules, 'NIGHTCLUB', 1);
    const built = await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });

    expect(built.result).toMatchObject({ kind: 'NIGHTCLUB', level: 1, staff, staffAdded: staff, costCents: cost });
    expect(built.before.cashCents - built.after.cashCents).toBe(cost);
    expect(built.before.turns - built.after.turns).toBe(business.levels.buildTurnCost);
    // Staff leave the home column, so they cannot work the street, defend or cook.
    expect(built.before.resources.thugs - built.after.resources.thugs).toBe(staff);
    expect(built.before.resources.fitThugs - built.after.resources.fitThugs).toBe(staff);
    // Net worth moves only by the cash spent: the staff are still the crew's.
    expect(built.before.netWorthCents - built.after.netWorthCents).toBe(cost * rules.economy.netWorth.cashWeightPercent / 100);
    expect((await read()).businessNetWorthCents).toBe(BigInt(staff) * perThug);

    const row = await lot('NIGHTCLUB', 1);
    expect(row).toMatchObject({ level: 1, staff, staffOwnerId: playerId });
    const ledger = await app.prisma.economyLedgerEntry.findFirstOrThrow({ where: { roundPlayerId: playerId, source: 'BUSINESS_BUILD' }, orderBy: { createdAt: 'desc' } });
    expect(ledger.amountCents).toBe(-BigInt(cost));
  });

  it('staffs a Strip Club with girls taken off the street', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const girls = businessStaff(rules, 'STRIP_CLUB', 1);
    const before = await read();
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 2, actionId: actionId() });
    const after = await read();
    expect(before.whores - after.whores).toBe(girls);
    expect(after.thugs).toBe(before.thugs);
    expect(after.businessNetWorthCents - before.businessNetWorthCents).toBe(BigInt(girls) * perWhore);
  });

  it('keeps lots closed until the block\'s tier opens them', async () => {
    await app.prisma.turf.updateMany({ where: { roundId, cityId, district: 'CASINO' }, data: { heldSince: new Date() } });
    await expect(BusinessActionService.build(app.prisma, playerId, { district: 'CASINO', lot: 2, actionId: actionId() }))
      .rejects.toMatchObject({ code: 'BUSINESS_LOT_CLOSED' });
    await expect(BusinessActionService.build(app.prisma, rivalId, { district: 'CASINO', lot: 1, actionId: actionId() }))
      .rejects.toMatchObject({ code: 'BUSINESS_NOT_YOUR_BLOCK' });
  });

  it('fills the register from supplied hours, never past its cap, and burns the supply', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const staff = businessStaff(rules, 'NIGHTCLUB', 1);
    const perHour = businessIncomeCentsPerHour(rules, { citySlug: home, district: 'NIGHTCLUB', business: 'NIGHTCLUB', level: 1 });
    const row = await lot('NIGHTCLUB', 1);

    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - 5 * HOUR_MS - 60_000) } });
    const beforeFive = await read();
    await BusinessService.settleFor(app.prisma, playerId);
    const afterFive = await read();
    expect((await lot('NIGHTCLUB', 1)).registerCents).toBe(BigInt(Math.floor(perHour * 5)));
    const need = businessUpkeep(rules, staff, 5);
    expect(beforeFive.beer - afterFive.beer).toBe(need.beer);
    expect(beforeFive.crack - afterFive.crack).toBe(need.product);

    // Two days unattended: the register stops at its cap.
    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - 48 * HOUR_MS) } });
    await BusinessService.settleFor(app.prisma, playerId);
    expect((await lot('NIGHTCLUB', 1)).registerCents).toBe(BigInt(registerCapCents(rules, perHour)));
  });

  it('earns nothing for hours it had no supply', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { beer: 0 } });
    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - 6 * HOUR_MS) } });
    await BusinessService.settleFor(app.prisma, playerId);
    expect((await lot('NIGHTCLUB', 1)).registerCents).toBe(0n);
  });

  it('collects every register into cash exactly', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.business.update({ where: { id: row.id }, data: { registerCents: 123_456n } });
    const collected = await BusinessActionService.collect(app.prisma, playerId, { actionId: actionId() });
    expect(collected.result).toMatchObject({ collectedCents: 123_456, businesses: 1 });
    expect(collected.after.cashCents - collected.before.cashCents).toBe(123_456);
    expect(collected.before.turns - collected.after.turns).toBe(business.register.collectTurnCost);
    expect((await lot('NIGHTCLUB', 1)).registerCents).toBe(0n);
    await expect(BusinessActionService.collect(app.prisma, playerId, { actionId: actionId() }))
      .rejects.toMatchObject({ code: 'BUSINESS_NOTHING_TO_COLLECT' });
  });

  it('closes and reopens a business, moving its staff home and back', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const staff = businessStaff(rules, 'NIGHTCLUB', 1);
    const closed = await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, open: false, actionId: actionId() });
    expect(closed.after.resources.thugs - closed.before.resources.thugs).toBe(staff);
    expect(closed.after.netWorthCents).toBe(closed.before.netWorthCents);
    expect((await read()).businessNetWorthCents).toBe(0n);
    const opened = await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, open: true, actionId: actionId() });
    expect(opened.before.resources.thugs - opened.after.resources.thugs).toBe(staff);
    expect(opened.after.netWorthCents).toBe(opened.before.netWorthCents);
  });

  it('sends staff home and loses the register when the crew loses the block', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const staff = businessStaff(rules, 'NIGHTCLUB', 1);
    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.business.update({ where: { id: row.id }, data: { registerCents: 50_000n } });
    const before = await read();
    await app.prisma.turf.update({ where: { id: row.turfId }, data: { holderId: rivalId, heldSince: new Date(Date.now() - 200 * HOUR_MS) } });

    await BusinessService.settleFor(app.prisma, playerId);
    const after = await read();
    expect(after.thugs - before.thugs).toBe(staff);
    expect(after.businessNetWorthCents).toBe(0n);
    expect(after.cashCents).toBe(before.cashCents);
    expect(await lot('NIGHTCLUB', 1)).toMatchObject({ level: 1, staff: 0, staffOwnerId: null, registerCents: 0n });
  });

  it('hands a business to the new holder, sending the old crew\'s staff home first', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const staff = businessStaff(rules, 'NIGHTCLUB', 1);
    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.turf.update({ where: { id: row.turfId }, data: { holderId: rivalId, heldSince: new Date(Date.now() - 200 * HOUR_MS) } });
    const owner = await read();

    // The rival opens it before the old crew has been back to settle.
    const opened = await BusinessActionService.staff(app.prisma, rivalId, { district: 'NIGHTCLUB', lot: 1, open: true, actionId: actionId() });
    expect(opened.result).toMatchObject({ open: true, staff });
    const after = await read();
    expect(after.thugs - owner.thugs).toBe(staff);
    expect(after.businessNetWorthCents).toBe(0n);
    expect(await lot('NIGHTCLUB', 1)).toMatchObject({ level: 1, staff, staffOwnerId: rivalId });
  });
});
