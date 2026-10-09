import type { SupplyOrder, SupplyPickup } from '@prisma/client';
import { settleSupplyPickup, supplyOrderStatus, type Ruleset, type RunStopPlan } from '@streets/rules-engine';
import type { RunSupplyPickupDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import type { LoadedRun } from './run-settle.service.js';

/**
 * 1.6.0-C/D. The moments a pickup run changes the supply ledger, called while its run
 * settles: the load comes off the supplier's dock when the run reaches the supplier, and
 * what is left of it goes into its warehouse when the run reaches that warehouse's city
 * (on the way, or home). Each is keyed by the pickup's state, so settling twice never
 * loads or delivers twice.
 */

/** One free stash per player and city, where pickups land when no warehouse is picked. */
export const HOME_STASH_NAME = 'Home stash';
/** 1.6.0-D. A bought warehouse; one per city. */
export const WAREHOUSE_NAME = 'Warehouse';

const productName = (ruleset: Ruleset, key: string) => (key === 'CRACK'
  ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack'
  : ruleset.products?.[key]?.name ?? key);
const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

/** The player's stash in a city, created on first use at the round's size. */
export async function homeStash(tx: Db, roundPlayerId: string, citySlug: string, capacityUnits: number) {
  return tx.supplyWarehouse.upsert({
    where: { roundPlayerId_citySlug_name: { roundPlayerId, citySlug, name: HOME_STASH_NAME } },
    create: { roundPlayerId, citySlug, name: HOME_STASH_NAME, capacityUnits, kind: 'STASH' },
    update: {},
  });
}

type PickupWithOrder = SupplyPickup & { order: SupplyOrder | null };

/**
 * Put one pickup's load on its run: the order counts the units as collected from here on,
 * whether or not they make it to storage. A shipment's units already left their warehouse
 * at dispatch, so they simply go aboard. `at` is when the load went on.
 */
export async function loadPickupOntoRun(tx: Db, roundPlayerId: string, runId: string, pickup: PickupWithOrder, at: Date): Promise<number> {
  const { order } = pickup;
  if (!order) {
    await tx.runCargo.upsert({
      where: { runId_productKey: { runId, productKey: pickup.productKey } },
      create: { runId, productKey: pickup.productKey, quantity: pickup.quantity, startQuantity: 0 },
      update: { quantity: { increment: pickup.quantity } },
    });
    await tx.supplyPickup.update({ where: { id: pickup.id }, data: { status: 'IN_TRANSIT', loadedAt: at } });
    return pickup.quantity;
  }
  const load = Math.min(pickup.quantity, order.quantityOrdered - order.quantityCollected);
  if (order.status === 'CANCELLED' || load <= 0) {
    await tx.supplyPickup.update({ where: { id: pickup.id }, data: { status: 'CANCELLED' } });
    return 0;
  }
  const collected = order.quantityCollected + load;
  await tx.supplyOrder.update({
    where: { id: order.id },
    data: { quantityCollected: collected, status: supplyOrderStatus(order.quantityOrdered, collected) },
  });
  await tx.runCargo.upsert({
    where: { runId_productKey: { runId, productKey: order.productKey } },
    create: { runId, productKey: order.productKey, quantity: load, startQuantity: 0 },
    update: { quantity: { increment: load } },
  });
  await tx.supplyPickup.update({ where: { id: pickup.id }, data: { status: 'IN_TRANSIT', quantity: load, loadedAt: at } });
  await tx.supplyMovement.create({
    data: {
      roundPlayerId,
      kind: 'PICKED_UP',
      productKey: order.productKey,
      quantityDelta: load,
      fromLocation: `order:${order.id}`,
      toLocation: `run:${runId}`,
      orderId: order.id,
      pickupId: pickup.id,
      requestKey: `pickup:${pickup.id}:PICKED_UP`,
      metadata: { supplierKey: order.supplierKey, supplierCitySlug: order.supplierCitySlug },
      createdAt: at,
    },
  });
  return load;
}

export interface SupplyDelivery {
  pickupId: string;
  productKey: string;
  productName: string;
  loaded: number;
  delivered: number;
  lost: number;
}

/** Credit what arrived of a load to a warehouse and close the pickup. */
async function credit(
  tx: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  pickup: SupplyPickup,
  runId: string,
  warehouseId: string,
  arrived: number,
  at: Date,
): Promise<SupplyDelivery & { extra: number }> {
  const key = pickup.productKey;
  const outcome = settleSupplyPickup(pickup.quantity, arrived);
  if (outcome.delivered > 0) {
    await tx.supplyStock.upsert({
      where: { warehouseId_productKey: { warehouseId, productKey: key } },
      create: { warehouseId, productKey: key, quantity: outcome.delivered },
      update: { quantity: { increment: outcome.delivered } },
    });
    await tx.supplyMovement.create({
      data: {
        roundPlayerId,
        kind: 'STORED',
        productKey: key,
        quantityDelta: outcome.delivered,
        fromLocation: `run:${runId}`,
        toLocation: `warehouse:${warehouseId}`,
        orderId: pickup.orderId,
        pickupId: pickup.id,
        warehouseId,
        requestKey: `pickup:${pickup.id}:STORED`,
        metadata: { loaded: pickup.quantity, lost: outcome.lost },
        createdAt: at,
      },
    });
  }
  await tx.supplyPickup.update({
    where: { id: pickup.id },
    data: { status: outcome.status, deliveredQuantity: outcome.delivered, deliveredAt: at, warehouseId },
  });
  return { pickupId: pickup.id, productKey: key, productName: productName(ruleset, key), loaded: pickup.quantity, delivered: outcome.delivered, lost: outcome.lost, extra: outcome.extra };
}

/**
 * Walk a pickup run's stops as they are reached: roll the road into each (`roll` rolls the
 * legs up to a count), then load what waits there and unload what goes there. Home is the
 * last stop and is left to `deliverSupplyPickups`, as the run comes home.
 */
export async function settleSupplyStops(
  tx: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  run: LoadedRun,
  stops: readonly RunStopPlan[],
  now: Date,
  roll: (run: LoadedRun, legs: number) => Promise<LoadedRun>,
): Promise<LoadedRun> {
  const open = await tx.supplyPickup.count({ where: { runId: run.id, status: { in: ['PLANNED', 'IN_TRANSIT'] } } });
  if (!open) return run;
  let current = run;
  for (let index = 0; index < stops.length - 1; index++) {
    const stop = stops[index]!;
    if (stop.arriveAt.getTime() > now.getTime()) break;
    current = await roll(current, index + 1);
    let changed = false;
    const waiting = await tx.supplyPickup.findMany({ where: { runId: run.id, status: 'PLANNED', originCitySlug: stop.city }, include: { order: true }, orderBy: { createdAt: 'asc' } });
    for (const pickup of waiting) {
      await loadPickupOntoRun(tx, roundPlayerId, run.id, pickup, stop.arriveAt);
      changed = true;
    }
    if (stop.city !== current.homeCity) {
      const arriving = await tx.supplyPickup.findMany({
        where: { runId: run.id, status: 'IN_TRANSIT', destinationCitySlug: stop.city },
        orderBy: { createdAt: 'asc' },
      });
      for (const pickup of arriving) {
        const cargo = await tx.runCargo.findUnique({ where: { runId_productKey: { runId: run.id, productKey: pickup.productKey } } });
        const warehouseId = pickup.warehouseId ?? (await homeStash(tx, roundPlayerId, current.homeCity, Math.max(1, ruleset.supplyNetwork?.pickups?.homeStashUnits ?? pickup.quantity))).id;
        const done = await credit(tx, roundPlayerId, ruleset, pickup, run.id, warehouseId, cargo?.quantity ?? 0, stop.arriveAt);
        if (cargo) await tx.runCargo.update({ where: { id: cargo.id }, data: { quantity: done.extra } });
        changed = true;
      }
    }
    if (changed) current = { ...current, cargo: await tx.runCargo.findMany({ where: { runId: run.id } }) };
  }
  return current;
}

/**
 * Bring a pickup run's load into storage as the run comes home. `cargo` is the trunk as it
 * arrived; the load is taken out of it (never more than was loaded) and what is left goes
 * home as ordinary product. A load meant for a warehouse elsewhere never gets here, since a
 * pickup run cannot leave before unloading; if one somehow does, it goes into the home stash
 * rather than jump to its city. Returns the remainder and what was delivered.
 */
export async function deliverSupplyPickups(
  tx: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  run: LoadedRun,
  cargo: Record<string, number>,
  returnedAt: Date,
): Promise<{ cargo: Record<string, number>; deliveries: SupplyDelivery[] }> {
  const pickups = await tx.supplyPickup.findMany({
    where: { runId: run.id, status: { in: ['PLANNED', 'IN_TRANSIT'] } },
    orderBy: { createdAt: 'asc' },
  });
  const rest = { ...cargo };
  const deliveries: SupplyDelivery[] = [];
  for (const pickup of pickups) {
    // Never loaded: nothing was collected, so nothing comes off the order either; a shipment's
    // units go back where they came from.
    if (pickup.status === 'PLANNED') {
      if (pickup.sourceWarehouseId) {
        await tx.supplyStock.upsert({
          where: { warehouseId_productKey: { warehouseId: pickup.sourceWarehouseId, productKey: pickup.productKey } },
          create: { warehouseId: pickup.sourceWarehouseId, productKey: pickup.productKey, quantity: pickup.quantity },
          update: { quantity: { increment: pickup.quantity } },
        });
      }
      await tx.supplyPickup.update({ where: { id: pickup.id }, data: { status: 'CANCELLED' } });
      continue;
    }
    const capacity = Math.max(1, ruleset.supplyNetwork?.pickups?.homeStashUnits ?? pickup.quantity);
    const warehouseId = pickup.warehouseId && pickup.destinationCitySlug === run.homeCity
      ? pickup.warehouseId
      : (await homeStash(tx, roundPlayerId, run.homeCity, capacity)).id;
    const key = pickup.productKey;
    const { extra, ...delivery } = await credit(tx, roundPlayerId, ruleset, pickup, run.id, warehouseId, rest[key] ?? 0, returnedAt);
    rest[key] = extra;
    deliveries.push(delivery);
  }
  return { cargo: rest, deliveries };
}

/**
 * Supply loads riding on runs, by run: away net worth leaves them out, because a paid
 * order never counted toward net worth and stock in storage does not either.
 */
export async function supplyLoadsByRun(db: Db, runIds: readonly string[]): Promise<Map<string, { productKey: string; quantity: number }>> {
  if (!runIds.length) return new Map();
  const rows = await db.supplyPickup.findMany({
    where: { runId: { in: [...runIds] }, status: 'IN_TRANSIT' },
    select: { runId: true, quantity: true, productKey: true },
  });
  return new Map(rows.flatMap((row) => (row.runId ? [[row.runId, { productKey: row.productKey, quantity: row.quantity }] as const] : [])));
}

/** A trunk without its supply load, for away net worth. */
export function withoutSupplyLoad(cargo: Record<string, number>, load: { productKey: string; quantity: number } | undefined): Record<string, number> {
  if (!load) return cargo;
  return { ...cargo, [load.productKey]: Math.max(0, (cargo[load.productKey] ?? 0) - load.quantity) };
}

/** The pickup each run is (or was) collecting, for the travel page. */
export async function runSupplyPickups(db: Db, ruleset: Ruleset, runIds: readonly string[]): Promise<Map<string, RunSupplyPickupDto>> {
  if (!runIds.length || !ruleset.supplyNetwork?.pickups) return new Map();
  const rows = await db.supplyPickup.findMany({
    where: { runId: { in: [...runIds] } },
    include: { order: { select: { supplierKey: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const suppliers = ruleset.supplyNetwork.suppliers ?? [];
  return new Map(rows.flatMap((row) => (row.runId ? [[row.runId, {
    id: row.id,
    orderId: row.orderId,
    productKey: row.productKey,
    productName: productName(ruleset, row.productKey),
    // 1.6.0-F: a shipment's source is the player's own storage.
    supplierName: row.order
      ? suppliers.find((supplier) => supplier.key === row.order!.supplierKey)?.name ?? row.order.supplierKey
      : `your ${cityName(ruleset, row.originCitySlug)} storage`,
    quantity: row.quantity,
    status: row.status,
    deliveredQuantity: row.deliveredQuantity,
    destinationCitySlug: row.destinationCitySlug,
    destinationCityName: cityName(ruleset, row.destinationCitySlug),
  }] as const] : [])));
}

/** Refuse anything but driving home for a run sent to collect supply. */
export async function assertNotSupplyRun(db: Db, runId: string): Promise<void> {
  const pickup = await db.supplyPickup.findFirst({ where: { runId, status: { in: ['PLANNED', 'IN_TRANSIT'] } }, select: { id: true } });
  if (pickup) throw AppError.conflict('SUPPLY_RUN', 'This run is collecting a supply order. It only drives to the supplier and home.');
}

/**
 * 1.6.0-D. A pickup run heads home early only once nothing is left to load or unload on
 * the way: otherwise its load would come home instead of reaching its warehouse.
 */
export async function assertSupplyRunMayHeadHome(db: Db, run: { id: string; homeCity: string }): Promise<void> {
  const pending = await db.supplyPickup.findFirst({
    where: { runId: run.id, OR: [{ status: 'PLANNED' }, { status: 'IN_TRANSIT', destinationCitySlug: { not: run.homeCity } }] },
    select: { id: true },
  });
  if (pending) throw AppError.conflict('SUPPLY_RUN_EN_ROUTE', 'This pickup still has to reach its warehouse. It heads home once the load is off.');
}
