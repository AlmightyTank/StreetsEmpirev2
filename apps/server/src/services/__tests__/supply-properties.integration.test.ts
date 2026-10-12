import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV16D } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { NetWorthService } from '../net-worth.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { SupplyOrderService } from '../supply-order.service.js';
import { SupplyPickupService } from '../supply-pickup.service.js';
import { SupplyPropertyService } from '../supply-property.service.js';
import { TravelService } from '../travel.service.js';

/**
 * 1.6.0-D gate, live: a warehouse cannot be overfilled, the same room cannot be promised
 * twice, and stock reaches a distant warehouse only by driving there. Properties cost a
 * price and upkeep and make nothing. Opt in with SUPPLY_INTEGRATION=1.
 */
describe.runIf(process.env.SUPPLY_INTEGRATION === '1')('1.6.0-D supply properties with PostgreSQL', () => {
  const rules = classicOgV16D;
  const props = rules.supplyNetwork.properties;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';
  let homeCityId = '';

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `props_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    const round = await app.prisma.round.create({
      data: {
        name: 'Supply D fixture', slug: `supply-d-${randomUUID()}`,
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    homeCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId, cityId: homeCityId, displayName: name, publicPimpId: 8702,
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
    await app.prisma.supplyOrder.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplyWarehouse.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplySafehouse.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplySupplierStock.deleteMany({ where: { roundId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.economyLedgerEntry.deleteMany({ where: { roundPlayerId: playerId } });
    const data = {
      ...rules.round.startingPlayer, ...startingStock(rules),
      thugs: 40, woundedThugs: 0, pistols: 40, lowRiders: 4, sedans: 2, vans: 2,
      turns: 500, cashCents: 500_000_000n, heat: 0, awayNetWorthCents: 0n, cityId: homeCityId,
      lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
    };
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
  });

  const player = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code: string }) => error.code);
  const buy = (kind: 'WAREHOUSE' | 'SAFEHOUSE', citySlug: string) => SupplyPropertyService.buy(app.prisma, playerId, { kind, citySlug, actionId: randomUUID() });
  const order = (quantity: number, supplierKey = 'great-lakes-depot', productKey = 'WEED') => SupplyOrderService.place(app.prisma, playerId, {
    supplierKey, productKey, quantity, requestKey: randomUUID(), actionId: randomUUID(),
  });
  const pickup = (orderId: string, quantity: number, vehicleLoadout: Record<string, number>, warehouseId?: string) => SupplyPickupService.dispatch(app.prisma, playerId, {
    orderId, quantity, vehicleLoadout, escortThugs: 2, route: 0, requestKey: randomUUID(), actionId: randomUUID(), ...(warehouseId ? { warehouseId } : {}),
  });
  /** Every stop of the player's active runs shifts `minutes` into the past. */
  const age = async (minutes: number) => {
    const stops = await app.prisma.runStop.findMany({ where: { run: { roundPlayerId: playerId, status: 'ACTIVE' } } });
    for (const stop of stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: {
        departAt: new Date(stop.departAt.getTime() - minutes * 60_000),
        arriveAt: new Date(stop.arriveAt.getTime() - minutes * 60_000),
        leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - minutes * 60_000) : null,
      } });
    }
  };
  const settle = () => PlayerStateService.settle(app.prisma, playerId, { markActive: false });
  const stored = async (warehouseId: string) => (await app.prisma.supplyStock.aggregate({ where: { warehouseId }, _sum: { quantity: true } }))._sum.quantity ?? 0;

  it('sells a warehouse away from home only to a player with a safehouse there, within the limits', async () => {
    expect(await code(buy('WAREHOUSE', 'atlanta'))).toBe('NO_FOOTHOLD');
    expect(await code(buy('SAFEHOUSE', rules.round.startingCitySlug))).toBe('HOME_FOOTHOLD');
    const before = await player();
    const safehouse = await buy('SAFEHOUSE', 'atlanta');
    expect(safehouse.result).toMatchObject({ action: 'BOUGHT', chargedCents: props.cities.atlanta!.safehouse.costCents });
    const warehouse = await buy('WAREHOUSE', 'atlanta');
    expect((await player()).cashCents).toBe(before.cashCents - BigInt(props.cities.atlanta!.safehouse.costCents + props.cities.atlanta!.warehouse.costCents));
    expect(await code(buy('WAREHOUSE', 'atlanta'))).toBe('PROPERTY_OWNED');
    // The home city needs no safehouse.
    await buy('WAREHOUSE', rules.round.startingCitySlug);
    await buy('SAFEHOUSE', 'detroit');
    await buy('SAFEHOUSE', 'seattle');
    expect(await code(buy('SAFEHOUSE', 'miami-beach'))).toBe('PROPERTY_LIMIT');
    await buy('WAREHOUSE', 'detroit');
    expect(await code(buy('WAREHOUSE', 'seattle'))).toBe('PROPERTY_LIMIT');

    // A safehouse cannot close under its warehouse; an empty warehouse closes, and nothing is refunded.
    const cash = (await player()).cashCents;
    expect(await code(SupplyPropertyService.close(app.prisma, playerId, { kind: 'SAFEHOUSE', propertyId: safehouse.result.propertyId, actionId: randomUUID() }))).toBe('SAFEHOUSE_IN_USE');
    await SupplyPropertyService.close(app.prisma, playerId, { kind: 'WAREHOUSE', propertyId: warehouse.result.propertyId, actionId: randomUUID() });
    await SupplyPropertyService.close(app.prisma, playerId, { kind: 'SAFEHOUSE', propertyId: safehouse.result.propertyId, actionId: randomUUID() });
    expect((await player()).cashCents).toBe(cash);
    expect(await app.prisma.economyLedgerEntry.count({ where: { roundPlayerId: playerId, source: 'SUPPLY_PROPERTY' } })).toBe(6);
  });

  it('drives a load on to a warehouse in a third city, and only then lets the run head home', async () => {
    await buy('SAFEHOUSE', 'atlanta');
    const atlanta = (await buy('WAREHOUSE', 'atlanta')).result.propertyId;
    const placed = await order(2_000);
    const sent = await pickup(placed.result.order.id, 1_125, { VAN: 1 }, atlanta);
    expect(sent.result.pickup).toMatchObject({ status: 'PLANNED', destinationCitySlug: 'atlanta' });
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, include: { stops: { orderBy: { order: 'asc' } } } });
    expect(run.stops.map((stop) => stop.city)).toEqual(['detroit', 'atlanta', rules.round.startingCitySlug]);

    // At the supplier: loaded, and the run cannot cut for home with the load aboard.
    await age(60);
    await settle();
    expect((await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: sent.result.pickup.id } })).status).toBe('IN_TRANSIT');
    expect(await code(TravelService.headHome(app.prisma, playerId, { runId: run.id, actionId: randomUUID() }))).toBe('SUPPLY_RUN_EN_ROUTE');
    expect(await stored(atlanta)).toBe(0);

    // In Atlanta: what is aboard comes off into the warehouse there, not the stash at home.
    await age(120 + 60);
    await settle();
    await settle();
    const landed = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: sent.result.pickup.id } });
    expect(landed.status === 'DELIVERED' || landed.status === 'FAILED').toBe(true);
    expect(await stored(atlanta)).toBe(landed.deliveredQuantity);
    const trunk = await app.prisma.runCargo.findUnique({ where: { runId_productKey: { runId: run.id, productKey: 'WEED' } } });
    expect(trunk?.quantity ?? 0).toBe(0);
    // Unloaded, it may head home now; and it brings nothing more.
    await TravelService.headHome(app.prisma, playerId, { runId: run.id, actionId: randomUUID() });
    await age(24 * 60);
    await settle();
    expect(await stored(atlanta)).toBe(landed.deliveredQuantity);
    expect(await app.prisma.supplyStock.count({ where: { warehouse: { roundPlayerId: playerId, kind: 'STASH' } } })).toBe(0);
    expect((await player()).awayNetWorthCents).toBe(0n);
  });

  it('loads and unloads at once in the supplier city, and loads at home for a local supplier', async () => {
    await buy('SAFEHOUSE', 'detroit');
    const detroit = (await buy('WAREHOUSE', 'detroit')).result.propertyId;
    const placed = await order(1_000);
    const sent = await pickup(placed.result.order.id, 750, { LOW_RIDER: 1 }, detroit);
    await age(60);
    await settle();
    const done = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: sent.result.pickup.id } });
    // Loaded and unloaded on the same dock: nothing rode a road with it.
    expect(done).toMatchObject({ status: 'DELIVERED', deliveredQuantity: 750 });
    expect(await stored(detroit)).toBe(750);

    // Living in Detroit, a load for Atlanta goes on as the run leaves.
    await age(24 * 60);
    await settle();
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cityId: (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } })).id } });
    await buy('SAFEHOUSE', 'atlanta');
    const atlanta = (await buy('WAREHOUSE', 'atlanta')).result.propertyId;
    const out = await pickup(placed.result.order.id, 250, { LOW_RIDER: 1 }, atlanta);
    expect(out.result.pickup.status).toBe('IN_TRANSIT');
    expect((await app.prisma.supplyOrder.findUniqueOrThrow({ where: { id: placed.result.order.id } })).status).toBe('FULFILLED');
  });

  it('never promises the same room twice, and says what will not fit', async () => {
    const placed = await order(10_000, 'west-coast-depot');
    const stashRoom = rules.supplyNetwork.pickups.homeStashUnits;
    // Two Vans and two Sedans carry 3,225 a trip; four trips would overfill the 12,000 stash.
    for (let trip = 0; trip < 3; trip += 1) {
      await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { vans: 2, sedans: 2, turns: 500 } });
      await app.prisma.run.updateMany({ where: { roundPlayerId: playerId }, data: { status: 'RETURNED', returnedAt: new Date() } });
      await pickup(placed.result.order.id, 3_225, { VAN: 2, SEDAN: 2 });
    }
    await app.prisma.run.updateMany({ where: { roundPlayerId: playerId }, data: { status: 'RETURNED', returnedAt: new Date() } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { vans: 2, sedans: 2 } });
    const second = await order(4_000);
    const refused = await pickup(second.result.order.id, 3_225, { VAN: 2, SEDAN: 2 }).catch((error: { code: string; message: string }) => error);
    expect(refused).toMatchObject({ code: 'SUPPLY_STASH_FULL' });
    expect((refused as { message: string }).message).toContain(`${(3 * 3_225 + 3_225 - stashRoom).toLocaleString('en-US')} would not fit`);
  });

  it('charges upkeep per period, falls behind when cash runs out, and a property behind takes no deliveries', async () => {
    await buy('SAFEHOUSE', 'atlanta');
    const atlanta = (await buy('WAREHOUSE', 'atlanta')).result.propertyId;
    const day = 24 * 3_600_000;
    const past = new Date(Date.now() - 2.5 * day);
    await app.prisma.supplyWarehouse.update({ where: { id: atlanta }, data: { paidThrough: past } });
    await app.prisma.supplySafehouse.updateMany({ where: { roundPlayerId: playerId }, data: { paidThrough: past } });
    const before = (await player()).cashCents;
    await settle();
    await settle();
    const upkeep = BigInt(props.cities.atlanta!.warehouse.upkeepCents + props.cities.atlanta!.safehouse.upkeepCents) * 3n;
    expect((await player()).cashCents).toBe(before - upkeep);
    expect((await app.prisma.supplyWarehouse.findUniqueOrThrow({ where: { id: atlanta } })).paidThrough!.getTime()).toBe(past.getTime() + 3 * day);

    // Broke: the warehouse falls behind and refuses deliveries; the safehouse stops being a foothold.
    const placed = await order(100);
    await app.prisma.supplyWarehouse.update({ where: { id: atlanta }, data: { paidThrough: new Date(Date.now() - 1_000) } });
    await app.prisma.supplySafehouse.updateMany({ where: { roundPlayerId: playerId }, data: { paidThrough: new Date(Date.now() - 1_000) } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 0n } });
    expect(await code(pickup(placed.result.order.id, 100, { LOW_RIDER: 1 }, atlanta))).toBe('WAREHOUSE_BEHIND');
    const page = await SupplyPickupService.planning(app.prisma, rules, { ...(await player()), city: await app.prisma.city.findUniqueOrThrow({ where: { id: homeCityId } }) }, new Date());
    expect(page?.storage.find((entry) => entry.key === atlanta)).toMatchObject({ behind: true });
    expect(page?.orders[0]?.destinations.map((entry) => entry.key)).not.toContain(atlanta);
    expect(page?.properties?.cities.find((city) => city.citySlug === 'atlanta')).toMatchObject({ foothold: false });
  });
});
