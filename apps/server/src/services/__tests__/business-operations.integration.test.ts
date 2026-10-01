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
import { CombatService } from '../combat.service.js';
import { ReputationService } from '../reputation.service.js';
import { TurfService } from '../turf.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV11B;
const business = rules.business;
const home = rules.round.startingCitySlug;

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

  const read = (id = playerId) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } });
  const block = (district: string) => app.prisma.turf.findFirstOrThrow({
    where: { roundId, cityId, district },
    include: { businesses: { orderBy: { lot: 'asc' } } },
  });
  const lot = async (district: string, at: number) => (await block(district)).businesses.find((entry) => entry.lot === at)!;
  const actionId = () => randomUUID();
  const fit = (row: { thugs: number; woundedThugs: number; busyThugs: number; postedThugs: number; businessThugs: number }) =>
    row.thugs - row.woundedThugs - row.busyThugs - row.postedThugs - row.businessThugs;

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
    await app.prisma.raidBattle.deleteMany({ where: { OR: [{ attackerId: rivalId }, { attackerId: playerId }] } });
    // A crew holding its home Nightclub and Casino blocks, with cash, crew and supply to spare.
    await app.prisma.turf.updateMany({
      where: { roundId, cityId, district: { in: ['NIGHTCLUB', 'CASINO'] } },
      data: { holderId: playerId, cornerThugs: 6, heldSince: new Date(Date.now() - 200 * HOUR_MS), upkeepAt: new Date() },
    });
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: {
        cashCents: 100_000_000n, turns: 144, thugs: 80, woundedThugs: 0, busyThugs: 0, postedThugs: 12,
        whores: 100, beer: 5_000, crack: 5_000, businessThugs: 0, businessWhores: 0,
        thugHappiness: 100, whoreHappiness: 100,
      },
    });
    await app.prisma.roundPlayer.update({
      where: { id: rivalId },
      data: { cashCents: 100_000_000n, turns: 144, thugs: 80, postedThugs: 0, whores: 100, beer: 5_000, crack: 5_000, businessThugs: 0, businessWhores: 0 },
    });
  });

  it('builds a business: cash and turns spent exactly; staff stay in the crew but leave the fit crew', async () => {
    const cost = businessLevelCostCents(rules, 'NIGHTCLUB', 1);
    const staff = businessStaff(rules, 'NIGHTCLUB', 1);
    const built = await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });

    expect(built.result).toMatchObject({ kind: 'NIGHTCLUB', level: 1, staff, staffAdded: staff, costCents: cost });
    expect(built.before.cashCents - built.after.cashCents).toBe(cost);
    expect(built.before.turns - built.after.turns).toBe(business.levels.buildTurnCost);
    // Still the crew's: the head count and net worth do not move with them...
    expect(built.after.resources.thugs).toBe(built.before.resources.thugs);
    expect(built.before.netWorthCents - built.after.netWorthCents).toBe(cost * rules.economy.netWorth.cashWeightPercent / 100);
    // ...but they are not fit at home, so they cannot work the street, defend or cook.
    expect(built.before.resources.fitThugs - built.after.resources.fitThugs).toBe(staff);
    expect(built.after.resources.businessThugs).toBe(staff);

    expect(await lot('NIGHTCLUB', 1)).toMatchObject({ level: 1, staff, staffOwnerId: playerId });
    const ledger = await app.prisma.economyLedgerEntry.findFirstOrThrow({ where: { roundPlayerId: playerId, source: 'BUSINESS_BUILD' }, orderBy: { createdAt: 'desc' } });
    expect(ledger.amountCents).toBe(-BigInt(cost));
  });

  it('staffs a Strip Club with girls who stay in the crew but stop working the street', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const girls = businessStaff(rules, 'STRIP_CLUB', 1);
    const before = await read();
    const built = await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 2, actionId: actionId() });
    const after = await read();
    expect(after.whores).toBe(before.whores);
    expect(after.thugs).toBe(before.thugs);
    expect(after.businessWhores - before.businessWhores).toBe(girls);
    expect(built.after.resources.businessWhores).toBe(girls);
  });

  it('keeps lots closed until the block\'s tier opens them', async () => {
    await app.prisma.turf.updateMany({ where: { roundId, cityId, district: 'CASINO' }, data: { heldSince: new Date() } });
    await expect(BusinessActionService.build(app.prisma, playerId, { district: 'CASINO', lot: 2, actionId: actionId() }))
      .rejects.toMatchObject({ code: 'BUSINESS_LOT_CLOSED' });
    await expect(BusinessActionService.build(app.prisma, rivalId, { district: 'CASINO', lot: 1, actionId: actionId() }))
      .rejects.toMatchObject({ code: 'BUSINESS_NOT_YOUR_BLOCK' });
  });

  it('will not staff a business with thugs who are not fit at home', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { busyThugs: 67 } });
    await expect(BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() }))
      .rejects.toMatchObject({ code: 'BUSINESS_NOT_ENOUGH_THUGS' });
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

  it('closes and reopens a business, moving its staff back to the fit crew and out again', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const staff = businessStaff(rules, 'NIGHTCLUB', 1);
    const closed = await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, staff: 0, actionId: actionId() });
    expect(closed.after.resources.fitThugs - closed.before.resources.fitThugs).toBe(staff);
    expect(closed.after.resources.thugs).toBe(closed.before.resources.thugs);
    expect(closed.after.netWorthCents).toBe(closed.before.netWorthCents);
    expect((await read()).businessThugs).toBe(0);
    const opened = await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, staff, actionId: actionId() });
    expect(opened.before.resources.fitThugs - opened.after.resources.fitThugs).toBe(staff);
    expect(opened.after.netWorthCents).toBe(opened.before.netWorthCents);
  });

  it('runs short-staffed for proportionally less, so a crew can bring people home', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const max = businessStaff(rules, 'NIGHTCLUB', 2);
    const fewer = await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, staff: max - 1, actionId: actionId() });
    expect(fewer.result).toMatchObject({ staff: max - 1, maxStaff: max, staffChange: -1, turnsUsed: business.staffTurnCost });
    expect(fewer.after.resources.fitThugs - fewer.before.resources.fitThugs).toBe(1);

    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - 2 * HOUR_MS - 60_000) } });
    await BusinessService.settleFor(app.prisma, playerId);
    const perHour = businessIncomeCentsPerHour(rules, { citySlug: home, district: 'NIGHTCLUB', business: 'NIGHTCLUB', level: 2 });
    expect((await lot('NIGHTCLUB', 1)).registerCents).toBe(BigInt(Math.floor(perHour * ((max - 1) / max) * 2)));

    await expect(BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, staff: max + 1, actionId: actionId() }))
      .rejects.toMatchObject({ code: 'BUSINESS_TOO_MANY_STAFF' });
  });

  it('switches auto-staff for free, and with it on replaces staff who walk off', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const max = businessStaff(rules, 'NIGHTCLUB', 2);
    expect((await lot('NIGHTCLUB', 1)).autoStaff).toBe(true);
    const off = await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, staff: max, autoStaff: false, actionId: actionId() });
    expect(off.result).toMatchObject({ autoStaff: false, turnsUsed: 0 });
    const on = await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, staff: max, autoStaff: true, actionId: actionId() });
    expect(on.result).toMatchObject({ autoStaff: true, turnsUsed: 0 });

    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - 24 * HOUR_MS) } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { thugHappiness: 0 } });
    const before = await read();
    await BusinessService.settleFor(app.prisma, playerId, new Date(), () => 0);
    const after = await read();
    const lost = before.thugs - after.thugs;
    expect(lost).toBeGreaterThan(0);
    // The deserters are gone from the crew, but the business is back at full strength from the fit crew.
    expect((await lot('NIGHTCLUB', 1)).staff).toBe(max);
    expect(after.businessThugs).toBe(max);
    expect(fit(before) - fit(after)).toBe(lost);
  });

  it('lets an unhappy crew\'s staff walk off, out of the business and the crew', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const staff = businessStaff(rules, 'NIGHTCLUB', 2);
    await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, staff, autoStaff: false, actionId: actionId() });
    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - 24 * HOUR_MS) } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { thugHappiness: 0 } });
    const before = await read();

    await BusinessService.settleFor(app.prisma, playerId, new Date(), () => 0);
    const after = await read();
    const left = (await lot('NIGHTCLUB', 1)).staff;
    const departed = staff - left;
    expect(departed).toBeGreaterThan(0);
    expect(before.thugs - after.thugs).toBe(departed);
    expect(after.businessThugs).toBe(left);
    expect(fit(after)).toBe(fit(before));

    // Without auto-staff it stays short until the crew tops it back up from the fit crew.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { thugHappiness: 100 } });
    const reopened = await BusinessActionService.staff(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, staff, actionId: actionId() });
    expect(reopened.result.staff).toBe(staff);
    expect(reopened.before.resources.fitThugs - reopened.after.resources.fitThugs).toBe(departed);
  });

  it('keeps a happy crew\'s staff', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - 24 * HOUR_MS) } });
    // Happiness at or above the departure threshold: nobody walks, even on the worst roll.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { thugHappiness: rules.departures.happinessThreshold } });
    await BusinessService.settleFor(app.prisma, playerId, new Date(), () => 0);
    expect((await lot('NIGHTCLUB', 1)).staff).toBe(businessStaff(rules, 'NIGHTCLUB', 1));
  });

  it('lets a raid lure business staff once the rest of the crew is gone', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 2, actionId: actionId() });
    const staffThugs = businessStaff(rules, 'NIGHTCLUB', 2);
    const staffGirls = businessStaff(rules, 'STRIP_CLUB', 1);
    // Nobody left on the block but the corner and the businesses, and nobody happy.
    const now = Date.now();
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: {
        thugs: 12 + staffThugs + 15, pistols: 15, woundedThugs: 0, whores: staffGirls, thugHappiness: 0, whoreHappiness: 0, condoms: 0,
        // Short of beer, product and pay: nobody on this block is happy.
        beer: 0, crack: 0, payoutPercent: 5,
        createdAt: new Date(now - 10 * 86_400_000), lastActiveAt: new Date(now), raidProtectedUntil: null, lastRaidedAt: null,
      },
    });
    await app.prisma.roundPlayer.update({
      where: { id: rivalId },
      data: {
        thugs: 20, pistols: 20, crack: 500, beer: 500, createdAt: new Date(now - 10 * 86_400_000), lastActiveAt: new Date(now),
        raidCooldownUntil: null, raidProtectedUntil: null, lastRaidedAt: null,
      },
    });

    const report = await CombatService.specialRaid(app.prisma, rivalId, {
      roundId, targetPublicPimpId: 8400, attackingThugs: 20, kind: 'LURE_CREW', actionId: actionId(),
    });
    const after = await read();
    const rows = (await block('NIGHTCLUB')).businesses;
    const thugStaffLeft = rows.find((entry) => entry.lot === 1)!.staff;
    const girlStaffLeft = rows.find((entry) => entry.lot === 2)!.staff;
    // Whatever was lured came off the businesses, and the crew's columns still agree with them.
    expect(after.businessThugs).toBe(thugStaffLeft);
    expect(after.businessWhores).toBe(girlStaffLeft);
    expect(after.whores).toBeGreaterThanOrEqual(after.businessWhores);
    expect(fit(after)).toBeGreaterThanOrEqual(0);
    // Every girl on the block works the Strip Club, so a won lure can only take them from it.
    if (report.won) {
      expect(girlStaffLeft).toBeLessThan(staffGirls);
      expect(after.whores).toBe(girlStaffLeft);
    }
    expect(thugStaffLeft).toBeLessThanOrEqual(staffThugs);
  });

  it('sheds staff the crew no longer has, whatever took them', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 2, actionId: actionId() });
    const girls = businessStaff(rules, 'STRIP_CLUB', 1);
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { whores: girls - 1 } });
    await BusinessService.settleFor(app.prisma, playerId);
    const after = await read();
    expect(after.businessWhores).toBe(girls - 1);
    expect((await lot('NIGHTCLUB', 2)).staff).toBe(girls - 1);
  });

  it('sends staff home and loses the register when the crew loses the block', async () => {
    await BusinessActionService.build(app.prisma, playerId, { district: 'NIGHTCLUB', lot: 1, actionId: actionId() });
    const row = await lot('NIGHTCLUB', 1);
    await app.prisma.business.update({ where: { id: row.id }, data: { registerCents: 50_000n } });
    const before = await read();
    await app.prisma.turf.update({ where: { id: row.turfId }, data: { holderId: rivalId, heldSince: new Date(Date.now() - 200 * HOUR_MS) } });

    await BusinessService.settleFor(app.prisma, playerId);
    const after = await read();
    expect(after.thugs).toBe(before.thugs);
    expect(after.businessThugs).toBe(0);
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
    const opened = await BusinessActionService.staff(app.prisma, rivalId, { district: 'NIGHTCLUB', lot: 1, staff, actionId: actionId() });
    expect(opened.result).toMatchObject({ open: true, staff });
    const after = await read();
    expect(after.thugs).toBe(owner.thugs);
    expect(after.businessThugs).toBe(0);
    expect(await lot('NIGHTCLUB', 1)).toMatchObject({ level: 1, staff, staffOwnerId: rivalId });
  });

  describe('corner crews are still the crew', () => {
    const corners = () => app.prisma.turf.findMany({ where: { roundId, cityId, holderId: playerId }, orderBy: { district: 'asc' } });
    const pistolWorth = BigInt(rules.economy.netWorth.perPistolCents);

    async function armCorners(): Promise<void> {
      await app.prisma.turf.updateMany({ where: { roundId, cityId, holderId: playerId }, data: { cornerPistols: 6 } });
      await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { pistols: 10, postedNetWorthCents: 12n * pistolWorth } });
    }

    it('lets an unhappy crew\'s corner thugs walk off, and a happy crew\'s stay', async () => {
      await armCorners();
      await app.prisma.turf.updateMany({ where: { roundId, cityId, holderId: playerId }, data: { upkeepAt: new Date(Date.now() - 24 * HOUR_MS) } });
      await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { thugHappiness: rules.departures.happinessThreshold } });
      await app.prisma.$transaction((tx) => TurfService.settlePlayer(tx, playerId, rules, new Date(), () => 0));
      expect((await corners()).reduce((sum, row) => sum + row.cornerThugs, 0)).toBe(12);

      await app.prisma.turf.updateMany({ where: { roundId, cityId, holderId: playerId }, data: { upkeepAt: new Date(Date.now() - 24 * HOUR_MS) } });
      await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { thugHappiness: 0 } });
      const before = await read();
      await app.prisma.$transaction((tx) => TurfService.settlePlayer(tx, playerId, rules, new Date(), () => 0));
      const after = await read();
      const standing = (await corners()).reduce((sum, row) => sum + row.cornerThugs, 0);
      const gone = before.thugs - after.thugs;
      expect(gone).toBeGreaterThan(0);
      expect(before.postedThugs - after.postedThugs).toBe(gone);
      expect(after.postedThugs).toBe(standing);
      // Their guns stay with the crew: back in the home arsenal.
      const cornerGuns = (await corners()).reduce((sum, row) => sum + row.cornerPistols, 0);
      expect(after.pistols + cornerGuns).toBe(10 + 12);
    });

    it('takes lured corner thugs off the biggest corner, sends their guns home, and frees an emptied block', async () => {
      await armCorners();
      await app.prisma.turf.updateMany({ where: { roundId, cityId, district: 'CASINO' }, data: { cornerThugs: 4, cornerPistols: 4 } });
      await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { postedThugs: 10, postedNetWorthCents: 10n * pistolWorth } });
      await app.prisma.$transaction(async (tx) => {
        await tx.roundPlayer.update({ where: { id: playerId }, data: { thugs: 74, postedThugs: 4 } });
        await TurfService.shedCornerThugs(tx, playerId, rules, 6);
      });
      const nightclub = await block('NIGHTCLUB');
      expect(nightclub.holderId).toBeNull();
      expect(nightclub.cornerThugs).toBe(0);
      expect((await block('CASINO')).cornerThugs).toBe(4);
      const after = await read();
      expect(after.pistols).toBe(16);
      expect(after.postedNetWorthCents).toBe(4n * pistolWorth);
    });

    it('keeps corners, counts and guns consistent through a lure raid on a crew with corners', async () => {
      await armCorners();
      const now = Date.now();
      await app.prisma.roundPlayer.update({
        where: { id: playerId },
        data: {
          thugs: 12 + 6, pistols: 6, postedNetWorthCents: 12n * pistolWorth, woundedThugs: 0, thugHappiness: 0, whoreHappiness: 100,
          beer: 0, crack: 0, payoutPercent: 5,
          createdAt: new Date(now - 10 * 86_400_000), lastActiveAt: new Date(now), raidProtectedUntil: null, lastRaidedAt: null,
        },
      });
      await app.prisma.roundPlayer.update({
        where: { id: rivalId },
        data: {
          thugs: 10, pistols: 10, crack: 500, beer: 500, createdAt: new Date(now - 10 * 86_400_000), lastActiveAt: new Date(now),
          raidCooldownUntil: null, raidProtectedUntil: null, lastRaidedAt: null,
        },
      });
      await CombatService.specialRaid(app.prisma, rivalId, {
        roundId, targetPublicPimpId: 8400, attackingThugs: 10, kind: 'LURE_CREW', actionId: actionId(),
      });
      const after = await read();
      const rows = await corners();
      expect(after.postedThugs).toBe(rows.reduce((sum, row) => sum + row.cornerThugs, 0));
      // Nobody walks off with a gun: every pistol is still at home or on a corner.
      expect(after.pistols + rows.reduce((sum, row) => sum + row.cornerPistols, 0)).toBe(18);
      expect(after.postedNetWorthCents).toBe(BigInt(rows.reduce((sum, row) => sum + row.cornerPistols, 0)) * pistolWorth);
      expect(after.thugs - after.woundedThugs - after.postedThugs - after.businessThugs).toBeGreaterThanOrEqual(0);
    });
  });
});
