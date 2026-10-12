import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { SupplyProblemDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

/**
 * 1.6.0-I. Reconciliation: every unit and every cent of the supply network, checked against
 * the movement ledger the actions and settles write. Nothing here changes anything. A clean
 * round has no problems; anything listed is a real mismatch (or a staff correction made
 * outside the ledger) for an operator to look at.
 *
 * - An order has collected exactly what its loaded pickups carried.
 * - A finished pickup stored exactly what its STORED movements say.
 * - Each warehouse holds what came in (stored, returned, corrected) less what went out
 *   (to crews, shipped); each crew what it was given less what it returned and sold.
 * - A crew's sale receipts and SOLD movements agree, and the cash ledger paid exactly the
 *   receipts' net.
 * - Nothing holds more than its capacity; dealer counts match their careers; no load is stuck
 *   on a run that already came home.
 * - Each supplier's stock is what it started with, less what was ordered.
 */

type Problem = SupplyProblemDto;
const key = (...parts: string[]) => parts.join('|');

type LedgerMovement = { kind: string; productKey: string; quantityDelta: number; fromLocation: string | null; toLocation: string | null; warehouseId: string | null; dealerCrewId: string | null };

/** What the movement ledger says each place holds, keyed by `place|product`. */
export function ledgerHoldings(movements: readonly LedgerMovement[]): Map<string, number> {
  const expected = new Map<string, number>();
  const bump = (place: string | null, product: string, delta: number) => { if (place) expected.set(key(place, product), (expected.get(key(place, product)) ?? 0) + delta); };
  for (const movement of movements) {
    const units = movement.quantityDelta;
    switch (movement.kind) {
      case 'STORED': bump(movement.toLocation, movement.productKey, units); break;
      case 'RETURNED': bump(movement.toLocation, movement.productKey, units); bump(movement.fromLocation, movement.productKey, -units); break;
      case 'ASSIGNED_TO_DEALER': bump(movement.fromLocation, movement.productKey, -units); bump(movement.toLocation, movement.productKey, units); break;
      case 'SOLD': bump(movement.fromLocation, movement.productKey, -units); break;
      case 'PICKED_UP': if (movement.fromLocation?.startsWith('warehouse:')) bump(movement.fromLocation, movement.productKey, -units); break;
      case 'CORRECTED': bump(movement.warehouseId ? `warehouse:${movement.warehouseId}` : `crew:${movement.dealerCrewId}`, movement.productKey, units); break;
      default: break;
    }
  }
  return expected;
}

/** What the ledger says one place holds of one product. */
export async function ledgerHolding(db: Db | PrismaClient, roundPlayerId: string, place: string, productKey: string): Promise<number> {
  const movements = await db.supplyMovement.findMany({
    where: { roundPlayerId, productKey, OR: [{ fromLocation: place }, { toLocation: place }] },
    select: { kind: true, productKey: true, quantityDelta: true, fromLocation: true, toLocation: true, warehouseId: true, dealerCrewId: true },
  });
  return ledgerHoldings(movements).get(key(place, productKey)) ?? 0;
}

export const SupplyReconcileService = {
  async player(db: Db | PrismaClient, roundPlayerId: string): Promise<Problem[]> {
    const [player, orders, pickups, movements, warehouses, crews, sales, salesLedger] = await Promise.all([
      db.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { id: true, displayName: true, dealerThugs: true } }),
      db.supplyOrder.findMany({ where: { roundPlayerId }, select: { id: true, quantityCollected: true, quantityOrdered: true } }),
      db.supplyPickup.findMany({ where: { roundPlayerId }, select: { id: true, orderId: true, status: true, quantity: true, deliveredQuantity: true, runId: true, routeKey: true, run: { select: { status: true } } } }),
      db.supplyMovement.findMany({ where: { roundPlayerId }, select: { kind: true, productKey: true, quantityDelta: true, fromLocation: true, toLocation: true, pickupId: true, warehouseId: true, dealerCrewId: true } }),
      db.supplyWarehouse.findMany({ where: { roundPlayerId }, include: { stock: true } }),
      db.dealerCrew.findMany({ where: { roundPlayerId }, include: { inventory: true } }),
      db.dealerSale.groupBy({ by: ['dealerCrewId'], where: { dealerCrew: { roundPlayerId } }, _sum: { quantity: true, netCents: true } }),
      db.economyLedgerEntry.aggregate({ where: { roundPlayerId, source: 'DEALER_SALES' }, _sum: { amountCents: true } }),
    ]);
    const problems: Problem[] = [];
    const add = (code: string, severity: Problem['severity'], subject: string, detail: string) => problems.push({ code, severity, roundPlayerId, player: player.displayName, subject, detail });

    // Orders collect exactly what loaded pickups carried.
    const loaded = new Map<string, number>();
    for (const pickup of pickups) {
      if (pickup.orderId && ['IN_TRANSIT', 'DELIVERED', 'FAILED'].includes(pickup.status)) loaded.set(pickup.orderId, (loaded.get(pickup.orderId) ?? 0) + pickup.quantity);
    }
    for (const order of orders) {
      const carried = loaded.get(order.id) ?? 0;
      if (carried !== order.quantityCollected) add('ORDER_COLLECTED', 'ERROR', `order ${order.id}`, `Collected ${order.quantityCollected}, but its loaded pickups carried ${carried}.`);
    }

    // Finished pickups stored what their movements say; none is stuck on a run that came home.
    const storedByPickup = new Map<string, number>();
    for (const movement of movements) if (movement.kind === 'STORED' && movement.pickupId) storedByPickup.set(movement.pickupId, (storedByPickup.get(movement.pickupId) ?? 0) + movement.quantityDelta);
    for (const pickup of pickups) {
      if ((pickup.status === 'DELIVERED' || pickup.status === 'FAILED') && (storedByPickup.get(pickup.id) ?? 0) !== pickup.deliveredQuantity) {
        add('PICKUP_DELIVERY', 'ERROR', `pickup ${pickup.id}`, `Delivered ${pickup.deliveredQuantity}, but ${storedByPickup.get(pickup.id) ?? 0} were stored.`);
      }
      if (pickup.deliveredQuantity > pickup.quantity) add('PICKUP_OVERAGE', 'ERROR', `pickup ${pickup.id}`, `Delivered ${pickup.deliveredQuantity} of a ${pickup.quantity} load.`);
      if ((pickup.status === 'PLANNED' || pickup.status === 'IN_TRANSIT') && pickup.runId && pickup.run?.status === 'RETURNED') {
        add('PICKUP_STUCK', 'ERROR', `pickup ${pickup.id}`, 'Still on the way, but its run already came home.');
      }
    }

    // Storage and crews hold what the ledger moved in, less what it moved out.
    const expected = ledgerHoldings(movements);
    const held = new Map<string, number>();
    for (const warehouse of warehouses) {
      for (const row of warehouse.stock) held.set(key(`warehouse:${warehouse.id}`, row.productKey), row.quantity);
      const stored = warehouse.stock.reduce((sum, row) => sum + row.quantity, 0);
      if (stored > warehouse.capacityUnits) add('WAREHOUSE_OVERFULL', 'WARN', `warehouse ${warehouse.id}`, `Holds ${stored} of ${warehouse.capacityUnits}.`);
    }
    for (const crew of crews) {
      for (const row of crew.inventory) held.set(key(`crew:${crew.id}`, row.productKey), row.quantity);
      const inventory = crew.inventory.reduce((sum, row) => sum + row.quantity, 0);
      if (inventory > crew.capacityUnits) add('CREW_OVERFULL', 'ERROR', `crew ${crew.id}`, `Holds ${inventory} with room for ${crew.capacityUnits}.`);
    }
    for (const place of new Set([...expected.keys(), ...held.keys()])) {
      if (place.startsWith('crew:null') || place.startsWith('shipment:') || place.startsWith('run:') || place.startsWith('lane:') || place.startsWith('local:') || place.startsWith('street')) continue;
      if (!place.startsWith('warehouse:') && !place.startsWith('crew:')) continue;
      const want = expected.get(place) ?? 0;
      const have = held.get(place) ?? 0;
      if (want !== have) {
        const [where, product] = place.split('|');
        add(where!.startsWith('crew:') ? 'CREW_STOCK' : 'WAREHOUSE_STOCK', 'ERROR', where!.replace(':', ' '), `Holds ${have} ${product}, but the ledger moved ${want}.`);
      }
    }

    // Sales: receipts, movements and the cash ledger agree.
    const soldByCrew = new Map<string, number>();
    for (const movement of movements) if (movement.kind === 'SOLD' && movement.dealerCrewId) soldByCrew.set(movement.dealerCrewId, (soldByCrew.get(movement.dealerCrewId) ?? 0) + movement.quantityDelta);
    let receiptsNet = 0n;
    for (const row of sales) {
      receiptsNet += row._sum.netCents ?? 0n;
      if ((row._sum.quantity ?? 0) !== (soldByCrew.get(row.dealerCrewId) ?? 0)) {
        add('SALES_RECEIPTS', 'ERROR', `crew ${row.dealerCrewId}`, `Receipts sold ${row._sum.quantity ?? 0}, movements ${soldByCrew.get(row.dealerCrewId) ?? 0}.`);
      }
    }
    const paid = salesLedger._sum.amountCents ?? 0n;
    if (paid !== receiptsNet) add('SALES_PAYOUT', 'ERROR', 'cash ledger', `Paid ${paid} cents for sales whose receipts net ${receiptsNet}.`);

    // Dealers on the books match the thugs set aside for them.
    const careers = await db.dealerStaff.count({ where: { roundPlayerId, dealerCrewId: { not: null }, releasedAt: null } });
    if (careers !== player.dealerThugs) add('DEALER_STAFF', 'ERROR', 'dealers', `${careers} dealers posted, but ${player.dealerThugs} thugs set aside.`);
    return problems;
  },

  /** Every player in the round with supply records, and every supplier's stock. */
  async round(db: PrismaClient, roundId: string): Promise<Problem[]> {
    const round = await db.round.findUniqueOrThrow({ where: { id: roundId } });
    const ruleset = loadRulesetForRound(round);
    const players = await db.roundPlayer.findMany({
      where: { roundId, OR: [{ supplyOrders: { some: {} } }, { supplyWarehouses: { some: {} } }, { dealerCrews: { some: {} } }, { dealerThugs: { gt: 0 } }] },
      select: { id: true },
    });
    const problems: Problem[] = [];
    for (const player of players) problems.push(...await SupplyReconcileService.player(db, player.id));

    const offers = [
      ...(ruleset.supplyNetwork?.suppliers ?? []).map((supplier) => ({ key: supplier.key, name: supplier.name, offers: supplier.offers })),
      ...(ruleset.supplyNetwork?.lanes?.suppliers ?? []).map((supplier) => ({ key: supplier.key, name: supplier.name, offers: supplier.offers })),
    ];
    const [stock, ordered] = await Promise.all([
      db.supplySupplierStock.findMany({ where: { roundId } }),
      db.supplyOrder.groupBy({ by: ['supplierKey', 'productKey'], where: { roundPlayer: { roundId } }, _sum: { quantityOrdered: true } }),
    ]);
    for (const row of stock) {
      const offer = offers.find((supplier) => supplier.key === row.supplierKey)?.offers[row.productKey];
      if (!offer) continue;
      const sold = ordered.find((entry) => entry.supplierKey === row.supplierKey && entry.productKey === row.productKey)?._sum.quantityOrdered ?? 0;
      if (offer.stockPerRound - sold !== row.quantityAvailable) {
        problems.push({ code: 'SUPPLIER_STOCK', severity: 'ERROR', roundPlayerId: null, player: null, subject: `${row.supplierKey} ${row.productKey}`, detail: `Has ${row.quantityAvailable} left, but ${offer.stockPerRound} less ${sold} ordered is ${offer.stockPerRound - sold}.` });
      }
    }
    return problems;
  },
};
