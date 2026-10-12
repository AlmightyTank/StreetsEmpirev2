import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV16H } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { AdminSupplyCorrectionService } from '../admin-supply-correction.service.js';
import { AdminSupplyService } from '../admin-supply.service.js';
import { DealerCrewService } from '../dealer-crew.service.js';
import { NetWorthService } from '../net-worth.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { SupplyLaneService } from '../supply-lane.service.js';
import { SupplyLedgerService } from '../supply-ledger.service.js';
import { SupplyOrderService } from '../supply-order.service.js';
import { SupplyPickupService } from '../supply-pickup.service.js';
import { SupplyPropertyService } from '../supply-property.service.js';
import { SupplyReconcileService } from '../supply-reconcile.service.js';

/**
 * 1.6.0-I release gate, live: the whole loop on the latest ruleset with no admin help: order,
 * multi-trip pickups, storage, a shipment to another city, a crew stocked and selling, and a
 * lane load from abroad. Retries and replays are thrown in along the way. At the end every
 * unit and every cent reconciles, cash is exactly what the ledger says, and a staff
 * correction is audited, reconciles too, and is refused once the round is over.
 * Opt in with SUPPLY_INTEGRATION=1.
 */
describe.runIf(process.env.SUPPLY_INTEGRATION === '1')('1.6.0-I supply release loop with PostgreSQL', () => {
  const rules = classicOgV16H;
  const home = rules.round.startingCitySlug;
  const HOUR = 3_600_000;
  let app: FastifyInstance;
  let roundId = '';
  const accounts: string[] = [];
  let playerId = '';
  let admin = { id: '', username: '' };

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const register = async (prefix: string) => {
      const name = `${prefix}_${randomUUID().slice(0, 8)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      return { id: registered.json().account.id as string, username: name };
    };
    const player = await register('release');
    admin = await register('staff');
    const round = await app.prisma.round.create({
      data: { name: 'Supply I fixture', slug: `supply-i-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000) },
    });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    const data = {
      ...rules.round.startingPlayer, ...startingStock(rules),
      thugs: 40, woundedThugs: 0, pistols: 40, lowRiders: 4, sedans: 2, vans: 2, turns: 1_000, cashCents: 500_000_000n, heat: 0,
      lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
    };
    const row = await app.prisma.roundPlayer.create({
      data: { ...data, netWorthCents: NetWorthService.calculate(data, rules), roundId, accountId: player.id, cityId, displayName: player.username, publicPimpId: 8706, reputation: { create: ReputationService.seedFor(rules) } },
    });
    playerId = row.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  const player = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const settle = () => PlayerStateService.settle(app.prisma, playerId, { markActive: false });
  const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code: string }) => error.code);
  /** Every active run's stops shift `minutes` into the past. */
  const age = async (minutes: number) => {
    const stops = await app.prisma.runStop.findMany({ where: { run: { roundPlayerId: playerId, status: 'ACTIVE' } } });
    for (const stop of stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: { departAt: new Date(stop.departAt.getTime() - minutes * 60_000), arriveAt: new Date(stop.arriveAt.getTime() - minutes * 60_000), leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - minutes * 60_000) : null } });
    }
  };

  it('runs the whole loop with retries thrown in, and every unit and cent reconciles', async () => {
    const startCash = (await player()).cashCents;

    // Order, twice with the same key: one order, one charge.
    const requestKey = randomUUID();
    const placed = await SupplyOrderService.place(app.prisma, playerId, { supplierKey: 'great-lakes-depot', productKey: 'COCAINE', quantity: 2_000, requestKey, actionId: randomUUID() });
    const again = await SupplyOrderService.place(app.prisma, playerId, { supplierKey: 'great-lakes-depot', productKey: 'COCAINE', quantity: 2_000, requestKey, actionId: randomUUID() });
    expect(again.result.replayed).toBe(true);
    const orderId = placed.result.order.id;

    // Two trips home: a Van's load, then the rest. The first is retried by its key.
    const tripKey = randomUUID();
    const trip = (quantity: number, loadout: Record<string, number>, key = randomUUID()) => SupplyPickupService.dispatch(app.prisma, playerId, { orderId, quantity, vehicleLoadout: loadout, escortThugs: 2, route: 0, requestKey: key, actionId: randomUUID() });
    await trip(1_125, { VAN: 1 }, tripKey);
    expect((await trip(1_125, { VAN: 1 }, tripKey)).result.replayed).toBe(true);
    expect(await code(trip(900, { VAN: 1 }))).toBe('SUPPLY_PICKUP_QUANTITY');
    await age(60); await settle(); await age(24 * 60); await settle(); await settle();
    await trip(875, { VAN: 1 });
    await age(60); await settle(); await age(24 * 60); await settle();
    expect((await app.prisma.supplyOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('FULFILLED');
    const stash = await app.prisma.supplyWarehouse.findFirstOrThrow({ where: { roundPlayerId: playerId, kind: 'STASH' } });

    // A foothold and a warehouse in Detroit, and a shipment there from the stash.
    await SupplyPropertyService.buy(app.prisma, playerId, { kind: 'SAFEHOUSE', citySlug: 'detroit', actionId: randomUUID() });
    const detroit = (await SupplyPropertyService.buy(app.prisma, playerId, { kind: 'WAREHOUSE', citySlug: 'detroit', actionId: randomUUID() })).result.propertyId;
    const storedHome = (await app.prisma.supplyStock.findUnique({ where: { warehouseId_productKey: { warehouseId: stash.id, productKey: 'COCAINE' } } }))?.quantity ?? 0;
    if (storedHome >= 300) {
      await SupplyPickupService.ship(app.prisma, playerId, { sourceWarehouseId: stash.id, destinationWarehouseId: detroit, productKey: 'COCAINE', quantity: 300, vehicleLoadout: { LOW_RIDER: 1 }, escortThugs: 0, route: 0, requestKey: randomUUID(), actionId: randomUUID() });
      await age(60); await settle(); await age(24 * 60); await settle();
    }

    // A crew at home, stocked by one action sent twice: loaded once.
    const crew = (await DealerCrewService.establish(app.prisma, playerId, { citySlug: home, districtKey: 'NIGHTCLUB', dealers: 3, actionId: randomUUID() })).result.crew!;
    await DealerCrewService.offer(app.prisma, playerId, crew.id, { productKey: 'COCAINE', actionId: randomUUID() });
    const stockAction = randomUUID();
    const load = Math.min(1_000, (await app.prisma.supplyStock.findUnique({ where: { warehouseId_productKey: { warehouseId: stash.id, productKey: 'COCAINE' } } }))?.quantity ?? 0);
    expect(load).toBeGreaterThan(0);
    await DealerCrewService.stock(app.prisma, playerId, crew.id, { warehouseId: stash.id, direction: 'LOAD', quantity: load, actionId: stockAction });
    await DealerCrewService.stock(app.prisma, playerId, crew.id, { warehouseId: stash.id, direction: 'LOAD', quantity: load, actionId: stockAction });
    expect((await app.prisma.dealerStock.findUniqueOrThrow({ where: { dealerCrewId_productKey: { dealerCrewId: crew.id, productKey: 'COCAINE' } } })).quantity).toBe(load);

    // Ten hours of sales, settled again and again: paid once.
    await app.prisma.dealerCrew.update({ where: { id: crew.id }, data: { salesSettledAt: new Date(Date.now() - 10 * HOUR - 60_000) } });
    await settle(); await settle(); await settle();

    // A lane load from abroad lands at the stash.
    const lane = await SupplyLaneService.ship(app.prisma, playerId, { supplierKey: 'monterrey-connection', productKey: 'COCAINE', quantity: 1_000, route: 'AIR', warehouseKey: stash.id, requestKey: randomUUID(), actionId: randomUUID() });
    await app.prisma.supplyPickup.update({ where: { id: lane.result.pickup.id }, data: { expectedArrivalAt: new Date(Date.now() - 60_000) } });
    await settle(); await settle();

    // Everything reconciles: units, receipts, payouts, supplier stock.
    expect(await SupplyReconcileService.round(app.prisma, roundId)).toEqual([]);

    // Cash is exactly the start less every supply cost plus every sale, by the economy ledger.
    const ledger = await app.prisma.economyLedgerEntry.groupBy({ by: ['source'], where: { roundPlayerId: playerId }, _sum: { amountCents: true } });
    const total = ledger.reduce((sum, row) => sum + (row._sum.amountCents ?? 0n), 0n);
    expect((await player()).cashCents).toBe(startCash + total);
    const books = await SupplyLedgerService.ledger(app.prisma, playerId);
    expect(books.unitsSold).toBeGreaterThan(0);
    const soldNet = await app.prisma.dealerSale.aggregate({ where: { dealerCrewId: crew.id }, _sum: { netCents: true } });
    expect(ledger.find((row) => row.source === 'DEALER_SALES')?._sum.amountCents).toBe(soldNet._sum.netCents);

    // The admin view shows it all, with no problems.
    const report = await AdminSupplyService.report(app.prisma, roundId);
    expect(report.problems).toEqual([]);
    expect(report.shipmentStates.some((row) => row.kind === 'LANE')).toBe(true);
    expect(report.dealerEconomics[0]).toMatchObject({ crewId: crew.id, unitsSold: books.unitsSold });
    expect(report.stockByCity.length).toBeGreaterThan(0);
  });

  it('catches stock changed outside the ledger, and an audited correction puts it right', async () => {
    const stash = await app.prisma.supplyWarehouse.findFirstOrThrow({ where: { roundPlayerId: playerId, kind: 'STASH' } });
    const row = await app.prisma.supplyStock.findUniqueOrThrow({ where: { warehouseId_productKey: { warehouseId: stash.id, productKey: 'COCAINE' } } });
    // Someone edits the table directly: the ledger no longer agrees.
    await app.prisma.supplyStock.update({ where: { id: row.id }, data: { quantity: row.quantity + 50 } });
    const problems = await SupplyReconcileService.player(app.prisma, playerId);
    expect(problems).toEqual([expect.objectContaining({ code: 'WAREHOUSE_STOCK', severity: 'ERROR' })]);

    // Staff set it back, with a reason: audited, written to the ledger, and clean again.
    const fixed = await AdminSupplyCorrectionService.adjust(app.prisma, admin, playerId, { target: 'WAREHOUSE', targetId: stash.id, productKey: 'COCAINE', quantity: row.quantity - 10, reason: 'Counted short after a reported spill.' });
    expect(fixed).toMatchObject({ before: row.quantity + 50, after: row.quantity - 10, delta: -60, problems: [] });
    expect(await app.prisma.adminAuditLog.count({ where: { action: 'supply.stock-adjust', targetId: stash.id } })).toBe(1);
    // The ledger moved from its own figure to the count, so the place reconciles again.
    const corrected = await app.prisma.supplyMovement.findFirstOrThrow({ where: { roundPlayerId: playerId, kind: 'CORRECTED' } });
    expect(corrected.quantityDelta).toBe(-10);
    expect(await SupplyReconcileService.round(app.prisma, roundId)).toEqual([]);
    // Nobody corrects their own player, and a finished round is frozen.
    const self = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, select: { accountId: true } });
    expect(await code(AdminSupplyCorrectionService.adjust(app.prisma, { id: self.accountId, username: 'self' }, playerId, { target: 'WAREHOUSE', targetId: stash.id, productKey: 'COCAINE', quantity: 1, reason: 'Mine.' }))).toBe('ADMIN_SELF_ACTION');
    await app.prisma.round.update({ where: { id: roundId }, data: { status: 'ENDED' } });
    expect(await code(AdminSupplyCorrectionService.adjust(app.prisma, admin, playerId, { target: 'WAREHOUSE', targetId: stash.id, productKey: 'COCAINE', quantity: 1, reason: 'Too late.' }))).toBe('ROUND_FINISHED');
    await app.prisma.round.update({ where: { id: roundId }, data: { status: 'ACTIVE' } });
  });
});
