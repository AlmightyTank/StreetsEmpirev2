import type { PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type { SupplyHistoryItemDto, SupplyLedgerDto } from '@streets/shared';

/**
 * 1.6.0-F. The supply network on one page: what it cost, what it made, where every unit
 * is, and what moved, newest first. Read only, from the ledger and the movement records the
 * actions and settles already write.
 */

const productName = (ruleset: Ruleset, key: string) => (key === 'CRACK'
  ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack'
  : ruleset.products?.[key]?.name ?? key);
const count = (value: number) => value.toLocaleString('en-US');
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const SupplyLedgerService = {
  async ledger(db: PrismaClient, roundPlayerId: string): Promise<SupplyLedgerDto> {
    const [ledger, sales, orders, transit, stored, crews] = await Promise.all([
      db.economyLedgerEntry.groupBy({
        by: ['source'],
        where: { roundPlayerId, source: { in: ['SUPPLY_ORDER', 'SUPPLY_LANE_FEE', 'SUPPLY_PROPERTY', 'SUPPLY_UPKEEP', 'DEALER_SALES', 'DEALER_WAGES'] } },
        _sum: { amountCents: true },
      }),
      db.dealerSale.aggregate({ where: { dealerCrew: { roundPlayerId } }, _sum: { quantity: true, grossCents: true, crewCutCents: true } }),
      db.supplyOrder.findMany({ where: { roundPlayerId, status: { in: ['OPEN', 'PARTIALLY_COLLECTED'] } }, select: { quantityOrdered: true, quantityCollected: true } }),
      // Loaded loads, and shipments whose units already left their warehouse.
      db.supplyPickup.aggregate({ where: { roundPlayerId, OR: [{ status: 'IN_TRANSIT' }, { status: 'PLANNED', sourceWarehouseId: { not: null } }] }, _sum: { quantity: true } }),
      db.supplyStock.aggregate({ where: { warehouse: { roundPlayerId } }, _sum: { quantity: true } }),
      db.dealerStock.aggregate({ where: { dealerCrew: { roundPlayerId } }, _sum: { quantity: true } }),
    ]);
    const sum = (source: string) => Number(ledger.find((row) => row.source === source)?._sum.amountCents ?? 0n);
    const wholesale = -sum('SUPPLY_ORDER');
    const property = -sum('SUPPLY_PROPERTY');
    const upkeep = -sum('SUPPLY_UPKEEP');
    const wages = -sum('DEALER_WAGES');
    const laneFees = -sum('SUPPLY_LANE_FEE');
    const salesNet = sum('DEALER_SALES');
    return {
      wholesaleCents: wholesale,
      propertyCents: property,
      upkeepCents: upkeep,
      laneFeesCents: laneFees,
      grossSalesCents: Number(sales._sum.grossCents ?? 0n),
      dealerCutCents: Number(sales._sum.crewCutCents ?? 0n),
      wagesCents: wages,
      netCents: salesNet - wages - wholesale - laneFees - property - upkeep,
      unitsSold: sales._sum.quantity ?? 0,
      stock: {
        // Units promised to a pickup still driving out are still at the supplier.
        awaitingPickup: orders.reduce((total, order) => total + order.quantityOrdered - order.quantityCollected, 0),
        inTransit: transit._sum.quantity ?? 0,
        stored: stored._sum.quantity ?? 0,
        withCrews: crews._sum.quantity ?? 0,
      },
    };
  },

  async history(db: PrismaClient, ruleset: Ruleset, roundPlayerId: string, take = 40): Promise<SupplyHistoryItemDto[]> {
    const [rows, lanes] = await Promise.all([
      db.supplyMovement.findMany({ where: { roundPlayerId }, orderBy: { createdAt: 'desc' }, take }),
      // 1.6.0-H: how each lane load landed, searched or not; a seizure stores nothing to list.
      db.supplyPickup.findMany({ where: { roundPlayerId, routeKey: { startsWith: 'lane:' }, status: { in: ['DELIVERED', 'FAILED'] } }, orderBy: { deliveredAt: 'desc' }, take }),
    ]);
    const places = [...rows.map((row) => row.fromLocation), ...rows.map((row) => row.toLocation)];
    const ids = (prefix: string) => [...new Set(places.filter((value): value is string => Boolean(value?.startsWith(prefix))).map((value) => value.slice(prefix.length)))];
    const [warehouses, crews] = await Promise.all([
      db.supplyWarehouse.findMany({ where: { id: { in: ids('warehouse:') } }, select: { id: true, kind: true, citySlug: true } }),
      db.dealerCrew.findMany({ where: { id: { in: ids('crew:') } }, select: { id: true, citySlug: true, districtKey: true } }),
    ]);
    const city = (slug: string) => ruleset.cities?.[slug]?.name ?? slug;
    const place = (location: string | null): string => {
      if (location?.startsWith('warehouse:')) {
        const row = warehouses.find((entry) => entry.id === location.slice(10));
        return row ? `the ${row.kind === 'STASH' ? 'home stash' : 'warehouse'} in ${city(row.citySlug)}` : 'storage';
      }
      if (location?.startsWith('crew:')) {
        const row = crews.find((entry) => entry.id === location.slice(5));
        if (!row) return 'a crew';
        const district = ruleset.cities?.[row.citySlug]?.districts?.[row.districtKey as DistrictKey]?.name ?? row.districtKey;
        return `the ${district} crew`;
      }
      return 'storage';
    };
    const landings: SupplyHistoryItemDto[] = lanes.map((row) => {
      const name = productName(ruleset, row.productKey);
      const route = ruleset.supplyNetwork?.lanes?.routes[row.routeKey.slice(5) as 'FREIGHT']?.name ?? 'Lane';
      const lost = row.quantity - row.deliveredQuantity;
      const text = lost === 0 ? `${route} load of ${count(row.quantity)} ${name} landed clean in ${city(row.destinationCitySlug)}.`
        : row.deliveredQuantity === 0 ? `${route} load of ${count(row.quantity)} ${name} was seized in ${city(row.destinationCitySlug)}.`
          : `${route} load searched in ${city(row.destinationCitySlug)}: ${count(lost)} ${name} seized, ${count(row.deliveredQuantity)} stored.`;
      return { at: (row.deliveredAt ?? row.updatedAt).toISOString(), kind: 'LANE' as const, productName: name, units: row.deliveredQuantity, text };
    });
    const moved: SupplyHistoryItemDto[] = rows.filter((row) => !row.fromLocation?.startsWith('lane:')).map((row) => {
      const name = productName(ruleset, row.productKey);
      const units = `${count(row.quantityDelta)} ${name}`;
      const text = row.kind === 'ORDERED' ? `Ordered ${units}.`
        : row.kind === 'PICKED_UP' ? (row.toLocation?.startsWith('shipment:') ? `Shipped ${units} out of ${place(row.fromLocation)}.` : row.toLocation?.startsWith('lane:') ? `Sent ${units} on a lane from abroad.` : `Loaded ${units} at the supplier.`)
          : row.kind === 'STORED' ? `Stored ${units} in ${place(row.toLocation)}.`
            : row.kind === 'ASSIGNED_TO_DEALER' ? `Stocked ${place(row.toLocation)} with ${units} from ${place(row.fromLocation)}.`
              : row.kind === 'CORRECTED' ? `Staff corrected ${place(row.warehouseId ? `warehouse:${row.warehouseId}` : `crew:${row.dealerCrewId}`)} by ${row.quantityDelta > 0 ? '+' : ''}${count(row.quantityDelta)} ${name}.`
              : row.kind === 'RETURNED' ? `${capital(place(row.fromLocation))} returned ${units} to ${place(row.toLocation)}.`
                : `${capital(place(row.fromLocation))} sold ${units}.`;
      return { at: row.createdAt.toISOString(), kind: row.kind, productName: name, units: row.quantityDelta, text };
    });
    return [...moved, ...landings].sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
  },
};
