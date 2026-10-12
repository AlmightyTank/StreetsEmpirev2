import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { AdminPlayerRefDto, AdminSupplyDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { SupplyReconcileService } from './supply-reconcile.service.js';

const playerSelect = { id: true, displayName: true, publicPimpId: true, accountId: true } as const;
const playerRef = (row: { id: string; displayName: string; publicPimpId: number; accountId: string }): AdminPlayerRefDto => ({
  id: row.id, displayName: row.displayName, publicPimpId: row.publicPimpId, accountId: row.accountId,
});

export const AdminSupplyService = {
  async report(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminSupplyDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const enabled = Boolean(ruleset.supplyNetwork?.enabled);
    const inRound = { roundPlayer: { roundId } };
    const [
      [orders, supplierStock, warehouses, crews, movements, ledger],
      orderCount, openOrderCount, supplierUnits,
      warehouseCount, warehouseUnits, dealerCrewCount, assignedDealers,
      dealerStockUnits, saleCount, salesGross, salesByCrew, movementCount,
      ledgerCount, ledgerDelta,
    ] = await Promise.all([
      Promise.all([
        prisma.supplyOrder.findMany({ where: inRound, orderBy: { createdAt: 'desc' }, take: 200, include: { roundPlayer: { select: playerSelect } } }),
        prisma.supplySupplierStock.findMany({ where: { roundId }, orderBy: [{ supplierKey: 'asc' }, { productKey: 'asc' }] }),
        prisma.supplyWarehouse.findMany({ where: { roundPlayer: { roundId } }, orderBy: { createdAt: 'desc' }, take: 200, include: { roundPlayer: { select: playerSelect }, stock: true } }),
        prisma.dealerCrew.findMany({ where: { roundPlayer: { roundId } }, orderBy: { createdAt: 'desc' }, take: 200, include: { roundPlayer: { select: playerSelect }, staff: { orderBy: [{ experiencePoints: 'desc' }, { createdAt: 'asc' }] }, inventory: true } }),
        prisma.supplyMovement.findMany({ where: inRound, orderBy: { createdAt: 'desc' }, take: 200, include: { roundPlayer: { select: playerSelect } } }),
        prisma.economyLedgerEntry.findMany({ where: { ...inRound, OR: [{ source: { startsWith: 'SUPPLY_' } }, { source: { startsWith: 'DEALER_' } }] }, orderBy: { createdAt: 'desc' }, take: 200, include: { roundPlayer: { select: playerSelect } } }),
      ]),
      prisma.supplyOrder.count({ where: inRound }),
      prisma.supplyOrder.count({ where: { ...inRound, status: { in: ['OPEN', 'PARTIALLY_COLLECTED'] } } }),
      prisma.supplySupplierStock.aggregate({ where: { roundId }, _sum: { quantityAvailable: true } }),
      prisma.supplyWarehouse.count({ where: { roundPlayer: { roundId } } }),
      prisma.supplyStock.aggregate({ where: { warehouse: { roundPlayer: { roundId } } }, _sum: { quantity: true } }),
      prisma.dealerCrew.count({ where: { roundPlayer: { roundId } } }),
      prisma.dealerStaff.count({ where: { roundPlayer: { roundId }, dealerCrewId: { not: null }, releasedAt: null } }),
      prisma.dealerStock.aggregate({ where: { dealerCrew: { roundPlayer: { roundId } } }, _sum: { quantity: true } }),
      prisma.dealerSale.count({ where: { dealerCrew: { roundPlayer: { roundId } } } }),
      prisma.dealerSale.aggregate({ where: { dealerCrew: { roundPlayer: { roundId } } }, _sum: { grossCents: true } }),
      prisma.dealerSale.groupBy({ by: ['dealerCrewId'], where: { dealerCrew: { roundPlayer: { roundId } } }, _count: { _all: true }, _sum: { grossCents: true } }),
      prisma.supplyMovement.count({ where: inRound }),
      prisma.economyLedgerEntry.count({ where: { ...inRound, OR: [{ source: { startsWith: 'SUPPLY_' } }, { source: { startsWith: 'DEALER_' } }] } }),
      prisma.economyLedgerEntry.aggregate({ where: { ...inRound, OR: [{ source: { startsWith: 'SUPPLY_' } }, { source: { startsWith: 'DEALER_' } }] }, _sum: { amountCents: true } }),
    ]);

    const cityName = (slug: string) => ruleset.cities?.[slug]?.name ?? slug;
    const productName = (key: string) => key === 'CRACK' ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack' : ruleset.products?.[key]?.name ?? key;
    const supplierName = (key: string) => ruleset.supplyNetwork?.suppliers?.find((row) => row.key === key)?.name
      ?? ruleset.supplyNetwork?.lanes?.suppliers.find((row) => row.key === key)?.name ?? key;
    const placeName = (slug: string) => (slug.startsWith('abroad:')
      ? ruleset.supplyNetwork?.lanes?.suppliers.find((row) => `abroad:${row.key}` === slug)?.origin ?? 'Abroad'
      : cityName(slug));

    // 1.6.0-I: shipments by state, stock by city, crew economics and reconciliation.
    const [pickups, pickupStates, stockRows, crewStockRows, inboundRows, saleTotals, wageRows, problems] = await Promise.all([
      prisma.supplyPickup.findMany({ where: { roundPlayer: { roundId } }, orderBy: { createdAt: 'desc' }, take: 200, include: { roundPlayer: { select: playerSelect } } }),
      prisma.supplyPickup.findMany({ where: { roundPlayer: { roundId } }, select: { status: true, quantity: true, orderId: true, routeKey: true } }),
      prisma.supplyStock.findMany({ where: { warehouse: { roundPlayer: { roundId } } }, select: { productKey: true, quantity: true, warehouse: { select: { citySlug: true } } } }),
      prisma.dealerStock.findMany({ where: { dealerCrew: { roundPlayer: { roundId } } }, select: { productKey: true, quantity: true, dealerCrew: { select: { citySlug: true } } } }),
      prisma.supplyPickup.findMany({ where: { roundPlayer: { roundId }, status: { in: ['PLANNED', 'IN_TRANSIT'] } }, select: { productKey: true, quantity: true, destinationCitySlug: true } }),
      prisma.dealerSale.groupBy({ by: ['dealerCrewId'], where: { dealerCrew: { roundPlayer: { roundId } } }, _sum: { quantity: true, grossCents: true, crewCutCents: true, netCents: true } }),
      prisma.economyLedgerEntry.findMany({ where: { roundPlayer: { roundId }, source: 'DEALER_WAGES' }, select: { amountCents: true, metadata: true } }),
      enabled ? SupplyReconcileService.round(prisma, roundId) : Promise.resolve([]),
    ]);
    const kindOf = (row: { orderId: string | null; routeKey: string }) => (row.routeKey.startsWith('lane:') ? 'LANE' as const : row.orderId ? 'PICKUP' as const : 'SHIPMENT' as const);
    const states = new Map<string, { kind: 'PICKUP' | 'SHIPMENT' | 'LANE'; status: string; count: number; units: number }>();
    for (const row of pickupStates) {
      const kind = kindOf(row);
      const entry = states.get(`${kind}:${row.status}`) ?? { kind, status: row.status, count: 0, units: 0 };
      entry.count += 1;
      entry.units += row.quantity;
      states.set(`${kind}:${row.status}`, entry);
    }
    const byCity = new Map<string, { city: string; product: string; stored: number; withCrews: number; inbound: number }>();
    const cell = (city: string, product: string) => {
      const id = `${city}|${product}`;
      if (!byCity.has(id)) byCity.set(id, { city: cityName(city), product: productName(product), stored: 0, withCrews: 0, inbound: 0 });
      return byCity.get(id)!;
    };
    for (const row of stockRows) cell(row.warehouse.citySlug, row.productKey).stored += row.quantity;
    for (const row of crewStockRows) cell(row.dealerCrew.citySlug, row.productKey).withCrews += row.quantity;
    for (const row of inboundRows) cell(row.destinationCitySlug, row.productKey).inbound += row.quantity;
    const wagesByCrew = new Map<string, number>();
    for (const row of wageRows) {
      const crewId = (row.metadata as { crewId?: string } | null)?.crewId;
      if (crewId) wagesByCrew.set(crewId, (wagesByCrew.get(crewId) ?? 0) - Number(row.amountCents));
    }
    const warehouseRows = warehouses.map((row) => ({
      id: row.id,
      player: playerRef(row.roundPlayer),
      city: cityName(row.citySlug),
      name: row.name,
      capacity: row.capacityUnits,
      stockUnits: row.stock.reduce((sum, item) => sum + item.quantity, 0),
      stock: row.stock.map((item) => ({ productKey: item.productKey, product: productName(item.productKey), quantity: item.quantity })),
    }));
    const salesForCrew = new Map(salesByCrew.map((row) => [row.dealerCrewId, row]));
    const crewRows = crews.map((row) => ({
      id: row.id,
      player: playerRef(row.roundPlayer),
      city: cityName(row.citySlug),
      district: ruleset.districts[row.districtKey as keyof typeof ruleset.districts]?.name ?? row.districtKey,
      status: row.status,
      staff: row.staff.map((staff) => ({
        id: staff.id,
        experiencePoints: staff.experiencePoints,
        active: staff.dealerCrewId !== null && staff.releasedAt === null,
        assignedAt: staff.assignedAt.toISOString(),
        releasedAt: staff.releasedAt?.toISOString() ?? null,
      })),
      capacity: row.capacityUnits,
      productKey: row.productKey,
      stock: row.inventory.map((item) => ({ productKey: item.productKey, product: productName(item.productKey), quantity: item.quantity })),
      salesCount: salesForCrew.get(row.id)?._count._all ?? 0,
      grossCents: Number(salesForCrew.get(row.id)?._sum.grossCents ?? 0n),
    }));

    return {
      roundId,
      enabled,
      generatedAt: now.toISOString(),
      totals: {
        orders: orderCount,
        openOrders: openOrderCount,
        supplierUnitsAvailable: supplierUnits._sum.quantityAvailable ?? 0,
        warehouses: warehouseCount,
        warehouseUnits: warehouseUnits._sum.quantity ?? 0,
        dealerCrews: dealerCrewCount,
        assignedDealers,
        dealerStockUnits: dealerStockUnits._sum.quantity ?? 0,
        sales: saleCount,
        salesGrossCents: Number(salesGross._sum.grossCents ?? 0n),
        cashLedgerEntries: ledgerCount,
        cashLedgerDeltaCents: Number(ledgerDelta._sum.amountCents ?? 0n),
        supplyMovements: movementCount,
      },
      orders: orders.map((row) => ({
        id: row.id,
        player: playerRef(row.roundPlayer),
        supplier: supplierName(row.supplierKey),
        city: placeName(row.supplierCitySlug),
        product: productName(row.productKey),
        quantityOrdered: row.quantityOrdered,
        quantityCollected: row.quantityCollected,
        quantityRemaining: row.quantityOrdered - row.quantityCollected,
        unitCostCents: row.unitCostCents,
        totalPaidCents: Number(row.totalPaidCents),
        status: row.status,
        placedAt: row.createdAt.toISOString(),
      })),
      supplierStock: supplierStock.map((row) => ({ supplier: supplierName(row.supplierKey), city: cityName(ruleset.supplyNetwork?.suppliers?.find((item) => item.key === row.supplierKey)?.citySlug ?? ''), product: productName(row.productKey), available: row.quantityAvailable })),
      warehouses: warehouseRows,
      dealerCrews: crewRows,
      ledger: ledger.map((row) => ({ id: row.id, player: playerRef(row.roundPlayer), source: row.source, label: row.label, amountCents: Number(row.amountCents), at: row.createdAt.toISOString() })),
      shipmentStates: [...states.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.status.localeCompare(b.status)),
      shipments: pickups.map((row) => ({
        id: row.id,
        player: playerRef(row.roundPlayer),
        kind: kindOf(row),
        route: row.routeKey.startsWith('lane:') ? ruleset.supplyNetwork?.lanes?.routes[row.routeKey.slice(5) as 'FREIGHT']?.name ?? row.routeKey : row.routeKey === 'local' ? 'Local' : 'Run',
        from: placeName(row.originCitySlug),
        to: cityName(row.destinationCitySlug),
        product: productName(row.productKey),
        quantity: row.quantity,
        delivered: row.deliveredQuantity,
        status: row.status,
        dueAt: row.expectedArrivalAt?.toISOString() ?? null,
      })),
      stockByCity: [...byCity.values()].filter((row) => row.stored + row.withCrews + row.inbound > 0).sort((a, b) => a.city.localeCompare(b.city) || a.product.localeCompare(b.product)),
      dealerEconomics: crews.map((row) => {
        const sold = saleTotals.find((entry) => entry.dealerCrewId === row.id)?._sum;
        return {
          crewId: row.id,
          player: playerRef(row.roundPlayer),
          city: cityName(row.citySlug),
          district: ruleset.districts[row.districtKey as keyof typeof ruleset.districts]?.name ?? row.districtKey,
          status: row.status,
          dealers: row.staff.filter((staff) => staff.dealerCrewId !== null && staff.releasedAt === null).length,
          unitsSold: sold?.quantity ?? 0,
          grossCents: Number(sold?.grossCents ?? 0n),
          cutCents: Number(sold?.crewCutCents ?? 0n),
          netCents: Number(sold?.netCents ?? 0n),
          wagesCents: wagesByCrew.get(row.id) ?? 0,
        };
      }),
      problems,
      products: [...new Set([
        ...(ruleset.supplyNetwork?.suppliers ?? []).flatMap((supplier) => Object.keys(supplier.offers)),
        ...(ruleset.supplyNetwork?.lanes?.suppliers ?? []).flatMap((supplier) => Object.keys(supplier.offers)),
      ])].map((key) => ({ key, name: productName(key) })),
      recentMovements: movements.map((row) => ({
        id: row.id,
        player: playerRef(row.roundPlayer),
        kind: row.kind,
        product: productName(row.productKey),
        quantityDelta: row.quantityDelta,
        fromLocation: row.fromLocation,
        toLocation: row.toLocation,
        requestKey: row.requestKey,
        at: row.createdAt.toISOString(),
      })),
    };
  },
};
