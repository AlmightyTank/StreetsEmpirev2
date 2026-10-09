import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { AdminPlayerRefDto, AdminSupplyDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';

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
    const supplierName = (key: string) => ruleset.supplyNetwork?.suppliers?.find((row) => row.key === key)?.name ?? key;
    const warehouseRows = warehouses.map((row) => ({
      id: row.id,
      player: playerRef(row.roundPlayer),
      city: cityName(row.citySlug),
      name: row.name,
      capacity: row.capacityUnits,
      stockUnits: row.stock.reduce((sum, item) => sum + item.quantity, 0),
      stock: row.stock.map((item) => ({ product: productName(item.productKey), quantity: item.quantity })),
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
      stock: row.inventory.map((item) => ({ product: productName(item.productKey), quantity: item.quantity })),
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
        city: cityName(row.supplierCitySlug),
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
