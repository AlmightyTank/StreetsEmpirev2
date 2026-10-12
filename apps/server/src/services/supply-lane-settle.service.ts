import type { Prisma } from '@prisma/client';
import { hashParts, laneRules, resolveLaneArrival, seededRng, type Ruleset } from '@streets/rules-engine';
import type { SupplyLaneRouteKey } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { LawService } from './law.service.js';

/**
 * 1.6.0-H. Lane shipments land lazily, under the player's lock, once their transit time is up:
 * each is rolled once, seeded by the shipment, so reading again never lands it twice or
 * differently. A clean arrival stores everything; a partial search takes a share; a seizure
 * takes it all. Every arrival is written to the shipment, the movement ledger and the feed,
 * and a search leaves evidence in the entry city's Case.
 */

const LANE_PREFIX = 'lane:';
const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const productName = (ruleset: Ruleset, key: string) => ruleset.products?.[key]?.name ?? key;

export const SupplyLaneSettleService = {
  async settle(tx: Db, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<void> {
    const rules = laneRules(ruleset);
    if (!rules) return;
    const due = await tx.supplyPickup.findMany({
      where: { roundPlayerId, status: 'IN_TRANSIT', routeKey: { startsWith: LANE_PREFIX }, expectedArrivalAt: { lte: now } },
      include: { order: { select: { supplierKey: true } } },
      orderBy: { expectedArrivalAt: 'asc' },
    });
    for (const pickup of due) {
      const key = pickup.routeKey.slice(LANE_PREFIX.length) as SupplyLaneRouteKey;
      const route = rules.routes[key];
      const at = pickup.expectedArrivalAt ?? now;
      const arrival = route
        ? resolveLaneArrival({ route, quantity: pickup.quantity, pressure: ruleset.cities?.[pickup.destinationCitySlug]?.policePressure ?? 1, rng: seededRng(hashParts(pickup.id, 'lane')) })
        : { outcome: 'CLEAN' as const, delivered: pickup.quantity, lost: 0, casePoints: 0 };
      if (arrival.delivered > 0 && pickup.warehouseId) {
        await tx.supplyStock.upsert({
          where: { warehouseId_productKey: { warehouseId: pickup.warehouseId, productKey: pickup.productKey } },
          create: { warehouseId: pickup.warehouseId, productKey: pickup.productKey, quantity: arrival.delivered },
          update: { quantity: { increment: arrival.delivered } },
        });
        await tx.supplyMovement.create({
          data: {
            roundPlayerId, kind: 'STORED', productKey: pickup.productKey, quantityDelta: arrival.delivered,
            fromLocation: `lane:${pickup.id}`, toLocation: `warehouse:${pickup.warehouseId}`, orderId: pickup.orderId, pickupId: pickup.id, warehouseId: pickup.warehouseId,
            requestKey: `pickup:${pickup.id}:STORED`, metadata: { loaded: pickup.quantity, lost: arrival.lost, outcome: arrival.outcome, route: key }, createdAt: at,
          },
        });
      }
      await tx.supplyPickup.update({
        where: { id: pickup.id },
        data: { status: arrival.delivered > 0 ? 'DELIVERED' : 'FAILED', deliveredQuantity: arrival.delivered, deliveredAt: at },
      });
      if (arrival.casePoints > 0 && ruleset.law?.evidence) {
        await LawService.record(tx, roundPlayerId, ruleset, [{ citySlug: pickup.destinationCitySlug, points: arrival.casePoints, source: 'SEIZURE', sourceKey: `lane:${pickup.id}` }], at);
      }
      const supplier = rules.suppliers.find((entry) => entry.key === pickup.order?.supplierKey);
      await ActivityService.log(tx, roundPlayerId, 'SUPPLY_LANE_ARRIVED', {
        pickupId: pickup.id,
        route: key,
        routeName: route?.name ?? key,
        supplier: supplier?.name ?? 'A supplier abroad',
        product: productName(ruleset, pickup.productKey),
        quantity: pickup.quantity,
        delivered: arrival.delivered,
        lost: arrival.lost,
        outcome: arrival.outcome,
        cityName: cityName(ruleset, pickup.destinationCitySlug),
      } as Prisma.InputJsonValue);
    }
  },
};
