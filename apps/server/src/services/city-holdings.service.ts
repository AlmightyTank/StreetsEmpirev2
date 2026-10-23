import type { PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import { cityLaw, coolCase, wantedStage } from '@streets/rules-engine';
import { cityHoldingsEnabled } from '@streets/rulesets';
import { propertyBehind } from './supply-property-settle.service.js';
import { caseCooling } from './law.service.js';

type HoldingModifiers = NonNullable<Ruleset['cityHoldings']>['modifiers'];
const IDENTITY: HoldingModifiers = { dealerSalesPace: 1, demand: 1, upkeep: 1 };

/** Do not activate holding bonuses against an inconsistent authoritative read. */
export function reconciledHoldingModifiers(modifiers: HoldingModifiers, diagnostics: readonly string[]): HoldingModifiers {
  return diagnostics.length ? { ...IDENTITY } : modifiers;
}

/** Read-only foundation: never creates a holding row or settles an action. */
export const CityHoldingsService = {
  async read(db: PrismaClient, ruleset: Ruleset, roundId: string, playerId: string, now: Date = new Date()) {
    if (!cityHoldingsEnabled(ruleset)) return null;

    const cooling = await caseCooling(db, playerId, ruleset);
    const [corners, warehouses, safehouses, crews, pickups, cases] = await Promise.all([
      db.turf.findMany({
        where: { roundId, holderId: playerId },
        select: { city: { select: { slug: true } }, district: true, businesses: { select: { level: true, staff: true } } },
      }),
      db.supplyWarehouse.findMany({ where: { roundPlayerId: playerId }, select: { id: true, citySlug: true, name: true, kind: true, isActive: true, paidThrough: true, upkeepCents: true, capacityUnits: true, stock: { select: { productKey: true, quantity: true } } } }),
      db.supplySafehouse.findMany({ where: { roundPlayerId: playerId }, select: { citySlug: true, isActive: true, paidThrough: true, upkeepCents: true } }),
      db.dealerCrew.findMany({ where: { roundPlayerId: playerId }, select: { id: true, citySlug: true, districtKey: true, status: true, inventory: { select: { productKey: true, quantity: true } } } }),
      db.supplyPickup.findMany({ where: { roundPlayerId: playerId, status: { in: ['PLANNED', 'IN_TRANSIT'] } }, select: { id: true, destinationCitySlug: true, warehouseId: true, productKey: true, quantity: true, status: true } }),
      db.playerCase.findMany({ where: { roundPlayerId: playerId }, select: { city: { select: { slug: true } }, caseHundredths: true, caseAt: true, lastEvidenceAt: true } }),
    ]);

    const citySlugs = new Set<string>([
      ...corners.map((corner) => corner.city.slug),
      ...warehouses.map((warehouse) => warehouse.citySlug),
      ...safehouses.map((safehouse) => safehouse.citySlug),
      ...crews.map((crew) => crew.citySlug),
      ...pickups.map((pickup) => pickup.destinationCitySlug),
    ]);
    const diagnostics: string[] = [];
    for (const slug of citySlugs) {
      if (!ruleset.cities?.[slug]) diagnostics.push(`Unknown holding city: ${slug}`);
    }
    const seenCorners = new Set<string>();
    for (const corner of corners) {
      const key = `${corner.city.slug}:${corner.district}`;
      if (seenCorners.has(key)) diagnostics.push(`Duplicate corner: ${key}`);
      seenCorners.add(key);
    }
    for (const warehouse of warehouses) {
      for (const stock of warehouse.stock) if (stock.quantity < 0) diagnostics.push(`Negative warehouse stock: ${warehouse.id}:${stock.productKey}`);
    }
    for (const crew of crews) {
      for (const stock of crew.inventory) if (stock.quantity < 0) diagnostics.push(`Negative crew stock: ${crew.id}:${stock.productKey}`);
    }
    for (const pickup of pickups) if (pickup.quantity < 0) diagnostics.push(`Negative inbound stock: ${pickup.id}`);
    return {
      diagnostics,
      cities: [...citySlugs].sort().filter((slug) => ruleset.cities?.[slug]).map((citySlug) => ({
        citySlug,
        cityName: ruleset.cities![citySlug]!.name,
        corners: corners.filter((corner) => corner.city.slug === citySlug).map((corner) => corner.district).sort(),
        fronts: corners.filter((corner) => corner.city.slug === citySlug)
          .flatMap((corner) => corner.businesses).filter((front) => front.level > 0).length,
        warehouses: warehouses.filter((warehouse) => warehouse.citySlug === citySlug).map((warehouse) => ({
          id: warehouse.id, name: warehouse.name, kind: warehouse.kind, isActive: warehouse.isActive,
          capacityUnits: warehouse.capacityUnits, stock: warehouse.stock,
          paidThrough: warehouse.paidThrough, upkeepCents: warehouse.upkeepCents.toString(),
          upkeepDue: warehouse.isActive && warehouse.kind === 'WAREHOUSE' && propertyBehind(warehouse.paidThrough, now),
        })),
        safehouses: safehouses.filter((safehouse) => safehouse.citySlug === citySlug).map((safehouse) => ({
          isActive: safehouse.isActive, paidThrough: safehouse.paidThrough,
          upkeepCents: safehouse.upkeepCents.toString(),
          upkeepDue: safehouse.isActive && propertyBehind(safehouse.paidThrough, now),
          footholdActive: safehouse.isActive && safehouse.paidThrough > now,
        })),
        crews: crews.filter((crew) => crew.citySlug === citySlug).map((crew) => ({
          id: crew.id, districtKey: crew.districtKey, status: crew.status, stock: crew.inventory,
        })),
        inbound: pickups.filter((pickup) => pickup.destinationCitySlug === citySlug).map((pickup) => ({
          id: pickup.id, warehouseId: pickup.warehouseId, productKey: pickup.productKey,
          quantity: pickup.quantity, status: pickup.status,
        })),
        pressure: (() => {
          const row = cases.find((entry) => entry.city.slug === citySlug);
          if (!ruleset.law || !row) return { casePoints: 0, stage: 'QUIET' };
          const hundredths = coolCase(row, now, ruleset.law, cityLaw(ruleset.law, citySlug).coolingSpeed * cooling);
          return { casePoints: hundredths / 100, stage: wantedStage(hundredths, ruleset.law) };
        })(),
      })),
      modifiers: reconciledHoldingModifiers(ruleset.cityHoldings!.modifiers, diagnostics),
    };
  },
};
