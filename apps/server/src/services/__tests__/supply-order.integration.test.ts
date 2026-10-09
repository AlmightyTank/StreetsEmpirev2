import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV16B } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { SupplyOrderService } from '../supply-order.service.js';
import { DealerStaffService } from '../dealer-staff.service.js';
import { AdminSupplyService } from '../admin-supply.service.js';
import { ReputationService } from '../reputation.service.js';

describe.runIf(process.env.SUPPLY_INTEGRATION === '1')('1.6.0-B prepaid supplier orders with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let playerId = '';
  let accountId = '';

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `supply_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    accountId = registered.json().account.id;
    const round = await app.prisma.round.create({
      data: {
        name: 'Supply B fixture',
        slug: `supply-b-${randomUUID()}`,
        rulesetId: classicOgV16B.meta.id,
        rulesetVersion: classicOgV16B.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: classicOgV16B.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV16B.round.startingPlayer,
        ...startingStock(classicOgV16B),
        cashCents: 50_000_000n,
        roundId,
        accountId,
        cityId,
        displayName: name,
        publicPimpId: 8700,
        reputation: { create: ReputationService.seedFor(classicOgV16B) },
      },
    });
    playerId = player.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('charges at placement, reserves shared stock, and safely replays the durable order key', async () => {
    const round = await app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    const player = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const beforeCash = player.cashCents;
    const input = {
      supplierKey: 'west-coast-depot',
      productKey: 'WEED',
      quantity: 100,
      requestKey: randomUUID(),
      actionId: randomUUID(),
    } as const;

    const placed = await SupplyOrderService.place(app.prisma, playerId, input);
    expect(placed.result).toMatchObject({ chargedCents: 65_000, replayed: false, order: { status: 'OPEN', quantityOrdered: 100, quantityRemaining: 100 } });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cashCents).toBe(beforeCash - 65_000n);

    const replay = await SupplyOrderService.place(app.prisma, playerId, { ...input, actionId: randomUUID() });
    expect(replay.result).toMatchObject({ chargedCents: 65_000, replayed: true, order: { id: placed.result.order.id } });
    expect(await app.prisma.supplyOrder.count({ where: { roundPlayerId: playerId } })).toBe(1);
    expect(await app.prisma.economyLedgerEntry.count({ where: { roundPlayerId: playerId, source: 'SUPPLY_ORDER' } })).toBe(1);
    expect(await app.prisma.supplyMovement.count({ where: { roundPlayerId: playerId, kind: 'ORDERED' } })).toBe(1);

    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 0n } });
    await expect(SupplyOrderService.place(app.prisma, playerId, { ...input, requestKey: randomUUID(), actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'NOT_ENOUGH_CASH' });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 50_000_000n } });
    await app.prisma.supplySupplierStock.update({
      where: { roundId_supplierKey_productKey: { roundId, supplierKey: input.supplierKey, productKey: input.productKey } },
      data: { quantityAvailable: 50 },
    });
    await expect(SupplyOrderService.place(app.prisma, playerId, { ...input, requestKey: randomUUID(), actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'SUPPLY_STOCK_LOW' });
    expect(await app.prisma.supplyOrder.count({ where: { roundPlayerId: playerId } })).toBe(1);
    expect(await app.prisma.supplyMovement.count({ where: { roundPlayerId: playerId } })).toBe(1);
    await app.prisma.supplySupplierStock.update({
      where: { roundId_supplierKey_productKey: { roundId, supplierKey: input.supplierKey, productKey: input.productKey } },
      data: { quantityAvailable: 39_900 },
    });

    for (let index = 0; index < 2; index += 1) {
      await SupplyOrderService.place(app.prisma, playerId, { ...input, requestKey: randomUUID(), actionId: randomUUID() });
    }
    await expect(SupplyOrderService.place(app.prisma, playerId, { ...input, requestKey: randomUUID(), actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'SUPPLY_ORDER_LIMIT' });

    const page = await SupplyOrderService.page(app.prisma, round, player);
    expect(page.openOrderCount).toBe(3);
    expect(page.orders).toHaveLength(3);
    expect(page.orders.some((order) => order.id === placed.result.order.id)).toBe(true);
    expect(page.suppliers.find((supplier) => supplier.key === input.supplierKey)?.offers.find((offer) => offer.productKey === input.productKey)?.availableQuantity).toBe(39_700);
  });

  it('releases an individual dealer without erasing his career and allows that same career to return', async () => {
    const crew = await app.prisma.dealerCrew.create({
      data: { roundPlayerId: playerId, citySlug: 'los-angeles', districtKey: 'DOWNTOWN', capacityUnits: 1_000 },
    });
    const assigned = await DealerStaffService.assign(app.prisma, playerId, crew.id, { actionId: randomUUID() });
    const staffId = assigned.result.staff.id;
    expect(assigned.result).toMatchObject({ dealerThugs: 1, staff: { crewId: crew.id, experiencePoints: 0 } });

    await app.prisma.dealerStaff.update({ where: { id: staffId }, data: { experiencePoints: 250 } });
    const released = await DealerStaffService.release(app.prisma, playerId, staffId, { actionId: randomUUID() });
    expect(released.result).toMatchObject({ dealerThugs: 0, staff: { id: staffId, crewId: null, experiencePoints: 250 } });

    const returned = await DealerStaffService.assign(app.prisma, playerId, crew.id, { staffId, actionId: randomUUID() });
    expect(returned.result).toMatchObject({ dealerThugs: 1, staff: { id: staffId, crewId: crew.id, experiencePoints: 250, releasedAt: null } });

    const replacement = await DealerStaffService.assign(app.prisma, playerId, crew.id, { actionId: randomUUID() });
    expect(replacement.result.staff.id).not.toBe(staffId);
    expect(replacement.result.staff.experiencePoints).toBe(0);

    const report = await AdminSupplyService.report(app.prisma, roundId);
    expect(report.totals).toMatchObject({ orders: 3, openOrders: 3, dealerCrews: 1, assignedDealers: 2, supplyMovements: 3 });
    expect(report.dealerCrews[0]?.staff.map((staff) => staff.experiencePoints)).toContain(250);
  });
});
