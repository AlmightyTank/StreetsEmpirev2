import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV16F } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { DealerCrewService } from '../dealer-crew.service.js';
import { NetWorthService } from '../net-worth.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { SupplyLedgerService } from '../supply-ledger.service.js';
import { homeStash } from '../supply-pickup-settle.service.js';
import { SupplyPickupService } from '../supply-pickup.service.js';
import { SupplyPropertyService } from '../supply-property.service.js';

/**
 * 1.6.0-F gate, live: repeated sale settles never oversell, never make cash from no stock,
 * and only ever count whole intervals of server time; stock reaches another city only by
 * shipment. Opt in with SUPPLY_INTEGRATION=1.
 */
describe.runIf(process.env.SUPPLY_INTEGRATION === '1')('1.6.0-F dealer sales with PostgreSQL', () => {
  const rules = classicOgV16F;
  const home = rules.round.startingCitySlug;
  const HOUR = 3_600_000;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';
  let homeCityId = '';

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `sales_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    const round = await app.prisma.round.create({
      data: {
        name: 'Supply F fixture', slug: `supply-f-${randomUUID()}`,
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    homeCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId, cityId: homeCityId, displayName: name, publicPimpId: 8704,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.run.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplyMovement.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplyPickup.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.dealerStaff.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.dealerCrew.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplyWarehouse.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplySafehouse.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.economyLedgerEntry.deleteMany({ where: { roundPlayerId: playerId } });
    const data = {
      ...rules.round.startingPlayer, ...startingStock(rules),
      thugs: 40, woundedThugs: 0, dealerThugs: 0, lowRiders: 4, vans: 2, turns: 500, cashCents: 500_000_000n, heat: 0, cityId: homeCityId,
      lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
    };
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
  });

  const player = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code: string }) => error.code);
  const settle = () => PlayerStateService.settle(app.prisma, playerId, { markActive: false });
  const seed = async (citySlug: string, quantity: number) => {
    const stash = await homeStash(app.prisma, playerId, citySlug, 12_000);
    await app.prisma.supplyStock.upsert({ where: { warehouseId_productKey: { warehouseId: stash.id, productKey: 'COCAINE' } }, create: { warehouseId: stash.id, productKey: 'COCAINE', quantity }, update: { quantity } });
    return stash.id;
  };
  /** A working, priced, stocked crew whose clock last settled `hoursAgo` ago. */
  const crewSelling = async (stock: number, hoursAgo: number, dealers = 3) => {
    const crew = (await DealerCrewService.establish(app.prisma, playerId, { citySlug: home, districtKey: 'NIGHTCLUB', dealers, actionId: randomUUID() })).result.crew!;
    const local = await seed(home, 5_000);
    await DealerCrewService.offer(app.prisma, playerId, crew.id, { productKey: 'COCAINE', actionId: randomUUID() });
    const stocked = stock ? (await DealerCrewService.stock(app.prisma, playerId, crew.id, { warehouseId: local, direction: 'LOAD', quantity: stock, actionId: randomUUID() })).result.crew! : crew;
    await app.prisma.dealerCrew.update({ where: { id: crew.id }, data: { salesSettledAt: new Date(Date.now() - hoursAgo * HOUR - 60_000), salesCarry: 0 } });
    return stocked;
  };
  const crewRow = (id: string) => app.prisma.dealerCrew.findUniqueOrThrow({ where: { id }, include: { inventory: true, staff: true } });
  const held = (crew: Awaited<ReturnType<typeof crewRow>>) => crew.inventory.reduce((sum, row) => sum + row.quantity, 0);

  it('sells whole hours once, takes exactly what it sold, and pays after the cut and wages', async () => {
    const crew = await crewSelling(1_000, 5);
    const pace = crew.pace;
    const before = await player();
    await settle();
    await settle();
    const after = await crewRow(crew.id);
    const sales = await app.prisma.dealerSale.findMany({ where: { dealerCrewId: crew.id } });
    const sold = sales.reduce((sum, row) => sum + row.quantity, 0);
    expect(sold).toBe(Math.floor(pace.unitsPerHour * 5 + 1e-9));
    expect(held(after)).toBe(1_000 - sold);
    const net = sales.reduce((sum, row) => sum + row.netCents, 0n);
    const wages = BigInt(5 * 3 * rules.supplyNetwork.dealers.operatingCentsPerDealerHour);
    expect((await player()).cashCents).toBe(before.cashCents + net - wages);
    expect(sales.every((row) => row.grossCents === BigInt(row.quantity) * BigInt(row.unitPriceCents))).toBe(true);
    // Experience: one point a unit, shared by the dealers who sold.
    expect(after.staff.reduce((sum, row) => sum + row.experiencePoints, 0)).toBe(sold);
    // The clock moved exactly five hours, and a part hour waits.
    expect(after.salesSettledAt!.getTime()).toBeLessThan(Date.now() - 50_000);
    const ledger = await SupplyLedgerService.ledger(app.prisma, playerId);
    expect(ledger).toMatchObject({ unitsSold: sold, wagesCents: Number(wages) });
    expect(ledger.stock.withCrews).toBe(1_000 - sold);
    const history = await SupplyLedgerService.history(app.prisma, rules, playerId);
    expect(history.find((item) => item.kind === 'SOLD')).toMatchObject({ units: sold, text: expect.stringContaining('sold') });
  });

  it('never oversells, and never makes cash from no stock', async () => {
    const crew = await crewSelling(10, 48);
    await settle();
    expect(held(await crewRow(crew.id))).toBe(0);
    expect((await app.prisma.dealerSale.aggregate({ where: { dealerCrewId: crew.id }, _sum: { quantity: true } }))._sum.quantity).toBe(10);
    const cash = (await player()).cashCents;
    // Another day empty: wages only, not a cent of sales.
    await app.prisma.dealerCrew.update({ where: { id: crew.id }, data: { salesSettledAt: new Date(Date.now() - 24 * HOUR - 60_000) } });
    await settle();
    expect((await app.prisma.dealerSale.aggregate({ where: { dealerCrewId: crew.id }, _sum: { quantity: true } }))._sum.quantity).toBe(10);
    expect((await player()).cashCents).toBe(cash - BigInt(24 * 3 * rules.supplyNetwork.dealers.operatingCentsPerDealerHour));
  });

  it('counts only whole intervals, and a paused crew sells and costs nothing', async () => {
    const crew = await crewSelling(500, 0);
    await settle();
    expect(await app.prisma.dealerSale.count({ where: { dealerCrewId: crew.id } })).toBe(0);
    await DealerCrewService.manage(app.prisma, playerId, crew.id, { action: 'PAUSE', actionId: randomUUID() });
    await app.prisma.dealerCrew.update({ where: { id: crew.id }, data: { salesSettledAt: new Date(Date.now() - 10 * HOUR) } });
    const cash = (await player()).cashCents;
    await settle();
    expect((await player()).cashCents).toBe(cash);
    // Resuming starts the clock fresh: the paused hours never sell.
    await DealerCrewService.manage(app.prisma, playerId, crew.id, { action: 'RESUME', actionId: randomUUID() });
    await settle();
    expect(await app.prisma.dealerSale.count({ where: { dealerCrewId: crew.id } })).toBe(0);
  });

  it('sends an unpaid crew home instead of running cash below zero', async () => {
    const crew = await crewSelling(0, 6);
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 1_000n } });
    await settle();
    expect((await player()).cashCents).toBe(0n);
    expect((await crewRow(crew.id)).status).toBe('PAUSED');
  });

  it('restocks another city only by shipment, and the units leave their warehouse at once', async () => {
    const local = await seed(home, 2_000);
    await SupplyPropertyService.buy(app.prisma, playerId, { kind: 'SAFEHOUSE', citySlug: 'detroit', actionId: randomUUID() });
    const detroit = (await SupplyPropertyService.buy(app.prisma, playerId, { kind: 'WAREHOUSE', citySlug: 'detroit', actionId: randomUUID() })).result.propertyId;
    const ship = (destinationWarehouseId: string, quantity: number) => SupplyPickupService.ship(app.prisma, playerId, {
      sourceWarehouseId: local, destinationWarehouseId, productKey: 'COCAINE', quantity, vehicleLoadout: { VAN: 1 }, escortThugs: 0, route: 0, requestKey: randomUUID(), actionId: randomUUID(),
    });
    expect(await code(ship(local, 100))).toBe('SAME_CITY');
    expect(await code(ship(detroit, 1_126))).toBe('TRUNK_FULL');
    const sent = await ship(detroit, 1_000);
    expect(sent.result.pickup).toMatchObject({ shipment: true, status: 'IN_TRANSIT', destinationCitySlug: 'detroit' });
    // Gone from the source now: nothing else can load or ship those units.
    expect((await app.prisma.supplyStock.findUniqueOrThrow({ where: { warehouseId_productKey: { warehouseId: local, productKey: 'COCAINE' } } })).quantity).toBe(1_000);
    expect((await SupplyLedgerService.ledger(app.prisma, playerId)).stock.inTransit).toBe(1_000);

    // Fifty minutes to Detroit: it unloads there, and only what arrived is stored.
    const stops = await app.prisma.runStop.findMany({ where: { run: { roundPlayerId: playerId, status: 'ACTIVE' } } });
    for (const stop of stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: { departAt: new Date(stop.departAt.getTime() - HOUR), arriveAt: new Date(stop.arriveAt.getTime() - HOUR), leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - HOUR) : null } });
    }
    await settle();
    const landed = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: sent.result.pickup.id } });
    expect(landed.status === 'DELIVERED' || landed.status === 'FAILED').toBe(true);
    const there = await app.prisma.supplyStock.findUnique({ where: { warehouseId_productKey: { warehouseId: detroit, productKey: 'COCAINE' } } });
    expect(there?.quantity ?? 0).toBe(landed.deliveredQuantity);
    expect(landed.deliveredQuantity).toBeLessThanOrEqual(1_000);
  });
});
