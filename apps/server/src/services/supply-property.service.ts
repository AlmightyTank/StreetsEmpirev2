import type { City, PrismaClient, RoundPlayer } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import {
  formatCents,
  supplyPropertyBuySchema,
  supplyPropertyCloseSchema,
  type SupplyPropertyActionResult,
  type SupplyPropertyMarketDto,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { WAREHOUSE_NAME } from './supply-pickup-settle.service.js';
import { propertyBehind, propertyRules, supplyFootholds } from './supply-property-settle.service.js';

/**
 * 1.6.0-D. Warehouses and safehouses. A warehouse is bounded storage in a city; a safehouse
 * is a foothold there, which a warehouse away from home needs. Both are bought outright,
 * pay upkeep every period, and make nothing on their own. One of each per city, a few of
 * each per player.
 */

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const HOURS = 3_600_000;

export const SupplyPropertyService = {
  /** Every city's prices and what the player holds there. Null before properties open. */
  async market(db: Db | PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: City }, now: Date): Promise<SupplyPropertyMarketDto | null> {
    const rules = propertyRules(ruleset);
    if (!rules) return null;
    const home = player.city.slug;
    const [warehouses, safehouses, footholds] = await Promise.all([
      db.supplyWarehouse.findMany({ where: { roundPlayerId: player.id, isActive: true, kind: 'WAREHOUSE' } }),
      db.supplySafehouse.findMany({ where: { roundPlayerId: player.id, isActive: true } }),
      supplyFootholds(db as Db, player.id, home, now),
    ]);
    const cash = player.cashCents;
    const fullWarehouses = warehouses.length >= rules.maxWarehouses;
    const fullSafehouses = safehouses.length >= rules.maxSafehouses;
    const cities = Object.keys(ruleset.cities ?? {}).filter((slug) => rules.cities[slug]).map((slug) => {
      const prices = rules.cities[slug]!;
      const ownedWarehouse = warehouses.find((row) => row.citySlug === slug) ?? null;
      const ownedSafehouse = safehouses.find((row) => row.citySlug === slug) ?? null;
      const isHome = slug === home;
      const name = cityName(ruleset, slug);
      return {
        citySlug: slug,
        cityName: name,
        isHome,
        foothold: footholds.has(slug),
        warehouse: {
          costCents: prices.warehouse.costCents,
          upkeepCents: prices.warehouse.upkeepCents,
          capacityUnits: prices.warehouse.capacityUnits,
          ownedId: ownedWarehouse?.id ?? null,
          blockedReason: ownedWarehouse ? null
            : fullWarehouses ? `You hold ${rules.maxWarehouses} warehouses, the most allowed.`
              : !footholds.has(slug) ? `Needs a paid-up safehouse in ${name} first.`
                : cash < BigInt(prices.warehouse.costCents) ? `You need ${formatCents(prices.warehouse.costCents)}.`
                  : null,
        },
        safehouse: isHome ? null : {
          costCents: prices.safehouse.costCents,
          upkeepCents: prices.safehouse.upkeepCents,
          ownedId: ownedSafehouse?.id ?? null,
          paidThrough: ownedSafehouse?.paidThrough.toISOString() ?? null,
          behind: ownedSafehouse ? propertyBehind(ownedSafehouse.paidThrough, now) : false,
          blockedReason: ownedSafehouse ? null
            : fullSafehouses ? `You hold ${rules.maxSafehouses} safehouses, the most allowed.`
              : cash < BigInt(prices.safehouse.costCents) ? `You need ${formatCents(prices.safehouse.costCents)}.`
                : null,
        },
      };
    });
    return {
      maxWarehouses: rules.maxWarehouses,
      ownedWarehouses: warehouses.length,
      maxSafehouses: rules.maxSafehouses,
      ownedSafehouses: safehouses.length,
      upkeepPeriodHours: rules.upkeepPeriodHours,
      cities,
    };
  },

  /** Buy a warehouse or a safehouse. The price pays the first period of upkeep. */
  buy(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown) {
    const input = supplyPropertyBuySchema.parse(rawInput);
    return ActionService.run<SupplyPropertyActionResult>(prisma, roundPlayerId, {
      action: 'SUPPLY_PROPERTY_BUY',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player, now }) => {
        const rules = propertyRules(ruleset);
        if (!rules) throw AppError.notFound('SUPPLY_PROPERTIES_DISABLED', 'Supply properties are not available in this round.');
        const prices = rules.cities[input.citySlug];
        if (!prices || !ruleset.cities?.[input.citySlug]) throw AppError.badRequest('UNKNOWN_CITY', 'Nobody sells property there.', { citySlug: 'Pick a city.' });
        const home = player.city.slug;
        const name = cityName(ruleset, input.citySlug);
        const paidThrough = new Date(now.getTime() + rules.upkeepPeriodHours * HOURS);
        let propertyId: string;
        let cost: number;

        if (input.kind === 'WAREHOUSE') {
          cost = prices.warehouse.costCents;
          const existing = await tx.supplyWarehouse.findUnique({ where: { roundPlayerId_citySlug_name: { roundPlayerId, citySlug: input.citySlug, name: WAREHOUSE_NAME } } });
          if (existing?.isActive) throw AppError.conflict('PROPERTY_OWNED', `You already have a warehouse in ${name}.`);
          const held = await tx.supplyWarehouse.count({ where: { roundPlayerId, isActive: true, kind: 'WAREHOUSE' } });
          if (held >= rules.maxWarehouses) throw AppError.conflict('PROPERTY_LIMIT', `You hold ${rules.maxWarehouses} warehouses, the most allowed. Close one first.`);
          if (!(await supplyFootholds(tx, roundPlayerId, home, now)).has(input.citySlug)) {
            throw AppError.conflict('NO_FOOTHOLD', `A warehouse in ${name} needs a paid-up safehouse there first.`);
          }
          if (current.cashCents < BigInt(cost)) throw AppError.badRequest('NOT_ENOUGH_CASH', `A warehouse in ${name} costs ${formatCents(cost)}.`);
          const data = { kind: 'WAREHOUSE' as const, isActive: true, capacityUnits: prices.warehouse.capacityUnits, upkeepCents: BigInt(prices.warehouse.upkeepCents), paidThrough, purchasedCents: BigInt(cost) };
          // A closed warehouse was empty when it closed, so buying it again starts clean.
          const row = existing
            ? await tx.supplyWarehouse.update({ where: { id: existing.id }, data })
            : await tx.supplyWarehouse.create({ data: { roundPlayerId, citySlug: input.citySlug, name: WAREHOUSE_NAME, ...data } });
          propertyId = row.id;
        } else {
          cost = prices.safehouse.costCents;
          if (input.citySlug === home) throw AppError.conflict('HOME_FOOTHOLD', `You live in ${name}: you need no safehouse there.`);
          const existing = await tx.supplySafehouse.findUnique({ where: { roundPlayerId_citySlug: { roundPlayerId, citySlug: input.citySlug } } });
          if (existing?.isActive) throw AppError.conflict('PROPERTY_OWNED', `You already have a safehouse in ${name}.`);
          const held = await tx.supplySafehouse.count({ where: { roundPlayerId, isActive: true } });
          if (held >= rules.maxSafehouses) throw AppError.conflict('PROPERTY_LIMIT', `You hold ${rules.maxSafehouses} safehouses, the most allowed. Close one first.`);
          if (current.cashCents < BigInt(cost)) throw AppError.badRequest('NOT_ENOUGH_CASH', `A safehouse in ${name} costs ${formatCents(cost)}.`);
          const data = { isActive: true, upkeepCents: BigInt(prices.safehouse.upkeepCents), paidThrough, purchasedCents: BigInt(cost) };
          const row = existing
            ? await tx.supplySafehouse.update({ where: { id: existing.id }, data })
            : await tx.supplySafehouse.create({ data: { roundPlayerId, citySlug: input.citySlug, ...data } });
          propertyId = row.id;
        }

        const label = input.kind === 'WAREHOUSE' ? 'warehouse' : 'safehouse';
        return {
          next: { ...current, cashCents: current.cashCents - BigInt(cost) },
          result: { kind: input.kind, action: 'BOUGHT', propertyId, citySlug: input.citySlug, cityName: name, chargedCents: cost },
          ledger: [{ source: 'SUPPLY_PROPERTY', label: `${name} ${label}`, amountCents: -BigInt(cost), metadata: { propertyId, kind: input.kind, citySlug: input.citySlug } }],
        };
      },
    });
  },

  /**
   * Give a property up. Nothing is refunded and upkeep stops. A warehouse must be empty with
   * nothing on the way to it; a safehouse cannot close under a warehouse that needs it.
   */
  close(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown) {
    const input = supplyPropertyCloseSchema.parse(rawInput);
    return ActionService.run<SupplyPropertyActionResult>(prisma, roundPlayerId, {
      action: 'SUPPLY_PROPERTY_CLOSE',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player }) => {
        if (!propertyRules(ruleset)) throw AppError.notFound('SUPPLY_PROPERTIES_DISABLED', 'Supply properties are not available in this round.');
        let citySlug: string;
        if (input.kind === 'WAREHOUSE') {
          const row = await tx.supplyWarehouse.findFirst({ where: { id: input.propertyId, roundPlayerId, isActive: true, kind: 'WAREHOUSE' } });
          if (!row) throw AppError.notFound('PROPERTY_NOT_FOUND', 'That warehouse is not yours.');
          const [stock, inbound] = await Promise.all([
            tx.supplyStock.aggregate({ where: { warehouseId: row.id }, _sum: { quantity: true } }),
            tx.supplyPickup.count({ where: { warehouseId: row.id, status: { in: ['PLANNED', 'IN_TRANSIT'] } } }),
          ]);
          if ((stock._sum.quantity ?? 0) > 0) throw AppError.conflict('WAREHOUSE_NOT_EMPTY', 'Empty the warehouse before you close it.');
          if (inbound > 0) throw AppError.conflict('WAREHOUSE_INBOUND', 'A pickup is still on its way to this warehouse.');
          await tx.supplyWarehouse.update({ where: { id: row.id }, data: { isActive: false } });
          citySlug = row.citySlug;
        } else {
          const row = await tx.supplySafehouse.findFirst({ where: { id: input.propertyId, roundPlayerId, isActive: true } });
          if (!row) throw AppError.notFound('PROPERTY_NOT_FOUND', 'That safehouse is not yours.');
          if (row.citySlug !== player.city.slug) {
            const warehouse = await tx.supplyWarehouse.count({ where: { roundPlayerId, citySlug: row.citySlug, isActive: true, kind: 'WAREHOUSE' } });
            if (warehouse > 0) throw AppError.conflict('SAFEHOUSE_IN_USE', `Your warehouse in ${cityName(ruleset, row.citySlug)} needs this safehouse. Close the warehouse first.`);
            // 1.6.0-E: and so do dealer crews there.
            const crews = await tx.dealerCrew.count({ where: { roundPlayerId, citySlug: row.citySlug, status: { in: ['ACTIVE', 'PAUSED'] } } });
            if (crews > 0) throw AppError.conflict('SAFEHOUSE_IN_USE', `Your dealer crews in ${cityName(ruleset, row.citySlug)} need this safehouse. Close them first.`);
          }
          await tx.supplySafehouse.update({ where: { id: row.id }, data: { isActive: false } });
          citySlug = row.citySlug;
        }
        return {
          next: current,
          result: { kind: input.kind, action: 'CLOSED', propertyId: input.propertyId, citySlug, cityName: cityName(ruleset, citySlug), chargedCents: 0 },
          ledger: [],
        };
      },
    });
  },
};
