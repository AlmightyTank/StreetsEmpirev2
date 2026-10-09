import type { PrismaClient, Round, RoundPlayer } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type {
  SupplyOrderDto,
  SupplyOrderInput,
  SupplyOrderPlacementResult,
  SupplyPageDto,
  SupplySupplierDto,
} from '@streets/shared';
import type { Ruleset, SupplyOfferRules, SupplySupplierRules } from '@streets/rulesets';
import { ActionService } from './action.service.js';
import { AppError } from '../utils/errors.js';

type SupplyOrderRow = {
  id: string;
  supplierKey: string;
  supplierCitySlug: string;
  productKey: string;
  quantityOrdered: number;
  quantityCollected: number;
  unitCostCents: number;
  totalPaidCents: bigint;
  status: SupplyOrderDto['status'];
  createdAt: Date;
};

function productName(ruleset: Ruleset, productKey: string): string {
  if (productKey === 'CRACK') return ruleset.stores.PIP.items.CRACK?.name ?? 'Crack';
  return ruleset.products?.[productKey]?.name ?? productKey;
}

function cityName(ruleset: Ruleset, citySlug: string): string {
  return ruleset.cities?.[citySlug]?.name ?? citySlug;
}

function supplierRules(ruleset: Ruleset, supplierKey: string): SupplySupplierRules | undefined {
  return ruleset.supplyNetwork?.suppliers?.find((supplier) => supplier.key === supplierKey);
}

function offerRules(supplier: SupplySupplierRules, productKey: string): SupplyOfferRules | undefined {
  return supplier.offers[productKey];
}

function orderDto(ruleset: Ruleset, row: SupplyOrderRow): SupplyOrderDto {
  const supplier = supplierRules(ruleset, row.supplierKey);
  const supplierName = supplier?.name ?? row.supplierKey;
  return {
    id: row.id,
    supplierKey: row.supplierKey,
    supplierName,
    supplierCitySlug: row.supplierCitySlug,
    supplierCityName: cityName(ruleset, row.supplierCitySlug),
    productKey: row.productKey,
    productName: productName(ruleset, row.productKey),
    quantityOrdered: row.quantityOrdered,
    quantityCollected: row.quantityCollected,
    quantityRemaining: row.quantityOrdered - row.quantityCollected,
    unitCostCents: row.unitCostCents,
    totalPaidCents: Number(row.totalPaidCents),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export const SupplyOrderService = {
  async page(prisma: PrismaClient, round: Round, player: RoundPlayer): Promise<SupplyPageDto> {
    const ruleset = loadRulesetForRound(round);
    const config = ruleset.supplyNetwork;
    const suppliers = config?.suppliers ?? [];
    if (!config?.enabled || suppliers.length === 0) {
      return { enabled: false, maxOpenOrders: 0, openOrderCount: 0, suppliers: [], orders: [] };
    }

    const [orders, openOrderCount] = await Promise.all([
      prisma.supplyOrder.findMany({
        where: { roundPlayerId: player.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.supplyOrder.count({
        where: { roundPlayerId: player.id, status: { in: ['OPEN', 'PARTIALLY_COLLECTED'] } },
      }),
    ]);

    const persistedStock = await prisma.supplySupplierStock.findMany({
      where: { roundId: round.id },
      select: { supplierKey: true, productKey: true, quantityAvailable: true },
    });
    const supplyByKey = new Map(persistedStock.map((row) => [`${row.supplierKey}:${row.productKey}`, row.quantityAvailable]));

    const supplierDtos: SupplySupplierDto[] = suppliers.map((supplier) => ({
      key: supplier.key,
      name: supplier.name,
      citySlug: supplier.citySlug,
      cityName: cityName(ruleset, supplier.citySlug),
      description: supplier.description,
      offers: Object.entries(supplier.offers).map(([productKey, offer]) => ({
        productKey,
        productName: productName(ruleset, productKey),
        unitCostCents: offer.unitCostCents,
        minOrderQuantity: offer.minOrderQuantity,
        maxOrderQuantity: offer.maxOrderQuantity,
        availableQuantity: supplyByKey.get(`${supplier.key}:${productKey}`) ?? offer.stockPerRound,
      })),
    }));

    return {
      enabled: true,
      maxOpenOrders: config.maxOpenOrders ?? 1,
      openOrderCount,
      suppliers: supplierDtos,
      orders: orders.map((row) => orderDto(ruleset, row)),
    };
  },

  place(prisma: PrismaClient, roundPlayerId: string, input: SupplyOrderInput) {
    return ActionService.run<SupplyOrderPlacementResult>(prisma, roundPlayerId, {
      action: 'SUPPLY_ORDER',
      idempotencyScope: 'SUPPLY_ORDER',
      actionId: input.actionId,
      execute: async ({ tx, current, round, ruleset, now }) => {
        const config = ruleset.supplyNetwork;
        const supplier = supplierRules(ruleset, input.supplierKey);
        const offer = supplier && offerRules(supplier, input.productKey);
        if (!config?.enabled || !supplier || !offer) {
          throw AppError.notFound('SUPPLY_OFFER_NOT_FOUND', 'That supplier is not offering this product this season.');
        }

        const prior = await tx.supplyOrder.findUnique({
          where: { roundPlayerId_requestKey: { roundPlayerId, requestKey: input.requestKey } },
        });
        if (prior) {
          if (prior.supplierKey !== input.supplierKey || prior.productKey !== input.productKey || prior.quantityOrdered !== input.quantity) {
            throw AppError.conflict('SUPPLY_REQUEST_KEY_REUSED', 'That order request key was already used for a different order.');
          }
          return {
            next: current,
            result: { order: orderDto(ruleset, prior), chargedCents: Number(prior.totalPaidCents), replayed: true },
            ledger: [],
          };
        }

        if (!Number.isSafeInteger(input.quantity) || input.quantity < offer.minOrderQuantity || input.quantity > offer.maxOrderQuantity) {
          throw AppError.badRequest(
            'SUPPLY_ORDER_QUANTITY',
            `Order between ${offer.minOrderQuantity.toLocaleString('en-US')} and ${offer.maxOrderQuantity.toLocaleString('en-US')} units.`,
            { quantity: 'Outside this supplier’s order range.' },
          );
        }

        const maxOpenOrders = config.maxOpenOrders ?? 1;
        const openOrderCount = await tx.supplyOrder.count({
          where: { roundPlayerId, status: { in: ['OPEN', 'PARTIALLY_COLLECTED'] } },
        });
        if (openOrderCount >= maxOpenOrders) {
          throw AppError.conflict('SUPPLY_ORDER_LIMIT', `You can have up to ${maxOpenOrders} paid orders waiting for pickup.`);
        }

        const totalPaidCents = BigInt(offer.unitCostCents) * BigInt(input.quantity);
        if (totalPaidCents > current.cashCents) {
          throw AppError.badRequest(
            'NOT_ENOUGH_CASH',
            `You need ${totalPaidCents.toLocaleString('en-US')} cents to place this order.`,
            { cashCents: 'Not enough cash.' },
          );
        }

        const stock = await tx.supplySupplierStock.upsert({
          where: { roundId_supplierKey_productKey: { roundId: round.id, supplierKey: supplier.key, productKey: input.productKey } },
          create: { roundId: round.id, supplierKey: supplier.key, productKey: input.productKey, quantityAvailable: offer.stockPerRound },
          update: {},
        });
        const reserved = await tx.supplySupplierStock.updateMany({
          where: { id: stock.id, quantityAvailable: { gte: input.quantity } },
          data: { quantityAvailable: { decrement: input.quantity } },
        });
        if (reserved.count !== 1) {
          throw AppError.conflict('SUPPLY_STOCK_LOW', 'That supplier no longer has enough stock for this order. Refresh the offer and try again.');
        }

        const order = await tx.supplyOrder.create({
          data: {
            roundPlayerId,
            supplierKey: supplier.key,
            supplierCitySlug: supplier.citySlug,
            productKey: input.productKey,
            quantityOrdered: input.quantity,
            quantityCollected: 0,
            unitCostCents: offer.unitCostCents,
            totalPaidCents,
            status: 'OPEN',
            requestKey: input.requestKey,
          },
        });
        await tx.supplyMovement.create({
          data: {
            roundPlayerId,
            kind: 'ORDERED',
            productKey: input.productKey,
            quantityDelta: input.quantity,
            fromLocation: `supplier:${supplier.key}`,
            toLocation: `order:${order.id}`,
            orderId: order.id,
            requestKey: `${input.requestKey}:ORDERED`,
            metadata: { supplierCitySlug: supplier.citySlug, unitCostCents: offer.unitCostCents },
          },
        });

        const product = productName(ruleset, input.productKey);
        return {
          next: { ...current, cashCents: current.cashCents - totalPaidCents },
          result: { order: orderDto(ruleset, order), chargedCents: Number(totalPaidCents), replayed: false },
          ledger: [{
            source: 'SUPPLY_ORDER',
            label: `${supplier.name} · prepaid ${product} order`,
            amountCents: -totalPaidCents,
            metadata: {
              orderId: order.id,
              supplierKey: supplier.key,
              supplierCitySlug: supplier.citySlug,
              productKey: input.productKey,
              quantity: input.quantity,
              unitCostCents: offer.unitCostCents,
            },
          }],
          activity: {
            type: 'STORE_BUY' as const,
            payload: {
              supplyOrder: true,
              orderId: order.id,
              supplier: supplier.name,
              supplierKey: supplier.key,
              city: supplier.citySlug,
              item: product,
              itemKey: input.productKey,
              quantity: input.quantity,
              totalPaidCents: Number(totalPaidCents),
              awaitingPickup: true,
            },
          },
        };
      },
    });
  },
};
