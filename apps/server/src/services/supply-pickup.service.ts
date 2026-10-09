import type { City, Prisma, PrismaClient, RoundPlayer, SupplyOrder, SupplyPickup, SupplyStock, SupplyWarehouse } from '@prisma/client';
import {
  RunError,
  armEscorts,
  findRoutes,
  planSupplyPickup,
  planSupplyRun,
  racketCargoShare,
  readRacketEffects,
  routeProfileRisk,
  runCapacity,
  runRules,
  supplyOrderStatus,
  supplyRouteRisk,
  vehicleLoadoutSeats,
  vehicleRiskMultiplier,
  type Ruleset,
  type SupplyRunPlan,
} from '@streets/rules-engine';
import type { SupplyPickupRules } from '@streets/rulesets';
import {
  formatNumber,
  supplyPickupSchema,
  type SupplyPickupDispatchResult,
  type SupplyPickupDto,
  type SupplyPickupOrderPlanDto,
  type SupplyPickupPlanningDto,
  type SupplyRouteOptionDto,
  type SupplyStashDto,
  type SupplyVehicleClassId,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { hideoutGarageRunLimit, hideoutWeaponPriority } from './hideout.service.js';
import { awayWorth, writeRunStops } from './run-settle.service.js';
import { HOME_STASH_NAME, homeStash, loadPickupOntoRun } from './supply-pickup-settle.service.js';
import { propertyBehind } from './supply-property-settle.service.js';
import { SupplyPropertyService } from './supply-property.service.js';
import { supplyOrderDto } from './supply-order.service.js';

/**
 * 1.6.0-C/D. Collecting a paid order in vehicle loads. A pickup is a run that drives to the
 * supplier, takes on one load, drives it to its warehouse (from 1.6.0-D any the player
 * owns, or the home stash) and comes home. The load rides the road like any other cargo,
 * and what is left of it lands in storage (supply-pickup-settle.service). Nothing about the
 * load is decided here but its size and where it goes: the road decides the rest.
 */

const CLASSES = ['LOW_RIDER', 'SEDAN', 'VAN'] as const satisfies readonly SupplyVehicleClassId[];
type Loadout = Record<SupplyVehicleClassId, number>;
/** A local pickup has no road. */
const LOCAL_ROUTE = 'local';
const ACTIVE = ['PLANNED', 'IN_TRANSIT'] as const;
/** The home stash's key before anything has landed in it. */
const STASH_KEY = 'stash';

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const productName = (ruleset: Ruleset, key: string) => (key === 'CRACK'
  ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack'
  : ruleset.products?.[key]?.name ?? key);
const supplierName = (ruleset: Ruleset, key: string) => ruleset.supplyNetwork?.suppliers?.find((supplier) => supplier.key === key)?.name ?? key;
const className = (ruleset: Ruleset, classId: SupplyVehicleClassId) => ruleset.vehicleCatalog?.classes.find((entry) => entry.id === classId)?.name
  ?? (classId === 'LOW_RIDER' ? 'Low-Rider' : classId === 'SEDAN' ? 'Sedan' : 'Van');

function pickupRules(ruleset: Ruleset): SupplyPickupRules | undefined {
  return ruleset.supplyNetwork?.enabled ? ruleset.supplyNetwork.pickups : undefined;
}

function readLoadout(value: Prisma.JsonValue): Loadout {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(CLASSES.map((classId) => [classId, typeof raw[classId] === 'number' ? raw[classId] as number : 0])) as Loadout;
}

type PickupRow = SupplyPickup & { order: Pick<SupplyOrder, 'productKey' | 'supplierKey'>; warehouse: Pick<SupplyWarehouse, 'name'> | null };
const PICKUP_INCLUDE = { order: { select: { productKey: true, supplierKey: true } }, warehouse: { select: { name: true } } } as const;

function pickupDto(ruleset: Ruleset, row: PickupRow): SupplyPickupDto {
  const finished = row.status === 'DELIVERED' || row.status === 'FAILED';
  return {
    id: row.id,
    orderId: row.orderId,
    runId: row.runId,
    productKey: row.order.productKey,
    productName: productName(ruleset, row.order.productKey),
    supplierName: supplierName(ruleset, row.order.supplierKey),
    originCitySlug: row.originCitySlug,
    originCityName: cityName(ruleset, row.originCitySlug),
    destinationCitySlug: row.destinationCitySlug,
    destinationCityName: cityName(ruleset, row.destinationCitySlug),
    warehouseName: row.warehouse?.name ?? HOME_STASH_NAME,
    quantity: row.quantity,
    deliveredQuantity: row.deliveredQuantity,
    lostQuantity: finished ? row.quantity - row.deliveredQuantity : 0,
    vehicleLoadout: readLoadout(row.vehicleLoadout),
    status: row.status,
    local: row.routeKey === LOCAL_ROUTE,
    dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
    loadedAt: row.loadedAt?.toISOString() ?? null,
    expectedArrivalAt: row.expectedArrivalAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
  };
}

/** Units promised to pickups still driving out, by order. Loaded units are already collected. */
async function reservedByOrder(db: Db | PrismaClient, orderIds: readonly string[]): Promise<Map<string, number>> {
  if (!orderIds.length) return new Map();
  const rows = await db.supplyPickup.groupBy({ by: ['orderId'], where: { orderId: { in: [...orderIds] }, status: 'PLANNED' }, _sum: { quantity: true } });
  return new Map(rows.map((row) => [row.orderId, row._sum.quantity ?? 0]));
}

/** Units on their way to each warehouse: inbound loads hold their room until they land. */
async function inboundByWarehouse(db: Db | PrismaClient, warehouseIds: readonly string[]): Promise<Map<string, number>> {
  if (!warehouseIds.length) return new Map();
  const rows = await db.supplyPickup.groupBy({ by: ['warehouseId'], where: { warehouseId: { in: [...warehouseIds] }, status: { in: [...ACTIVE] } }, _sum: { quantity: true } });
  return new Map(rows.flatMap((row) => (row.warehouseId ? [[row.warehouseId, row._sum.quantity ?? 0] as const] : [])));
}

function storageDto(ruleset: Ruleset, row: SupplyWarehouse & { stock: SupplyStock[] }, inbound: number, now: Date): SupplyStashDto {
  const stored = row.stock.reduce((sum, item) => sum + item.quantity, 0);
  return {
    key: row.id,
    kind: row.kind,
    name: row.name,
    citySlug: row.citySlug,
    cityName: cityName(ruleset, row.citySlug),
    capacityUnits: row.capacityUnits,
    storedUnits: stored,
    inboundUnits: inbound,
    roomUnits: Math.max(0, row.capacityUnits - stored - inbound),
    stock: row.stock.filter((item) => item.quantity > 0).sort((a, b) => a.productKey.localeCompare(b.productKey))
      .map((item) => ({ productKey: item.productKey, productName: productName(ruleset, item.productKey), quantity: item.quantity })),
    upkeepCents: Number(row.upkeepCents),
    paidThrough: row.paidThrough?.toISOString() ?? null,
    behind: row.kind === 'WAREHOUSE' && propertyBehind(row.paidThrough, now),
  };
}

/** Every place the player stores supply, the home stash first (even before anything lands in it). */
async function storageList(db: Db | PrismaClient, ruleset: Ruleset, rules: SupplyPickupRules, roundPlayerId: string, home: string, now: Date): Promise<SupplyStashDto[]> {
  const rows = await db.supplyWarehouse.findMany({ where: { roundPlayerId, isActive: true }, include: { stock: true }, orderBy: { createdAt: 'asc' } });
  const inbound = await inboundByWarehouse(db, rows.map((row) => row.id));
  const stashRow = rows.find((row) => row.kind === 'STASH' && row.citySlug === home && row.name === HOME_STASH_NAME);
  const stash: SupplyStashDto = stashRow ? storageDto(ruleset, stashRow, inbound.get(stashRow.id) ?? 0, now) : {
    key: STASH_KEY, kind: 'STASH', name: HOME_STASH_NAME, citySlug: home, cityName: cityName(ruleset, home),
    capacityUnits: rules.homeStashUnits, storedUnits: 0, inboundUnits: 0, roomUnits: rules.homeStashUnits, stock: [],
    upkeepCents: 0, paidThrough: null, behind: false,
  };
  return [stash, ...rows.filter((row) => row !== stashRow).map((row) => storageDto(ruleset, row, inbound.get(row.id) ?? 0, now))];
}

/** A storage place a pickup can be sent to: the home stash, or a paid-up bought warehouse. */
function acceptsDeliveries(storage: SupplyStashDto, home: string): boolean {
  return storage.kind === 'STASH' ? storage.citySlug === home : !storage.behind;
}

function routeDto(ruleset: Ruleset, plan: SupplyRunPlan, now: Date): SupplyRouteOptionDto {
  const first = plan.stops[0]!;
  const back = plan.stops[plan.stops.length - 1]!;
  return {
    index: 0,
    cities: plan.route.cities.map((slug) => ({ slug, name: cityName(ruleset, slug) })),
    stops: plan.stops.map((stop) => ({ slug: stop.city, name: cityName(ruleset, stop.city) })),
    gameMinutes: plan.route.gameMinutes,
    roundTripMinutes: Math.round((back.arriveAt.getTime() - now.getTime()) / 60_000),
    turns: plan.turns,
    police: plan.police,
    risk: supplyRouteRisk(plan.police),
    arriveAt: first.arriveAt.toISOString(),
    backAt: back.arriveAt.toISOString(),
  };
}

/** The ways a load from `origin` can reach `destination`, leaving home now. */
function supplyRoutes(ruleset: Ruleset, home: string, origin: string, destination: string, now: Date): SupplyRouteOptionDto[] {
  if (!runRules(ruleset) || (origin === home && destination === home)) return [];
  const first = origin === home ? destination : origin;
  return findRoutes(ruleset, home, first).flatMap((_, index) => {
    try {
      return [{ ...routeDto(ruleset, planSupplyRun(ruleset, { home, origin, destination, routeIndex: index, now }), now), index }];
    } catch {
      return [];
    }
  });
}

function refuse(error: unknown): never {
  if (error instanceof RunError) throw AppError.badRequest(error.code, error.message, error.field ? { route: error.message } : undefined);
  throw error;
}

export const SupplyPickupService = {
  /** What the Supply page needs to plan a pickup. Null when pickups are not part of the round. */
  async planning(db: Db | PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: City }, now: Date): Promise<SupplyPickupPlanningDto | null> {
    const rules = pickupRules(ruleset);
    if (!rules) return null;
    const home = player.city.slug;
    const [orders, pickups, activeRuns, storage, properties] = await Promise.all([
      db.supplyOrder.findMany({ where: { roundPlayerId: player.id, status: { in: ['OPEN', 'PARTIALLY_COLLECTED'] } }, orderBy: { createdAt: 'asc' } }),
      db.supplyPickup.findMany({ where: { order: { roundPlayerId: player.id } }, include: PICKUP_INCLUDE, orderBy: { createdAt: 'desc' }, take: 20 }),
      db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
      storageList(db, ruleset, rules, player.id, home, now),
      SupplyPropertyService.market(db, ruleset, player, now),
    ]);
    const reserved = await reservedByOrder(db, orders.map((order) => order.id));
    const cargoPerLowRider = ruleset.travel?.cargoPerLowRider ?? 0;
    const destinations = storage.filter((entry) => acceptsDeliveries(entry, home));

    const plans: SupplyPickupOrderPlanDto[] = orders.map((order) => {
      const held = reserved.get(order.id) ?? 0;
      const ways = destinations.map((entry) => ({
        key: entry.key,
        local: order.supplierCitySlug === home && entry.citySlug === home,
        routes: supplyRoutes(ruleset, home, order.supplierCitySlug, entry.citySlug, now),
      }));
      return {
        orderId: order.id,
        local: order.supplierCitySlug === home,
        availableQuantity: Math.max(0, order.quantityOrdered - order.quantityCollected - held),
        reservedQuantity: held,
        routes: ways[0]?.routes ?? [],
        destinations: ways,
      };
    });

    const catalog = ruleset.vehicleCatalog?.classes;
    const vehicles = catalog?.length
      ? catalog.map((vehicleClass) => ({
          classId: vehicleClass.id,
          name: vehicleClass.name,
          ready: player[vehicleClass.legacyResource],
          cargoUnits: cargoPerLowRider * (vehicleClass.cargoPercent ?? 100) / 100,
          crewSeats: vehicleClass.crewSeats ?? ruleset.lowRiderThugCapacity,
          routeProfile: vehicleClass.routeProfile ?? 'NORMAL',
          routeRiskPercent: Math.round((routeProfileRisk(ruleset, vehicleClass.routeProfile) - 1) * 100),
        }))
      : [{ classId: 'LOW_RIDER' as const, name: 'Low-Rider', ready: player.lowRiders, cargoUnits: cargoPerLowRider, crewSeats: ruleset.lowRiderThugCapacity, routeProfile: 'NORMAL' as const, routeRiskPercent: 0 }];

    const active = pickups.filter((row) => (ACTIVE as readonly string[]).includes(row.status));
    const done = pickups.filter((row) => !(ACTIVE as readonly string[]).includes(row.status));
    return {
      homeCitySlug: home,
      homeCityName: cityName(ruleset, home),
      turns: player.turns,
      fitThugs: fitThugs(player),
      runLimit: hideoutGarageRunLimit(ruleset, player),
      activeRuns,
      cargoShare: racketCargoShare(ruleset, readRacketEffects(player.racketEffects)),
      localPickupTurns: rules.localPickupTurns,
      townWindowMinutes: runRules(ruleset)?.townWindowMinutes ?? 0,
      vehicles,
      stash: storage[0]!,
      storage,
      properties,
      orders: plans,
      pickups: [...active, ...done].map((row) => pickupDto(ruleset, row)),
    };
  },

  /**
   * Send vehicles for one load of a paid order. When the supplier and the warehouse are both
   * in the player's own city the load goes straight in; otherwise it is a run, paid in turns
   * like any run: out to the supplier, on to the warehouse when that is elsewhere, and home.
   * The load is held against the order and the warehouse's room from now on, so two pickups
   * can never claim the same units or the same space.
   */
  dispatch(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown) {
    const input = supplyPickupSchema.parse(rawInput);
    return ActionService.run<SupplyPickupDispatchResult>(prisma, roundPlayerId, {
      action: 'SUPPLY_PICKUP',
      idempotencyScope: 'SUPPLY_PICKUP',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player, now }) => {
        const rules = pickupRules(ruleset);
        if (!rules) throw AppError.notFound('SUPPLY_PICKUPS_DISABLED', 'Supply pickups are not available in this round.');
        const order = await tx.supplyOrder.findFirst({ where: { id: input.orderId, roundPlayerId } });
        if (!order) throw AppError.notFound('SUPPLY_ORDER_NOT_FOUND', 'That paid order is not yours.');
        const loadout: Loadout = { LOW_RIDER: input.vehicleLoadout.LOW_RIDER ?? 0, SEDAN: input.vehicleLoadout.SEDAN ?? 0, VAN: input.vehicleLoadout.VAN ?? 0 };

        // A durable key answers with the pickup it already made, long after the action cache.
        const prior = await tx.supplyPickup.findUnique({ where: { orderId_requestKey: { orderId: order.id, requestKey: input.requestKey } }, include: PICKUP_INCLUDE });
        if (prior) {
          const same = CLASSES.every((classId) => readLoadout(prior.vehicleLoadout)[classId] === loadout[classId]);
          if (!same) throw AppError.conflict('SUPPLY_REQUEST_KEY_REUSED', 'That pickup request key was already used for a different pickup.');
          return {
            next: current,
            result: { pickup: pickupDto(ruleset, prior), order: supplyOrderDto(ruleset, order), turns: 0, capacityUnits: 0, risk: null, replayed: true },
            ledger: [],
          };
        }

        if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_COLLECTED') {
          throw AppError.conflict('SUPPLY_ORDER_COLLECTED', 'That order has nothing left to collect.');
        }

        // The fleet: ready at home, of classes this round has.
        const vehicleCount = CLASSES.reduce((sum, classId) => sum + loadout[classId], 0);
        if (vehicleCount < 1) throw AppError.badRequest('NO_VEHICLES_SELECTED', 'Choose at least one vehicle for this pickup.', { vehicleLoadout: 'Pick a vehicle.' });
        const owned: Loadout = { LOW_RIDER: current.lowRiders, SEDAN: current.sedans, VAN: current.vans };
        for (const classId of CLASSES) {
          if (loadout[classId] > 0 && classId !== 'LOW_RIDER' && !ruleset.vehicleCatalog?.classes.some((entry) => entry.id === classId)) {
            throw AppError.conflict('VEHICLE_CLASS_UNAVAILABLE', `${className(ruleset, classId)}s are not available in this round.`);
          }
          if (loadout[classId] > owned[classId]) {
            const name = className(ruleset, classId);
            throw AppError.badRequest('NOT_ENOUGH_VEHICLES', `You have ${owned[classId]} ${name}${owned[classId] === 1 ? '' : 's'} ready at home.`, { vehicleLoadout: `At most ${owned[classId]} ${name}${owned[classId] === 1 ? '' : 's'}.` });
          }
        }

        // Where it goes: a paid-up warehouse of the player's, or the home stash.
        const home = player.city.slug;
        let destination;
        if (input.warehouseId) {
          destination = await tx.supplyWarehouse.findFirst({ where: { id: input.warehouseId, roundPlayerId, isActive: true } });
          if (!destination) throw AppError.notFound('WAREHOUSE_NOT_FOUND', 'That warehouse is not yours.');
          if (destination.kind === 'STASH' && destination.citySlug !== home) {
            throw AppError.conflict('WAREHOUSE_CLOSED_TO_DELIVERIES', 'Your old home stash takes no new deliveries.');
          }
          if (destination.kind === 'WAREHOUSE' && propertyBehind(destination.paidThrough, now)) {
            throw AppError.conflict('WAREHOUSE_BEHIND', `Your ${cityName(ruleset, destination.citySlug)} warehouse is behind on upkeep. It takes no deliveries until it is paid.`);
          }
        } else {
          destination = await homeStash(tx, roundPlayerId, home, rules.homeStashUnits);
        }
        const where = destination.kind === 'STASH' ? HOME_STASH_NAME.toLowerCase() : `${cityName(ruleset, destination.citySlug)} warehouse`;

        // The load: what the order still has, what the fleet carries, what the warehouse can take.
        const capacity = runCapacity(ruleset, loadout, racketCargoShare(ruleset, readRacketEffects(player.racketEffects)));
        const reserved = (await reservedByOrder(tx, [order.id])).get(order.id) ?? 0;
        const available = order.quantityOrdered - order.quantityCollected - reserved;
        const [stock, inbound] = await Promise.all([
          tx.supplyStock.aggregate({ where: { warehouseId: destination.id }, _sum: { quantity: true } }),
          inboundByWarehouse(tx, [destination.id]),
        ]);
        const room = Math.max(0, destination.capacityUnits - (stock._sum.quantity ?? 0) - (inbound.get(destination.id) ?? 0));
        if (input.quantity > available) {
          throw AppError.badRequest('SUPPLY_PICKUP_QUANTITY', available > 0
            ? `Only ${formatNumber(available)} units of this order are left to send for.`
            : 'Every unit of this order is already loaded or has a pickup on the way.', { quantity: `At most ${available}.` });
        }
        if (input.quantity > capacity) {
          throw AppError.badRequest('TRUNK_FULL', `These vehicles carry ${formatNumber(capacity)} units.`, { quantity: `At most ${capacity}.` });
        }
        if (input.quantity > room) {
          throw AppError.conflict('SUPPLY_STASH_FULL', room > 0
            ? `Your ${where} has room for ${formatNumber(room)} more units, counting loads on the way. ${formatNumber(input.quantity - room)} would not fit.`
            : `Your ${where} is full, counting loads on the way.`);
        }
        planSupplyPickup({ orderQuantity: order.quantityOrdered, collectedQuantity: order.quantityCollected, reservedQuantity: reserved, requestedQuantity: input.quantity, capacityUnits: capacity, storageRoomUnits: room });

        const product = productName(ruleset, order.productKey);
        const supplier = supplierName(ruleset, order.supplierKey);
        const base = {
          orderId: order.id,
          originCitySlug: order.supplierCitySlug,
          destinationCitySlug: destination.citySlug,
          quantity: input.quantity,
          vehicleLoadout: loadout,
          requestKey: input.requestKey,
          dispatchedAt: now,
          warehouseId: destination.id,
        };

        if (order.supplierCitySlug === home && destination.citySlug === home) {
          // Off the dock and into storage: no road, so nothing between can go wrong.
          assertTurns(current.turns, rules.localPickupTurns);
          const collected = order.quantityCollected + input.quantity;
          const updated = await tx.supplyOrder.update({ where: { id: order.id }, data: { quantityCollected: collected, status: supplyOrderStatus(order.quantityOrdered, collected) } });
          await tx.supplyStock.upsert({
            where: { warehouseId_productKey: { warehouseId: destination.id, productKey: order.productKey } },
            create: { warehouseId: destination.id, productKey: order.productKey, quantity: input.quantity },
            update: { quantity: { increment: input.quantity } },
          });
          const pickup = await tx.supplyPickup.create({
            data: { ...base, routeKey: LOCAL_ROUTE, status: 'DELIVERED', loadedAt: now, expectedArrivalAt: now, deliveredAt: now, deliveredQuantity: input.quantity },
            include: PICKUP_INCLUDE,
          });
          await tx.supplyMovement.createMany({
            data: [
              { roundPlayerId, kind: 'PICKED_UP', productKey: order.productKey, quantityDelta: input.quantity, fromLocation: `order:${order.id}`, toLocation: `local:${home}`, orderId: order.id, pickupId: pickup.id, requestKey: `pickup:${pickup.id}:PICKED_UP`, metadata: { supplierKey: order.supplierKey, local: true }, createdAt: now },
              { roundPlayerId, kind: 'STORED', productKey: order.productKey, quantityDelta: input.quantity, fromLocation: `local:${home}`, toLocation: `warehouse:${destination.id}`, orderId: order.id, pickupId: pickup.id, warehouseId: destination.id, requestKey: `pickup:${pickup.id}:STORED`, metadata: { loaded: input.quantity, lost: 0 }, createdAt: now },
            ],
          });
          return {
            next: { ...current, turns: current.turns - rules.localPickupTurns },
            result: { pickup: pickupDto(ruleset, pickup), order: supplyOrderDto(ruleset, updated), turns: rules.localPickupTurns, capacityUnits: capacity, risk: null, replayed: false },
            ledger: [],
          };
        }

        // A run: the same limits and costs as any run.
        if (!runRules(ruleset)) throw AppError.conflict('RUNS_DISABLED', 'Nobody drives out of town this round.');
        const activeCount = await tx.run.count({ where: { roundPlayerId, status: 'ACTIVE' } });
        const limit = hideoutGarageRunLimit(ruleset, player);
        if (activeCount >= limit) {
          throw AppError.conflict('RUN_LIMIT', limit === 1
            ? 'You already have a run out. Build the Garage or wait for it to come home.'
            : `Your Garage supports ${limit} active runs, and they are already out.`);
        }
        let plan: SupplyRunPlan;
        try {
          plan = planSupplyRun(ruleset, { home, origin: order.supplierCitySlug, destination: destination.citySlug, routeIndex: input.route, now });
        } catch (error) { refuse(error); }
        assertTurns(current.turns, plan.turns);
        const seats = vehicleLoadoutSeats(ruleset, loadout);
        const fit = fitThugs(current);
        if (input.escortThugs > Math.min(fit, seats)) {
          const why = input.escortThugs > seats ? `These vehicles seat ${seats} thugs.` : `You have ${fit} fit thugs at home.`;
          throw AppError.badRequest('TOO_MANY_ESCORTS', why, { escortThugs: why });
        }
        // Escorts ride armed, one gun each, the best first, as on any run.
        const guns = ruleset.travel?.convoys
          ? armEscorts(ruleset, input.escortThugs, current, hideoutWeaponPriority(ruleset, current))
          : { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
        const run = await tx.run.create({
          data: {
            roundPlayerId,
            homeCity: home,
            lowRiders: vehicleCount,
            vehicleLoadout: loadout,
            escortThugs: input.escortThugs,
            ...guns,
            cashCents: 0n,
            startCashCents: 0n,
            turnsSpent: plan.turns,
            launchedAt: now,
          },
        });
        await writeRunStops(tx, run.id, plan.stops);
        const unload = plan.stops[plan.unloadStop]!;
        const created = await tx.supplyPickup.create({
          data: { ...base, runId: run.id, routeKey: plan.stops.map((stop) => stop.city).join('>'), status: 'PLANNED', expectedArrivalAt: unload.arriveAt },
          include: { order: true },
        });
        // From a supplier in the home city, the load goes on as the run leaves.
        if (plan.loadStop === -1) await loadPickupOntoRun(tx, roundPlayerId, run.id, created, now);
        const pickup = await tx.supplyPickup.findUniqueOrThrow({ where: { id: created.id }, include: PICKUP_INCLUDE });
        const risk = supplyRouteRisk(plan.police, vehicleRiskMultiplier(ruleset, loadout));
        const first = plan.stops[0]!;
        const back = plan.stops[plan.stops.length - 1]!;
        return {
          next: {
            ...current,
            turns: current.turns - plan.turns,
            lowRiders: current.lowRiders - loadout.LOW_RIDER,
            sedans: current.sedans - loadout.SEDAN,
            vans: current.vans - loadout.VAN,
            thugs: current.thugs - input.escortThugs,
            pistols: current.pistols - guns.pistols,
            shotguns: current.shotguns - guns.shotguns,
            tek9s: current.tek9s - guns.tek9s,
            ak47s: current.ak47s - guns.ak47s,
            // A supply load is never away worth: only the cars, escorts and guns count.
            awayNetWorthCents: current.awayNetWorthCents + awayWorth(ruleset, { cashCents: 0n, beer: 0, lowRiders: vehicleCount, escortThugs: input.escortThugs, ...guns }, {}),
          },
          result: { pickup: pickupDto(ruleset, pickup), order: supplyOrderDto(ruleset, order), turns: plan.turns, capacityUnits: capacity, risk, replayed: false },
          ledger: [],
          // A pickup is a run: it counts for everything that counts runs.
          activity: {
            type: 'RUN_LAUNCHED',
            payload: {
              runId: run.id,
              city: first.city,
              cityName: cityName(ruleset, first.city),
              cities: plan.stops.slice(0, -1).map((stop) => cityName(ruleset, stop.city)),
              route: plan.route.cities,
              arriveAt: first.arriveAt.toISOString(),
              leaveAt: first.leaveAt!.toISOString(),
              backAt: back.arriveAt.toISOString(),
              turns: plan.turns,
              lowRiders: vehicleCount,
              escortThugs: input.escortThugs,
              cashCents: 0,
              beer: 0,
              cargo: {},
              bossAboard: false,
              supplyPickup: {
                pickupId: pickup.id, orderId: order.id, supplier, product, productKey: order.productKey, quantity: input.quantity,
                destination: destination.citySlug === home ? null : cityName(ruleset, destination.citySlug),
              },
            },
          },
        };
      },
    });
  },
};
