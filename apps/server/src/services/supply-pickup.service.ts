import type { City, Prisma, PrismaClient, RoundPlayer, SupplyOrder, SupplyPickup } from '@prisma/client';
import {
  RunError,
  armEscorts,
  findRoutes,
  planLaunch,
  planSupplyPickup,
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
} from '@streets/rules-engine';
import type { SupplyPickupRules } from '@streets/rulesets';
import {
  formatNumber,
  supplyPickupSchema,
  type SupplyPickupDispatchResult,
  type SupplyPickupDto,
  type SupplyPickupOrderPlanDto,
  type SupplyPickupPlanningDto,
  type SupplyStashDto,
  type SupplyVehicleClassId,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { hideoutGarageRunLimit, hideoutWeaponPriority } from './hideout.service.js';
import { awayWorth, writeRunStops } from './run-settle.service.js';
import { HOME_STASH_NAME, homeStash } from './supply-pickup-settle.service.js';
import { supplyOrderDto } from './supply-order.service.js';

/**
 * 1.6.0-C. Collecting a paid order in vehicle loads. A pickup is a run that drives empty to
 * the supplier, takes on one load and drives home; the load rides the road like any other
 * cargo, and what is left of it lands in the home stash (supply-pickup-settle.service).
 * Nothing about the load is decided here but its size: the road decides the rest.
 */

const CLASSES = ['LOW_RIDER', 'SEDAN', 'VAN'] as const satisfies readonly SupplyVehicleClassId[];
type Loadout = Record<SupplyVehicleClassId, number>;
/** A local pickup has no road. */
const LOCAL_ROUTE = 'local';
const ACTIVE = ['PLANNED', 'IN_TRANSIT'] as const;

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

function pickupDto(ruleset: Ruleset, row: SupplyPickup & { order: Pick<SupplyOrder, 'productKey' | 'supplierKey'> }): SupplyPickupDto {
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
    destinationCityName: cityName(ruleset, row.destinationCitySlug),
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

/** Stored and inbound units at a warehouse: inbound loads hold their room until they land. */
async function warehouseLoad(db: Db | PrismaClient, warehouseId: string): Promise<{ stored: number; inbound: number }> {
  const [stock, inbound] = await Promise.all([
    db.supplyStock.aggregate({ where: { warehouseId }, _sum: { quantity: true } }),
    db.supplyPickup.aggregate({ where: { warehouseId, status: { in: [...ACTIVE] } }, _sum: { quantity: true } }),
  ]);
  return { stored: stock._sum.quantity ?? 0, inbound: inbound._sum.quantity ?? 0 };
}

async function stashDto(db: Db | PrismaClient, ruleset: Ruleset, rules: SupplyPickupRules, roundPlayerId: string, citySlug: string): Promise<SupplyStashDto> {
  const stash = await db.supplyWarehouse.findUnique({
    where: { roundPlayerId_citySlug_name: { roundPlayerId, citySlug, name: HOME_STASH_NAME } },
    include: { stock: { orderBy: { productKey: 'asc' } } },
  });
  const capacityUnits = stash?.capacityUnits ?? rules.homeStashUnits;
  const { stored, inbound } = stash ? await warehouseLoad(db, stash.id) : { stored: 0, inbound: 0 };
  return {
    name: HOME_STASH_NAME,
    citySlug,
    cityName: cityName(ruleset, citySlug),
    capacityUnits,
    storedUnits: stored,
    inboundUnits: inbound,
    roomUnits: Math.max(0, capacityUnits - stored - inbound),
    stock: (stash?.stock ?? []).filter((row) => row.quantity > 0).map((row) => ({ productKey: row.productKey, productName: productName(ruleset, row.productKey), quantity: row.quantity })),
  };
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
    const [orders, pickups, activeRuns, stash] = await Promise.all([
      db.supplyOrder.findMany({ where: { roundPlayerId: player.id, status: { in: ['OPEN', 'PARTIALLY_COLLECTED'] } }, orderBy: { createdAt: 'asc' } }),
      db.supplyPickup.findMany({ where: { order: { roundPlayerId: player.id } }, include: { order: { select: { productKey: true, supplierKey: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
      stashDto(db, ruleset, rules, player.id, home),
    ]);
    const reserved = await reservedByOrder(db, orders.map((order) => order.id));
    const cargoPerLowRider = ruleset.travel?.cargoPerLowRider ?? 0;

    const plans: SupplyPickupOrderPlanDto[] = orders.map((order) => {
      const local = order.supplierCitySlug === home;
      const held = reserved.get(order.id) ?? 0;
      const routes = local || !runRules(ruleset) ? [] : findRoutes(ruleset, home, order.supplierCitySlug).flatMap((route, index) => {
        try {
          const plan = planLaunch(ruleset, { home, to: order.supplierCitySlug, routeIndex: index, now });
          const back = plan.stops[plan.stops.length - 1]!;
          return [{
            index,
            cities: route.cities.map((slug) => ({ slug, name: cityName(ruleset, slug) })),
            gameMinutes: route.gameMinutes,
            roundTripMinutes: Math.round((back.arriveAt.getTime() - now.getTime()) / 60_000),
            turns: plan.turns,
            police: route.police,
            risk: supplyRouteRisk(route.police),
            arriveAt: plan.stops[0]!.arriveAt.toISOString(),
            backAt: back.arriveAt.toISOString(),
          }];
        } catch {
          return [];
        }
      });
      return {
        orderId: order.id,
        local,
        availableQuantity: Math.max(0, order.quantityOrdered - order.quantityCollected - held),
        reservedQuantity: held,
        routes,
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
      stash,
      orders: plans,
      pickups: [...active, ...done].map((row) => pickupDto(ruleset, row)),
    };
  },

  /**
   * Send vehicles for one load of a paid order. From a supplier in another city this is a
   * run there and back, paid in turns like any run; from one in the player's own city the
   * load goes straight into the stash. Either way the load is held against the order and
   * the stash's room from now on, so two pickups can never claim the same units.
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
        const prior = await tx.supplyPickup.findUnique({
          where: { orderId_requestKey: { orderId: order.id, requestKey: input.requestKey } },
          include: { order: { select: { productKey: true, supplierKey: true } } },
        });
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

        // The load: what the order still has, what the fleet carries, what the stash can take.
        const home = player.city.slug;
        const local = order.supplierCitySlug === home;
        const capacity = runCapacity(ruleset, loadout, racketCargoShare(ruleset, readRacketEffects(player.racketEffects)));
        const reserved = (await reservedByOrder(tx, [order.id])).get(order.id) ?? 0;
        const available = order.quantityOrdered - order.quantityCollected - reserved;
        const stash = await homeStash(tx, roundPlayerId, home, rules.homeStashUnits);
        const { stored, inbound } = await warehouseLoad(tx, stash.id);
        const room = Math.max(0, stash.capacityUnits - stored - inbound);
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
            ? `Your ${HOME_STASH_NAME.toLowerCase()} has room for ${formatNumber(room)} more units, counting loads on the way.`
            : `Your ${HOME_STASH_NAME.toLowerCase()} is full, counting loads on the way.`);
        }
        planSupplyPickup({ orderQuantity: order.quantityOrdered, collectedQuantity: order.quantityCollected, reservedQuantity: reserved, requestedQuantity: input.quantity, capacityUnits: capacity, storageRoomUnits: room });

        const product = productName(ruleset, order.productKey);
        const supplier = supplierName(ruleset, order.supplierKey);
        const base = {
          orderId: order.id,
          originCitySlug: order.supplierCitySlug,
          destinationCitySlug: home,
          quantity: input.quantity,
          vehicleLoadout: loadout,
          requestKey: input.requestKey,
          dispatchedAt: now,
          warehouseId: stash.id,
        };

        if (local) {
          // Off the dock and into the stash: no road, so nothing between can go wrong.
          assertTurns(current.turns, rules.localPickupTurns);
          const collected = order.quantityCollected + input.quantity;
          const updated = await tx.supplyOrder.update({ where: { id: order.id }, data: { quantityCollected: collected, status: supplyOrderStatus(order.quantityOrdered, collected) } });
          await tx.supplyStock.upsert({
            where: { warehouseId_productKey: { warehouseId: stash.id, productKey: order.productKey } },
            create: { warehouseId: stash.id, productKey: order.productKey, quantity: input.quantity },
            update: { quantity: { increment: input.quantity } },
          });
          const pickup = await tx.supplyPickup.create({
            data: { ...base, routeKey: LOCAL_ROUTE, status: 'DELIVERED', loadedAt: now, expectedArrivalAt: now, deliveredAt: now, deliveredQuantity: input.quantity },
            include: { order: { select: { productKey: true, supplierKey: true } } },
          });
          await tx.supplyMovement.createMany({
            data: [
              { roundPlayerId, kind: 'PICKED_UP', productKey: order.productKey, quantityDelta: input.quantity, fromLocation: `order:${order.id}`, toLocation: `local:${home}`, orderId: order.id, pickupId: pickup.id, requestKey: `pickup:${pickup.id}:PICKED_UP`, metadata: { supplierKey: order.supplierKey, local: true }, createdAt: now },
              { roundPlayerId, kind: 'STORED', productKey: order.productKey, quantityDelta: input.quantity, fromLocation: `local:${home}`, toLocation: `warehouse:${stash.id}`, orderId: order.id, pickupId: pickup.id, warehouseId: stash.id, requestKey: `pickup:${pickup.id}:STORED`, metadata: { loaded: input.quantity, lost: 0 }, createdAt: now },
            ],
          });
          return {
            next: { ...current, turns: current.turns - rules.localPickupTurns },
            result: { pickup: pickupDto(ruleset, pickup), order: supplyOrderDto(ruleset, updated), turns: rules.localPickupTurns, capacityUnits: capacity, risk: null, replayed: false },
            ledger: [],
          };
        }

        // A run to the supplier and home: the same limits and costs as any run.
        if (!runRules(ruleset)) throw AppError.conflict('RUNS_DISABLED', 'Nobody drives out of town this round.');
        const activeCount = await tx.run.count({ where: { roundPlayerId, status: 'ACTIVE' } });
        const limit = hideoutGarageRunLimit(ruleset, player);
        if (activeCount >= limit) {
          throw AppError.conflict('RUN_LIMIT', limit === 1
            ? 'You already have a run out. Build the Garage or wait for it to come home.'
            : `Your Garage supports ${limit} active runs, and they are already out.`);
        }
        let plan;
        try {
          plan = planLaunch(ruleset, { home, to: order.supplierCitySlug, routeIndex: input.route, now });
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
        const [out, back] = plan.stops;
        const pickup = await tx.supplyPickup.create({
          data: { ...base, runId: run.id, routeKey: plan.route.cities.join('>'), status: 'PLANNED', expectedArrivalAt: back!.arriveAt },
          include: { order: { select: { productKey: true, supplierKey: true } } },
        });
        const risk = supplyRouteRisk(plan.route.police, vehicleRiskMultiplier(ruleset, loadout));
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
            awayNetWorthCents: current.awayNetWorthCents + awayWorth(ruleset, { cashCents: 0n, beer: 0, lowRiders: vehicleCount, escortThugs: input.escortThugs, ...guns }, {}),
          },
          result: { pickup: pickupDto(ruleset, pickup), order: supplyOrderDto(ruleset, order), turns: plan.turns, capacityUnits: capacity, risk, replayed: false },
          ledger: [],
          // A pickup is a run: it counts for everything that counts runs.
          activity: {
            type: 'RUN_LAUNCHED',
            payload: {
              runId: run.id,
              city: order.supplierCitySlug,
              cityName: cityName(ruleset, order.supplierCitySlug),
              cities: [cityName(ruleset, order.supplierCitySlug)],
              route: plan.route.cities,
              arriveAt: out!.arriveAt.toISOString(),
              leaveAt: out!.leaveAt!.toISOString(),
              backAt: back!.arriveAt.toISOString(),
              turns: plan.turns,
              lowRiders: vehicleCount,
              escortThugs: input.escortThugs,
              cashCents: 0,
              beer: 0,
              cargo: {},
              bossAboard: false,
              supplyPickup: { pickupId: pickup.id, orderId: order.id, supplier, product, productKey: order.productKey, quantity: input.quantity },
            },
          },
        };
      },
    });
  },
};
