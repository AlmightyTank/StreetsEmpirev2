import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV16C } from '@streets/rulesets';
import { runCapacity, startingStock } from '@streets/rules-engine';
import { NetWorthService } from '../net-worth.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { SupplyOrderService } from '../supply-order.service.js';
import { SupplyPickupService } from '../supply-pickup.service.js';
import { TravelService } from '../travel.service.js';

/**
 * 1.6.0-C gate, live: one order is completed across several trips; a mixed fleet's cargo
 * is counted once; a retried, failed or interrupted pickup never duplicates stock or
 * charges twice; and a load is only ever credited to the stash once, for what made it
 * home. Opt in with SUPPLY_INTEGRATION=1.
 */
describe.runIf(process.env.SUPPLY_INTEGRATION === '1')('1.6.0-C supply pickups with PostgreSQL', () => {
  const rules = classicOgV16C;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';
  let homeCityId = '';

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `pickup_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    const round = await app.prisma.round.create({
      data: {
        name: 'Supply C fixture', slug: `supply-c-${randomUUID()}`,
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
        roundId, accountId, cityId: homeCityId, displayName: name, publicPimpId: 8701,
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
    await app.prisma.supplySupplierStock.deleteMany({ where: { roundId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    const data = {
      ...rules.round.startingPlayer, ...startingStock(rules),
      thugs: 40, woundedThugs: 0, pistols: 40, lowRiders: 4, sedans: 2, vans: 2,
      turns: 500, cashCents: 500_000_000n, heat: 0, awayNetWorthCents: 0n, cityId: homeCityId,
      lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
    };
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
  });

  const player = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const order = (quantity: number, supplierKey = 'great-lakes-depot', productKey = 'WEED') => SupplyOrderService.place(app.prisma, playerId, {
    supplierKey, productKey, quantity, requestKey: randomUUID(), actionId: randomUUID(),
  });
  const pickup = (orderId: string, quantity: number, vehicleLoadout: Record<string, number>, extra: Record<string, unknown> = {}) => SupplyPickupService.dispatch(app.prisma, playerId, {
    orderId, quantity, vehicleLoadout, escortThugs: 2, route: 0, requestKey: randomUUID(), actionId: randomUUID(), ...extra,
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
  const stash = async () => (await app.prisma.supplyStock.aggregate({ where: { warehouse: { roundPlayerId: playerId } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const DAY = 24 * 60;

  it('completes one order across several trips and credits each load once', async () => {
    const placed = await order(2_000);
    const orderId = placed.result.order.id;
    const before = await player();

    // A mixed fleet counts its cargo once: one Van and one Sedan carry 1,612.
    const fleet = { VAN: 1, SEDAN: 1 };
    const capacity = runCapacity(rules, fleet);
    expect(capacity).toBe(1_612);
    expect(await pickup(orderId, capacity + 1, fleet).catch((error: { code: string }) => error.code)).toBe('TRUNK_FULL');

    const first = await pickup(orderId, capacity, fleet);
    expect(first.result).toMatchObject({ replayed: false, capacityUnits: capacity, pickup: { status: 'PLANNED', quantity: capacity } });
    const sent = await player();
    expect(sent.turns).toBe(before.turns - first.result.turns);
    expect(sent.vans).toBe(before.vans - 1);
    expect(sent.sedans).toBe(before.sedans - 1);
    expect(sent.thugs).toBe(before.thugs - 2);
    expect(sent.cashCents).toBe(before.cashCents);

    // The remaining 388 cannot be promised twice while the first load is still out.
    const firstPickup = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: first.result.pickup.id } });
    expect(await pickup(orderId, 389, { LOW_RIDER: 1 }).catch((error: { code: string }) => error.code)).toBe('SUPPLY_PICKUP_QUANTITY');

    // Retried with the same durable key, nothing is sent again.
    const replay = await SupplyPickupService.dispatch(app.prisma, playerId, {
      orderId, quantity: capacity, vehicleLoadout: fleet, escortThugs: 2, route: 0, requestKey: firstPickup.requestKey, actionId: randomUUID(),
    });
    expect(replay.result).toMatchObject({ replayed: true, pickup: { id: first.result.pickup.id } });
    expect(await app.prisma.run.count({ where: { roundPlayerId: playerId } })).toBe(1);
    expect((await player()).turns).toBe(sent.turns);

    // At the supplier the load comes off the order; reading again does not take it twice.
    await age(60);
    await settle();
    await settle();
    let row = await app.prisma.supplyOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(row).toMatchObject({ quantityCollected: capacity, status: 'PARTIALLY_COLLECTED' });
    const loaded = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: first.result.pickup.id } });
    expect(loaded.status).toBe('IN_TRANSIT');
    expect(await stash()).toBe(0);
    // In transit, the load is neither home stock nor away net worth.
    expect((await app.prisma.playerProduct.findUnique({ where: { roundPlayerId_productKey: { roundPlayerId: playerId, productKey: 'WEED' } } }))?.quantity ?? 0).toBe(0);

    // A trading or driving-on pickup run is refused: it only goes there and home.
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: playerId, status: 'ACTIVE' } });
    await expect(TravelService.trade(app.prisma, playerId, { runId: run.id, product: 'WEED', direction: 'sell', venue: 'pip', quantity: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'SUPPLY_RUN' });

    // Home: whatever is still in the trunk lands in the stash, once.
    await age(DAY);
    await settle();
    await settle();
    const home = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: first.result.pickup.id } });
    expect(home.status === 'DELIVERED' || home.status === 'FAILED').toBe(true);
    expect(home.deliveredQuantity).toBeLessThanOrEqual(capacity);
    expect(await stash()).toBe(home.deliveredQuantity);
    const back = await player();
    expect(back.vans + back.damagedVans + back.disabledVans).toBe(before.vans);
    expect(back.awayNetWorthCents).toBe(0n);

    // The rest of the order on a second trip, with the same Van.
    const second = await pickup(orderId, 2_000 - capacity, { VAN: 1 });
    await age(DAY);
    await settle();
    row = await app.prisma.supplyOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(row).toMatchObject({ quantityCollected: 2_000, status: 'FULFILLED' });
    const done = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: second.result.pickup.id } });
    expect(await stash()).toBe(home.deliveredQuantity + done.deliveredQuantity);
    expect(await pickup(orderId, 1, { VAN: 1 }).catch((error: { code: string }) => error.code)).toBe('SUPPLY_ORDER_COLLECTED');

    // The ledger reconciles: every unit picked up was either stored or lost on the road.
    const movements = await app.prisma.supplyMovement.findMany({ where: { orderId } });
    const sum = (kind: string) => movements.filter((movement) => movement.kind === kind).reduce((total, movement) => total + movement.quantityDelta, 0);
    expect(sum('PICKED_UP')).toBe(2_000);
    expect(sum('STORED')).toBe(await stash());
    expect(await app.prisma.economyLedgerEntry.count({ where: { roundPlayerId: playerId, source: 'SUPPLY_ORDER' } })).toBe(1);
  });

  it('credits only what survives the road and never more than was loaded', async () => {
    const placed = await order(1_000);
    const sent = await pickup(placed.result.order.id, 750, { LOW_RIDER: 1 });
    await age(60);
    await settle();
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, include: { cargo: true } });
    const loaded = run.cargo.find((row) => row.productKey === 'WEED')!.quantity;
    expect(loaded).toBeGreaterThan(0);
    // The police take 300 on the road home, and a convoy win adds 40 more Weed on top.
    await app.prisma.runCargo.update({ where: { runId_productKey: { runId: run.id, productKey: 'WEED' } }, data: { quantity: loaded - 300 + 40 } });
    await age(DAY);
    await settle();

    // The road home may take more still; whatever arrived is what counts.
    const arrived = (await app.prisma.runCargo.findUniqueOrThrow({ where: { runId_productKey: { runId: run.id, productKey: 'WEED' } } })).quantity;
    expect(arrived).toBeLessThanOrEqual(loaded - 300 + 40);
    const done = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: sent.result.pickup.id } });
    expect(done.deliveredQuantity).toBe(Math.min(750, arrived));
    expect(done.status).toBe(arrived > 0 ? 'DELIVERED' : 'FAILED');
    expect(await stash()).toBe(done.deliveredQuantity);
    // What rode home above the load is ordinary product.
    const weed = (await app.prisma.playerProduct.findUnique({ where: { roundPlayerId_productKey: { roundPlayerId: playerId, productKey: 'WEED' } } }))?.quantity ?? 0;
    expect(weed + done.deliveredQuantity).toBe(arrived);
    // The lost units were collected: they do not go back on the order.
    expect((await app.prisma.supplyOrder.findUniqueOrThrow({ where: { id: placed.result.order.id } })).quantityCollected).toBe(750);
  });

  it('loads a supplier in the home city straight into the stash and refuses an overfull stash', async () => {
    const detroit = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } })).id;
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cityId: detroit } });
    const placed = await order(1_000);
    const before = await player();
    const local = await pickup(placed.result.order.id, 750, { LOW_RIDER: 1 });
    expect(local.result).toMatchObject({ turns: rules.supplyNetwork.pickups.localPickupTurns, pickup: { status: 'DELIVERED', deliveredQuantity: 750, local: true } });
    expect((await player()).turns).toBe(before.turns - rules.supplyNetwork.pickups.localPickupTurns);
    expect((await player()).lowRiders).toBe(before.lowRiders);
    expect(await stash()).toBe(750);
    expect(await app.prisma.run.count({ where: { roundPlayerId: playerId } })).toBe(0);

    // A full stash, counting what is already in it, refuses the next load.
    await app.prisma.supplyWarehouse.updateMany({ where: { roundPlayerId: playerId }, data: { capacityUnits: 800 } });
    expect(await pickup(placed.result.order.id, 100, { LOW_RIDER: 1 }).catch((error: { code: string }) => error.code)).toBe('SUPPLY_STASH_FULL');
    expect(await stash()).toBe(750);

    const page = await SupplyPickupService.planning(app.prisma, rules, { ...(await player()), city: await app.prisma.city.findUniqueOrThrow({ where: { id: detroit } }) }, new Date());
    expect(page?.stash).toMatchObject({ storedUnits: 750, inboundUnits: 0, roomUnits: 50, capacityUnits: 800 });
    expect(page?.orders[0]).toMatchObject({ local: true, availableQuantity: 250, routes: [] });
  });
});
