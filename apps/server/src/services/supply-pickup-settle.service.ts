import { settleSupplyPickup, supplyOrderStatus, type Ruleset, type RunStopPlan } from '@streets/rules-engine';
import type { RunSupplyPickupDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import type { LoadedRun } from './run-settle.service.js';

/**
 * 1.6.0-C. The two moments a pickup run changes the supply ledger, called while its run
 * settles: the load comes off the supplier's dock when the run reaches the supplier, and
 * what is left of it goes into storage when the run gets home. Both are keyed by the
 * pickup's state, so settling twice never loads or delivers twice.
 */

/** Where pickups land until 1.6.0-D adds warehouses: one stash per player and city. */
export const HOME_STASH_NAME = 'Home stash';

const productName = (ruleset: Ruleset, key: string) => (key === 'CRACK'
  ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack'
  : ruleset.products?.[key]?.name ?? key);

/** The player's stash in a city, created on first use at the round's size. */
export async function homeStash(tx: Db, roundPlayerId: string, citySlug: string, capacityUnits: number) {
  return tx.supplyWarehouse.upsert({
    where: { roundPlayerId_citySlug_name: { roundPlayerId, citySlug, name: HOME_STASH_NAME } },
    create: { roundPlayerId, citySlug, name: HOME_STASH_NAME, capacityUnits },
    update: {},
  });
}

/**
 * Load every pickup on this run once it has reached its supplier. The supplier is the
 * run's first stop: a pickup run never trades or drives on, so it always gets there. The
 * order counts the units as collected from here on, whether or not they make it home.
 */
export async function loadSupplyPickups(tx: Db, roundPlayerId: string, run: LoadedRun, stops: readonly RunStopPlan[], now: Date): Promise<LoadedRun> {
  const supplier = stops[0];
  if (stops.length < 2 || !supplier || supplier.arriveAt.getTime() > now.getTime()) return run;
  const pickups = await tx.supplyPickup.findMany({
    where: { runId: run.id, status: 'PLANNED' },
    include: { order: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!pickups.length) return run;

  for (const pickup of pickups) {
    const { order } = pickup;
    const load = Math.min(pickup.quantity, order.quantityOrdered - order.quantityCollected);
    if (pickup.originCitySlug !== supplier.city || order.status === 'CANCELLED' || load <= 0) {
      await tx.supplyPickup.update({ where: { id: pickup.id }, data: { status: 'CANCELLED' } });
      continue;
    }
    const collected = order.quantityCollected + load;
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: { quantityCollected: collected, status: supplyOrderStatus(order.quantityOrdered, collected) },
    });
    await tx.runCargo.upsert({
      where: { runId_productKey: { runId: run.id, productKey: order.productKey } },
      create: { runId: run.id, productKey: order.productKey, quantity: load, startQuantity: 0 },
      update: { quantity: { increment: load } },
    });
    await tx.supplyPickup.update({ where: { id: pickup.id }, data: { status: 'IN_TRANSIT', quantity: load, loadedAt: supplier.arriveAt } });
    await tx.supplyMovement.create({
      data: {
        roundPlayerId,
        kind: 'PICKED_UP',
        productKey: order.productKey,
        quantityDelta: load,
        fromLocation: `order:${order.id}`,
        toLocation: `run:${run.id}`,
        orderId: order.id,
        pickupId: pickup.id,
        requestKey: `pickup:${pickup.id}:PICKED_UP`,
        metadata: { supplierKey: order.supplierKey, supplierCitySlug: order.supplierCitySlug },
        createdAt: supplier.arriveAt,
      },
    });
  }
  return { ...run, cargo: await tx.runCargo.findMany({ where: { runId: run.id } }) };
}

export interface SupplyDelivery {
  pickupId: string;
  productKey: string;
  productName: string;
  loaded: number;
  delivered: number;
  lost: number;
}

/**
 * Bring a pickup run's load into storage as the run comes home. `cargo` is the trunk as it
 * arrived; the load is taken out of it (never more than was loaded) and what is left goes
 * home as ordinary product. Returns that remainder and what was delivered.
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
    include: { order: { select: { id: true, productKey: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const rest = { ...cargo };
  const deliveries: SupplyDelivery[] = [];
  for (const pickup of pickups) {
    // Never loaded: nothing was collected, so nothing comes off the order either.
    if (pickup.status === 'PLANNED') {
      await tx.supplyPickup.update({ where: { id: pickup.id }, data: { status: 'CANCELLED' } });
      continue;
    }
    const key = pickup.order.productKey;
    const outcome = settleSupplyPickup(pickup.quantity, rest[key] ?? 0);
    rest[key] = outcome.extra;
    if (outcome.delivered > 0) {
      const capacity = ruleset.supplyNetwork?.pickups?.homeStashUnits ?? pickup.quantity;
      const warehouseId = pickup.warehouseId
        ?? (await homeStash(tx, roundPlayerId, run.homeCity, Math.max(1, capacity))).id;
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
          fromLocation: `run:${run.id}`,
          toLocation: `warehouse:${warehouseId}`,
          orderId: pickup.order.id,
          pickupId: pickup.id,
          warehouseId,
          requestKey: `pickup:${pickup.id}:STORED`,
          metadata: { loaded: pickup.quantity, lost: outcome.lost },
          createdAt: returnedAt,
        },
      });
    }
    await tx.supplyPickup.update({
      where: { id: pickup.id },
      data: { status: outcome.status, deliveredQuantity: outcome.delivered, deliveredAt: returnedAt },
    });
    deliveries.push({ pickupId: pickup.id, productKey: key, productName: productName(ruleset, key), loaded: pickup.quantity, delivered: outcome.delivered, lost: outcome.lost });
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
    select: { runId: true, quantity: true, order: { select: { productKey: true } } },
  });
  return new Map(rows.flatMap((row) => (row.runId ? [[row.runId, { productKey: row.order.productKey, quantity: row.quantity }] as const] : [])));
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
    include: { order: { select: { productKey: true, supplierKey: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const suppliers = ruleset.supplyNetwork.suppliers ?? [];
  return new Map(rows.flatMap((row) => (row.runId ? [[row.runId, {
    id: row.id,
    orderId: row.orderId,
    productKey: row.order.productKey,
    productName: productName(ruleset, row.order.productKey),
    supplierName: suppliers.find((supplier) => supplier.key === row.order.supplierKey)?.name ?? row.order.supplierKey,
    quantity: row.quantity,
    status: row.status,
    deliveredQuantity: row.deliveredQuantity,
  }] as const] : [])));
}

/** Refuse anything but driving home for a run sent to collect supply. */
export async function assertNotSupplyRun(db: Db, runId: string): Promise<void> {
  const pickup = await db.supplyPickup.findFirst({ where: { runId, status: { in: ['PLANNED', 'IN_TRANSIT'] } }, select: { id: true } });
  if (pickup) throw AppError.conflict('SUPPLY_RUN', 'This run is collecting a supply order. It only drives to the supplier and home.');
}
