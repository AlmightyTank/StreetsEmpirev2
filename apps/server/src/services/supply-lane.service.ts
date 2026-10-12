import type { PrismaClient } from '@prisma/client';
import { laneOdds, laneQuote, laneRiskWord, laneRules, type Ruleset } from '@streets/rules-engine';
import {
  formatCents,
  formatNumber,
  supplyLaneOrderSchema,
  type SupplyLaneResult,
  type SupplyLanesDto,
  type SupplyStashDto,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { pickupDto } from './supply-pickup.service.js';
import { HOME_STASH_NAME, homeStash } from './supply-pickup-settle.service.js';
import { propertyBehind } from './supply-property-settle.service.js';

/**
 * 1.6.0-H. International lanes: buy from a supplier abroad and pay for a route card, both up
 * front, and the load lands at a warehouse in one of the card's entry cities when its transit
 * time is up (supply-lane-settle.service). No run, no vehicles: the card is the transport.
 * The order is collected the moment it ships; what the load comes to is decided on arrival.
 */

export const LANE_PREFIX = 'lane:';
export const laneOrigin = (supplierKey: string) => `abroad:${supplierKey}`;

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const productName = (ruleset: Ruleset, key: string) => (key === 'CRACK'
  ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack'
  : ruleset.products?.[key]?.name ?? key);

export const SupplyLaneService = {
  /**
   * The cards, where each lands and how watched it is there, the player's storage in those
   * cities that can take a load, and the suppliers abroad. Null before lanes open.
   */
  async planning(db: Db | PrismaClient, ruleset: Ruleset, roundId: string, roundPlayerId: string, storage: readonly SupplyStashDto[], home: string): Promise<SupplyLanesDto | null> {
    const rules = laneRules(ruleset);
    if (!rules) return null;
    const [inTransit, stock] = await Promise.all([
      db.supplyPickup.count({ where: { roundPlayerId, status: 'IN_TRANSIT', routeKey: { startsWith: LANE_PREFIX } } }),
      db.supplySupplierStock.findMany({ where: { roundId }, select: { supplierKey: true, productKey: true, quantityAvailable: true } }),
    ]);
    const takes = (entry: SupplyStashDto) => (entry.kind === 'STASH' ? entry.citySlug === home : !entry.behind);
    return {
      maxInTransit: rules.maxInTransit,
      inTransit,
      routes: (Object.keys(rules.routes) as Array<keyof typeof rules.routes>).map((key) => {
        const route = rules.routes[key];
        return {
          key,
          name: route.name,
          description: route.description,
          capacityUnits: route.capacityUnits,
          baseFeeCents: route.baseFeeCents,
          feeCentsPerUnit: route.feeCentsPerUnit,
          transitHours: route.transitHours,
          entries: route.entryCities.map((slug) => ({
            citySlug: slug,
            cityName: cityName(ruleset, slug),
            risk: laneRiskWord(laneOdds(route, ruleset.cities?.[slug]?.policePressure ?? 1)),
            storage: storage.filter((entry) => entry.citySlug === slug && takes(entry))
              .map((entry) => ({ key: entry.key, name: entry.kind === 'STASH' ? entry.name : 'Warehouse', roomUnits: entry.roomUnits })),
          })),
        };
      }),
      suppliers: rules.suppliers.map((supplier) => ({
        key: supplier.key,
        name: supplier.name,
        origin: supplier.origin,
        description: supplier.description,
        routes: [...supplier.routes],
        offers: Object.entries(supplier.offers).map(([productKey, offer]) => ({
          productKey,
          productName: productName(ruleset, productKey),
          unitCostCents: offer.unitCostCents,
          minOrderQuantity: offer.minOrderQuantity,
          maxOrderQuantity: offer.maxOrderQuantity,
          availableQuantity: stock.find((row) => row.supplierKey === supplier.key && row.productKey === productKey)?.quantityAvailable ?? offer.stockPerRound,
        })),
      })),
    };
  },

  /**
   * Buy abroad and ship. Everything is checked before money moves: the supplier carries the
   * product on that card, the load fits the card and the offer, the card lands where the
   * warehouse is, the warehouse has room counting loads on the way, and the player has the
   * cash for goods and fee. A retried request key answers with the shipment it already made.
   */
  ship(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown) {
    const input = supplyLaneOrderSchema.parse(rawInput);
    return ActionService.run<SupplyLaneResult>(prisma, roundPlayerId, {
      action: 'SUPPLY_LANE',
      idempotencyScope: 'SUPPLY_LANE',
      actionId: input.actionId,
      execute: async ({ tx, current, round, ruleset, player, now }) => {
        const rules = laneRules(ruleset);
        if (!rules) throw AppError.notFound('SUPPLY_LANES_DISABLED', 'International lanes are not available in this round.');
        const prior = await tx.supplyOrder.findUnique({ where: { roundPlayerId_requestKey: { roundPlayerId, requestKey: input.requestKey } }, include: { pickups: { include: { order: { select: { supplierKey: true } }, warehouse: { select: { name: true } } } } } });
        if (prior) {
          const shipped = prior.pickups[0];
          if (!shipped || prior.supplierKey !== input.supplierKey || prior.quantityOrdered !== input.quantity) {
            throw AppError.conflict('SUPPLY_REQUEST_KEY_REUSED', 'That request key was already used for a different order.');
          }
          const fee = Number(laneQuote(rules.routes[input.route], prior.unitCostCents, prior.quantityOrdered).feeCents);
          return { next: current, result: { pickup: pickupDto(ruleset, shipped), goodsCents: Number(prior.totalPaidCents), feeCents: fee, chargedCents: Number(prior.totalPaidCents) + fee, replayed: true }, ledger: [] };
        }

        const supplier = rules.suppliers.find((entry) => entry.key === input.supplierKey);
        const offer = supplier?.offers[input.productKey];
        if (!supplier || !offer) throw AppError.notFound('SUPPLY_OFFER_NOT_FOUND', 'That supplier is not offering this product.');
        if (!supplier.routes.includes(input.route)) throw AppError.badRequest('LANE_NOT_OFFERED', `${supplier.name} does not ship by ${rules.routes[input.route].name}.`, { route: 'Pick another card.' });
        const route = rules.routes[input.route];
        if (input.quantity < offer.minOrderQuantity || input.quantity > offer.maxOrderQuantity) {
          throw AppError.badRequest('SUPPLY_ORDER_QUANTITY', `Order between ${formatNumber(offer.minOrderQuantity)} and ${formatNumber(offer.maxOrderQuantity)} units.`, { quantity: 'Outside this supplier’s order range.' });
        }
        if (input.quantity > route.capacityUnits) {
          throw AppError.badRequest('LANE_FULL', `${route.name} carries ${formatNumber(route.capacityUnits)} units a load.`, { quantity: `At most ${route.capacityUnits}.` });
        }
        const inTransit = await tx.supplyPickup.count({ where: { roundPlayerId, status: 'IN_TRANSIT', routeKey: { startsWith: LANE_PREFIX } } });
        if (inTransit >= rules.maxInTransit) throw AppError.conflict('LANE_LIMIT', `You have ${rules.maxInTransit} lane shipments on the way, the most allowed.`);

        // Where it lands: storage in one of the card's entry cities that takes deliveries.
        const home = player.city.slug;
        const warehouse = input.warehouseKey === 'stash'
          ? await homeStash(tx, roundPlayerId, home, ruleset.supplyNetwork?.pickups?.homeStashUnits ?? 1)
          : await tx.supplyWarehouse.findFirst({ where: { id: input.warehouseKey, roundPlayerId, isActive: true } });
        if (!warehouse) throw AppError.notFound('WAREHOUSE_NOT_FOUND', 'That warehouse is not yours.');
        if (!route.entryCities.includes(warehouse.citySlug)) {
          throw AppError.conflict('LANE_WRONG_CITY', `${route.name} does not land in ${cityName(ruleset, warehouse.citySlug)}.`);
        }
        if (warehouse.kind === 'STASH' && warehouse.citySlug !== home) throw AppError.conflict('WAREHOUSE_CLOSED_TO_DELIVERIES', 'Your old home stash takes no new deliveries.');
        if (warehouse.kind === 'WAREHOUSE' && propertyBehind(warehouse.paidThrough, now)) {
          throw AppError.conflict('WAREHOUSE_BEHIND', `Your ${cityName(ruleset, warehouse.citySlug)} warehouse is behind on upkeep. It takes no deliveries until it is paid.`);
        }
        const [stored, inbound] = await Promise.all([
          tx.supplyStock.aggregate({ where: { warehouseId: warehouse.id }, _sum: { quantity: true } }),
          tx.supplyPickup.aggregate({ where: { warehouseId: warehouse.id, status: { in: ['PLANNED', 'IN_TRANSIT'] } }, _sum: { quantity: true } }),
        ]);
        const room = Math.max(0, warehouse.capacityUnits - (stored._sum.quantity ?? 0) - (inbound._sum.quantity ?? 0));
        const where = warehouse.kind === 'STASH' ? HOME_STASH_NAME.toLowerCase() : `${cityName(ruleset, warehouse.citySlug)} warehouse`;
        if (input.quantity > room) {
          throw AppError.conflict('SUPPLY_STASH_FULL', `Your ${where} has room for ${formatNumber(room)} more, counting loads on the way. ${formatNumber(input.quantity - room)} would not fit.`);
        }

        const quote = laneQuote(route, offer.unitCostCents, input.quantity);
        if (current.cashCents < BigInt(quote.totalCents)) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', `The goods and the ${route.name} fee come to ${formatCents(quote.totalCents)}.`, { quantity: 'Not enough cash.' });
        }
        // Round-wide stock abroad, like the depots': reserved now, or refused.
        const row = await tx.supplySupplierStock.upsert({
          where: { roundId_supplierKey_productKey: { roundId: round.id, supplierKey: supplier.key, productKey: input.productKey } },
          create: { roundId: round.id, supplierKey: supplier.key, productKey: input.productKey, quantityAvailable: offer.stockPerRound },
          update: {},
        });
        const reserved = await tx.supplySupplierStock.updateMany({ where: { id: row.id, quantityAvailable: { gte: input.quantity } }, data: { quantityAvailable: { decrement: input.quantity } } });
        if (reserved.count !== 1) throw AppError.conflict('SUPPLY_STOCK_LOW', `${supplier.name} no longer has that much. Refresh and try again.`);

        const order = await tx.supplyOrder.create({
          data: {
            roundPlayerId, supplierKey: supplier.key, supplierCitySlug: laneOrigin(supplier.key), productKey: input.productKey,
            quantityOrdered: input.quantity, quantityCollected: input.quantity, unitCostCents: offer.unitCostCents,
            totalPaidCents: BigInt(quote.goodsCents), status: 'FULFILLED', requestKey: input.requestKey,
          },
        });
        const arriveAt = new Date(now.getTime() + route.transitHours * 3_600_000);
        const pickup = await tx.supplyPickup.create({
          data: {
            orderId: order.id, roundPlayerId, productKey: input.productKey, routeKey: `${LANE_PREFIX}${input.route}`,
            originCitySlug: laneOrigin(supplier.key), destinationCitySlug: warehouse.citySlug, quantity: input.quantity, vehicleLoadout: {},
            status: 'IN_TRANSIT', requestKey: input.requestKey, dispatchedAt: now, loadedAt: now, expectedArrivalAt: arriveAt, warehouseId: warehouse.id,
          },
          include: { order: { select: { supplierKey: true } }, warehouse: { select: { name: true } } },
        });
        await tx.supplyMovement.createMany({
          data: [
            { roundPlayerId, kind: 'ORDERED', productKey: input.productKey, quantityDelta: input.quantity, fromLocation: `supplier:${supplier.key}`, toLocation: `order:${order.id}`, orderId: order.id, requestKey: `${input.requestKey}:ORDERED`, metadata: { abroad: true, unitCostCents: offer.unitCostCents }, createdAt: now },
            { roundPlayerId, kind: 'PICKED_UP', productKey: input.productKey, quantityDelta: input.quantity, fromLocation: `order:${order.id}`, toLocation: `lane:${pickup.id}`, orderId: order.id, pickupId: pickup.id, requestKey: `pickup:${pickup.id}:PICKED_UP`, metadata: { route: input.route }, createdAt: now },
          ],
        });
        const product = productName(ruleset, input.productKey);
        return {
          next: { ...current, cashCents: current.cashCents - BigInt(quote.totalCents) },
          result: { pickup: pickupDto(ruleset, pickup), goodsCents: quote.goodsCents, feeCents: quote.feeCents, chargedCents: quote.totalCents, replayed: false },
          ledger: [
            { source: 'SUPPLY_ORDER', label: `${supplier.name} · ${product} abroad`, amountCents: -BigInt(quote.goodsCents), metadata: { orderId: order.id, supplierKey: supplier.key, productKey: input.productKey, quantity: input.quantity } },
            { source: 'SUPPLY_LANE_FEE', label: `${route.name} to ${cityName(ruleset, warehouse.citySlug)}`, amountCents: -BigInt(quote.feeCents), metadata: { pickupId: pickup.id, route: input.route } },
          ],
        };
      },
    });
  },
};
