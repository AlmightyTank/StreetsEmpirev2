import type { City, DealerCrew, DealerStaff, DealerStock, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  dealerDemand,
  dealerPace,
  dealerPressure,
  dealerPriceRange,
  dealerRules,
  dealerStreetPriceCents,
  dealerTier,
  demandWord,
  type Ruleset,
} from '@streets/rules-engine';
import type { DealerRules, DistrictKey } from '@streets/rulesets';
import {
  dealerCrewEstablishSchema,
  dealerCrewManageSchema,
  dealerCrewOfferSchema,
  dealerCrewStockSchema,
  formatCents,
  formatNumber,
  type DealerCareerDto,
  type DealerCrewActionResult,
  type DealerCrewDto,
  type DealerPageDto,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs, type PlayerState } from './action.service.js';
import { supplyFootholds } from './supply-property-settle.service.js';

/**
 * 1.6.0-E. Dealer crews: thugs posted in one district of a city where the player has a
 * foothold, selling one product from that city's storage at a price the player sets. Each
 * dealer is a career that keeps its experience when released. A crew holds what its
 * dealers can carry, never more, and only ever takes stock from storage in its own city.
 * Sales, cuts and operating costs settle from 1.6.0-F; this is the setup and the plan.
 */

type LoadedCrew = DealerCrew & { staff: DealerStaff[]; inventory: DealerStock[] };
const CREW_INCLUDE = { staff: { where: { releasedAt: null }, orderBy: { assignedAt: 'asc' } }, inventory: true } as const;
const LIVE = ['ACTIVE', 'PAUSED'] as const;

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const productName = (ruleset: Ruleset, key: string) => (key === 'CRACK'
  ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack'
  : ruleset.products?.[key]?.name ?? key);
const districtName = (ruleset: Ruleset, city: string, key: string) => ruleset.cities?.[city]?.districts?.[key as DistrictKey]?.name
  ?? ruleset.districts[key as DistrictKey]?.name ?? key;

function requireRules(ruleset: Ruleset): DealerRules {
  const rules = dealerRules(ruleset);
  if (!rules) throw AppError.notFound('DEALERS_DISABLED', 'Dealer crews are not available in this round.');
  return rules;
}

/** Products a crew can sell: whatever the suppliers carry and the city has a street for. */
function sellable(ruleset: Ruleset, rules: DealerRules, citySlug: string): string[] {
  const keys = new Set((ruleset.supplyNetwork?.suppliers ?? []).flatMap((supplier) => Object.keys(supplier.offers)));
  return [...keys].filter((key) => dealerStreetPriceCents(ruleset, rules, citySlug, key) !== null);
}

export function careerDto(rules: DealerRules, row: Pick<DealerStaff, 'id' | 'dealerCrewId' | 'experiencePoints'>): DealerCareerDto {
  const tier = dealerTier(rules, row.experiencePoints);
  const next = rules.tiers.find((candidate) => candidate.minExperience > row.experiencePoints) ?? null;
  return { id: row.id, crewId: row.dealerCrewId, experiencePoints: row.experiencePoints, tierKey: tier.key, tierName: tier.name, cutPercent: tier.cutPercent, nextTierAt: next?.minExperience ?? null };
}

const held = (crew: LoadedCrew) => crew.inventory.reduce((sum, row) => sum + row.quantity, 0);

/** Storage in a city with its stock and free room: inbound loads hold their room. */
async function cityStorage(db: Db | PrismaClient, roundPlayerId: string, citySlug: string) {
  const rows = await db.supplyWarehouse.findMany({ where: { roundPlayerId, citySlug, isActive: true }, include: { stock: true }, orderBy: { createdAt: 'asc' } });
  const inbound = rows.length
    ? await db.supplyPickup.groupBy({ by: ['warehouseId'], where: { warehouseId: { in: rows.map((row) => row.id) }, status: { in: ['PLANNED', 'IN_TRANSIT'] } }, _sum: { quantity: true } })
    : [];
  return rows.map((row) => {
    const stored = row.stock.reduce((sum, item) => sum + item.quantity, 0);
    const coming = inbound.find((entry) => entry.warehouseId === row.id)?._sum.quantity ?? 0;
    return { row, stock: Object.fromEntries(row.stock.map((item) => [item.productKey, item.quantity])) as Record<string, number>, room: Math.max(0, row.capacityUnits - stored - coming) };
  });
}

export async function crewDto(db: Db | PrismaClient, ruleset: Ruleset, rules: DealerRules, crew: LoadedCrew, footholds: ReadonlySet<string>): Promise<DealerCrewDto> {
  const city = crew.citySlug;
  const product = crew.productKey;
  const street = product ? dealerStreetPriceCents(ruleset, rules, city, product) : null;
  const demand = product ? dealerDemand(ruleset, city, product) : 0;
  const inventory = held(crew);
  const pace = dealerPace({
    rules,
    demand,
    district: crew.districtKey as DistrictKey,
    dealers: crew.staff.map((row) => row.experiencePoints),
    priceCents: crew.priceCents ?? 0,
    streetPriceCents: street ?? 0,
    pressure: dealerPressure(ruleset, city),
  });
  const selling = crew.status === 'ACTIVE' && inventory > 0 && pace.unitsPerHour > 0;
  const gross = selling ? pace.unitsPerHour * (crew.priceCents ?? 0) : 0;
  const storage = await cityStorage(db, crew.roundPlayerId, city);
  // 1.6.0-F: what it has sold, from its receipts and the wages on the ledger.
  let sales: DealerCrewDto['sales'] = null;
  if (rules.sales) {
    const [totals, recent, wages] = await Promise.all([
      db.dealerSale.aggregate({ where: { dealerCrewId: crew.id }, _sum: { quantity: true, grossCents: true, crewCutCents: true, netCents: true } }),
      db.dealerSale.findMany({ where: { dealerCrewId: crew.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      db.economyLedgerEntry.aggregate({ where: { roundPlayerId: crew.roundPlayerId, source: 'DEALER_WAGES', metadata: { path: ['crewId'], equals: crew.id } }, _sum: { amountCents: true } }),
    ]);
    sales = {
      units: totals._sum.quantity ?? 0,
      grossCents: Number(totals._sum.grossCents ?? 0n),
      cutCents: Number(totals._sum.crewCutCents ?? 0n),
      netCents: Number(totals._sum.netCents ?? 0n),
      wagesCents: -Number(wages._sum.amountCents ?? 0n),
      recent: recent.map((row) => ({ at: row.createdAt.toISOString(), units: row.quantity, priceCents: row.unitPriceCents, netCents: Number(row.netCents) })),
    };
  }
  return {
    id: crew.id,
    citySlug: city,
    cityName: cityName(ruleset, city),
    districtKey: crew.districtKey,
    districtName: districtName(ruleset, city, crew.districtKey),
    status: crew.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
    foothold: footholds.has(city),
    productKey: product,
    productName: product ? productName(ruleset, product) : null,
    priceCents: crew.priceCents,
    streetPriceCents: street,
    priceRange: street ? dealerPriceRange(rules, street) : null,
    demand: product ? demandWord(demand) : null,
    traffic: rules.districtTraffic[crew.districtKey as DistrictKey] ?? 1,
    capacityUnits: crew.capacityUnits,
    inventoryUnits: inventory,
    dealers: crew.staff.map((row) => careerDto(rules, row)),
    pace: {
      unitsPerHour: selling ? pace.unitsPerHour : 0,
      cutPercent: pace.cutPercent,
      operatingCentsPerHour: crew.status === 'ACTIVE' ? pace.operatingCentsPerHour : 0,
      grossCentsPerHour: Math.round(gross),
      netCentsPerHour: Math.round(gross * (1 - pace.cutPercent / 100) - (crew.status === 'ACTIVE' ? pace.operatingCentsPerHour : 0)),
      hoursToSellOut: selling ? inventory / pace.unitsPerHour : null,
    },
    warehouses: storage.map((entry) => ({ id: entry.row.id, name: entry.row.name, available: product ? entry.stock[product] ?? 0 : 0, roomUnits: entry.room })),
    products: sellable(ruleset, rules, city).map((key) => ({
      key,
      name: productName(ruleset, key),
      streetPriceCents: dealerStreetPriceCents(ruleset, rules, city, key)!,
      demand: demandWord(dealerDemand(ruleset, city, key)),
      stored: storage.reduce((sum, entry) => sum + (entry.stock[key] ?? 0), 0),
    })),
    sales,
  };
}

async function loadCrew(tx: Db, roundPlayerId: string, crewId: string): Promise<LoadedCrew> {
  const crew = await tx.dealerCrew.findFirst({ where: { id: crewId, roundPlayerId, status: { in: [...LIVE] } }, include: CREW_INCLUDE });
  if (!crew) throw AppError.notFound('DEALER_CREW_NOT_FOUND', 'That dealer crew is not yours.');
  return crew;
}

/** Dealer careers on the books must match the count kept on the player, or something is off. */
async function assertStaffInSync(tx: Db, roundPlayerId: string, current: PlayerState): Promise<void> {
  const active = await tx.dealerStaff.count({ where: { roundPlayerId, dealerCrewId: { not: null }, releasedAt: null } });
  if (active !== current.dealerThugs) {
    throw AppError.conflict('DEALER_STAFF_OUT_OF_SYNC', 'Dealer assignments need an operator review before crews change.');
  }
}

async function result(tx: Db, ruleset: Ruleset, rules: DealerRules, roundPlayerId: string, home: string, crewId: string | null, now: Date, message: string): Promise<DealerCrewActionResult> {
  if (!crewId) return { crew: null, message };
  const crew = await tx.dealerCrew.findUniqueOrThrow({ where: { id: crewId }, include: CREW_INCLUDE });
  return { crew: await crewDto(tx, ruleset, rules, crew, await supplyFootholds(tx, roundPlayerId, home, now)), message };
}

export const DealerCrewService = {
  async page(db: PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: City }, now: Date): Promise<DealerPageDto> {
    const rules = dealerRules(ruleset);
    if (!rules) return { enabled: false, rules: null, turns: player.turns, fitThugs: fitThugs(player), dealerThugs: player.dealerThugs, cities: [], crews: [], careers: [] };
    const home = player.city.slug;
    const [crews, careers, footholds] = await Promise.all([
      db.dealerCrew.findMany({ where: { roundPlayerId: player.id, status: { in: [...LIVE] } }, include: CREW_INCLUDE, orderBy: { createdAt: 'asc' } }),
      db.dealerStaff.findMany({ where: { roundPlayerId: player.id, dealerCrewId: null }, orderBy: { experiencePoints: 'desc' } }),
      supplyFootholds(db as Db, player.id, home, now),
    ]);
    const cities = Object.keys(ruleset.cities ?? {}).filter((slug) => footholds.has(slug)).map((slug) => ({
      citySlug: slug,
      cityName: cityName(ruleset, slug),
      isHome: slug === home,
      districts: (Object.keys(rules.districtTraffic) as DistrictKey[]).map((key) => ({
        key,
        name: districtName(ruleset, slug, key),
        traffic: rules.districtTraffic[key],
        taken: crews.some((crew) => crew.citySlug === slug && crew.districtKey === key),
      })),
    }));
    return {
      enabled: true,
      rules: {
        maxCrews: rules.maxCrews,
        maxDealersPerCrew: rules.maxDealersPerCrew,
        unitsPerDealer: rules.unitsPerDealer,
        setupTurns: rules.setupTurns,
        operatingCentsPerDealerHour: rules.operatingCentsPerDealerHour,
        priceRange: { ...rules.priceRange },
        tiers: rules.tiers.map((tier) => ({ ...tier })),
        selling: Boolean(rules.sales),
        salesIntervalMinutes: rules.sales?.intervalMinutes ?? null,
      },
      turns: player.turns,
      fitThugs: fitThugs(player),
      dealerThugs: player.dealerThugs,
      cities,
      crews: await Promise.all(crews.map((crew) => crewDto(db, ruleset, rules, crew, footholds))),
      careers: careers.map((row) => careerDto(rules, row)),
    };
  },

  /**
   * Set a crew up in a district of a city with a foothold. Its dealers come from the fit
   * crew at home: released dealers first, most experienced first, then new careers.
   */
  establish(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown) {
    const input = dealerCrewEstablishSchema.parse(rawInput);
    return ActionService.run<DealerCrewActionResult>(prisma, roundPlayerId, {
      action: 'DEALER_CREW_ESTABLISH',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player, now }) => {
        const rules = requireRules(ruleset);
        const home = player.city.slug;
        const name = cityName(ruleset, input.citySlug);
        if (!ruleset.cities?.[input.citySlug]) throw AppError.badRequest('UNKNOWN_CITY', 'That city is not on the map.', { citySlug: 'Pick a city.' });
        if (!(await supplyFootholds(tx, roundPlayerId, home, now)).has(input.citySlug)) {
          throw AppError.conflict('NO_FOOTHOLD', `A crew in ${name} needs a paid-up safehouse there first.`);
        }
        const live = await tx.dealerCrew.count({ where: { roundPlayerId, status: { in: [...LIVE] } } });
        if (live >= rules.maxCrews) throw AppError.conflict('DEALER_CREW_LIMIT', `You run ${rules.maxCrews} crews, the most allowed. Close one first.`);
        const existing = await tx.dealerCrew.findUnique({ where: { roundPlayerId_citySlug_districtKey: { roundPlayerId, citySlug: input.citySlug, districtKey: input.districtKey } } });
        if (existing && existing.status !== 'CLOSED') throw AppError.conflict('DISTRICT_TAKEN', `You already have a crew in ${districtName(ruleset, input.citySlug, input.districtKey)}.`);
        if (input.dealers > rules.maxDealersPerCrew) {
          throw AppError.badRequest('TOO_MANY_DEALERS', `A crew takes at most ${rules.maxDealersPerCrew} dealers.`, { dealers: `At most ${rules.maxDealersPerCrew}.` });
        }
        if (input.dealers > fitThugs(current)) {
          throw AppError.badRequest('NO_AVAILABLE_THUGS', `You have ${fitThugs(current)} fit thugs at home.`, { dealers: `At most ${fitThugs(current)}.` });
        }
        assertTurns(current.turns, rules.setupTurns);
        await assertStaffInSync(tx, roundPlayerId, current);

        const crewData = { status: 'ACTIVE' as const, capacityUnits: input.dealers * rules.unitsPerDealer, productKey: null, priceCents: null, salesSettledAt: now, salesCarry: 0 };
        const crew = existing
          ? await tx.dealerCrew.update({ where: { id: existing.id }, data: crewData })
          : await tx.dealerCrew.create({ data: { roundPlayerId, citySlug: input.citySlug, districtKey: input.districtKey, ...crewData } });
        const returning = await tx.dealerStaff.findMany({ where: { roundPlayerId, dealerCrewId: null }, orderBy: [{ experiencePoints: 'desc' }, { id: 'asc' }], take: input.dealers });
        for (const staff of returning) await tx.dealerStaff.update({ where: { id: staff.id }, data: { dealerCrewId: crew.id, assignedAt: now, releasedAt: null } });
        if (input.dealers > returning.length) {
          await tx.dealerStaff.createMany({ data: Array.from({ length: input.dealers - returning.length }, () => ({ roundPlayerId, dealerCrewId: crew.id, experiencePoints: 0, assignedAt: now })) });
        }
        return {
          next: { ...current, turns: current.turns - rules.setupTurns, dealerThugs: current.dealerThugs + input.dealers },
          result: await result(tx, ruleset, rules, roundPlayerId, home, crew.id, now, `${input.dealers} dealer${input.dealers === 1 ? '' : 's'} set up in ${districtName(ruleset, input.citySlug, input.districtKey)}, ${name}.`),
          ledger: [],
        };
      },
    });
  },

  /** What a crew sells and asks. A new product needs an empty crew; the price must sit in the range. */
  offer(prisma: PrismaClient, roundPlayerId: string, crewId: string, rawInput: unknown) {
    const input = dealerCrewOfferSchema.parse(rawInput);
    return ActionService.run<DealerCrewActionResult>(prisma, roundPlayerId, {
      action: 'DEALER_CREW_OFFER',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player, now }) => {
        const rules = requireRules(ruleset);
        const crew = await loadCrew(tx, roundPlayerId, crewId);
        let product = crew.productKey;
        if (input.productKey && input.productKey !== crew.productKey) {
          if (!sellable(ruleset, rules, crew.citySlug).includes(input.productKey)) {
            throw AppError.badRequest('UNKNOWN_PRODUCT', 'That product does not sell here.', { productKey: 'Pick a product.' });
          }
          if (held(crew) > 0) throw AppError.conflict('DEALER_CREW_NOT_EMPTY', 'Return the crew\'s stock to storage before it switches product.');
          product = input.productKey;
        }
        if (!product) throw AppError.badRequest('NO_PRODUCT', 'Pick what the crew sells first.', { productKey: 'Pick a product.' });
        const street = dealerStreetPriceCents(ruleset, rules, crew.citySlug, product)!;
        const range = dealerPriceRange(rules, street);
        // A new product starts at its street price unless a price comes with it.
        const price = input.priceCents ?? (product === crew.productKey ? crew.priceCents ?? street : street);
        if (price < range.minCents || price > range.maxCents) {
          throw AppError.badRequest('PRICE_OUT_OF_RANGE', `Ask between ${formatCents(range.minCents)} and ${formatCents(range.maxCents)} a unit.`, { priceCents: 'Outside the range.' });
        }
        await tx.dealerCrew.update({ where: { id: crew.id }, data: { productKey: product, priceCents: price } });
        return {
          next: current,
          result: await result(tx, ruleset, rules, roundPlayerId, player.city.slug, crew.id, now, `The crew sells ${productName(ruleset, product)} at ${formatCents(price)} a unit.`),
          ledger: [],
        };
      },
    });
  },

  /**
   * Load a crew from storage in its own city, or return its stock there. A load never takes
   * the crew past what its dealers hold; a return never overfills the warehouse.
   */
  stock(prisma: PrismaClient, roundPlayerId: string, crewId: string, rawInput: unknown) {
    const input = dealerCrewStockSchema.parse(rawInput);
    return ActionService.run<DealerCrewActionResult>(prisma, roundPlayerId, {
      action: 'DEALER_CREW_STOCK',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player, now }) => {
        const rules = requireRules(ruleset);
        const crew = await loadCrew(tx, roundPlayerId, crewId);
        const product = crew.productKey;
        if (!product) throw AppError.conflict('NO_PRODUCT', 'Pick what the crew sells first.');
        const storage = (await cityStorage(tx, roundPlayerId, crew.citySlug)).find((entry) => entry.row.id === input.warehouseId);
        if (!storage) {
          throw AppError.conflict('WAREHOUSE_ELSEWHERE', `A crew in ${cityName(ruleset, crew.citySlug)} only takes stock from storage in ${cityName(ruleset, crew.citySlug)}.`);
        }
        const warehouse = storage.row;
        const name = productName(ruleset, product);
        const inventory = held(crew);
        const loading = input.direction === 'LOAD';
        if (loading) {
          const room = crew.capacityUnits - inventory;
          if (input.quantity > room) {
            throw AppError.badRequest('DEALER_CREW_FULL', room > 0 ? `The crew can hold ${formatNumber(room)} more.` : 'The crew holds all its dealers can carry.', { quantity: `At most ${Math.max(0, room)}.` });
          }
          const taken = await tx.supplyStock.updateMany({ where: { warehouseId: warehouse.id, productKey: product, quantity: { gte: input.quantity } }, data: { quantity: { decrement: input.quantity } } });
          if (taken.count !== 1) {
            throw AppError.badRequest('NOT_ENOUGH_STOCK', `${warehouse.name} holds ${formatNumber(storage.stock[product] ?? 0)} ${name}.`, { quantity: `At most ${storage.stock[product] ?? 0}.` });
          }
          await tx.dealerStock.upsert({
            where: { dealerCrewId_productKey: { dealerCrewId: crew.id, productKey: product } },
            create: { dealerCrewId: crew.id, productKey: product, quantity: input.quantity },
            update: { quantity: { increment: input.quantity } },
          });
        } else {
          if (input.quantity > inventory) throw AppError.badRequest('NOT_ENOUGH_STOCK', `The crew holds ${formatNumber(inventory)} ${name}.`, { quantity: `At most ${inventory}.` });
          if (input.quantity > storage.room) {
            throw AppError.conflict('SUPPLY_STASH_FULL', `${warehouse.name} has room for ${formatNumber(storage.room)} more, counting loads on the way.`);
          }
          await tx.dealerStock.update({ where: { dealerCrewId_productKey: { dealerCrewId: crew.id, productKey: product } }, data: { quantity: { decrement: input.quantity } } });
          await tx.supplyStock.upsert({
            where: { warehouseId_productKey: { warehouseId: warehouse.id, productKey: product } },
            create: { warehouseId: warehouse.id, productKey: product, quantity: input.quantity },
            update: { quantity: { increment: input.quantity } },
          });
        }
        await tx.supplyMovement.create({
          data: {
            roundPlayerId,
            kind: loading ? 'ASSIGNED_TO_DEALER' : 'RETURNED',
            productKey: product,
            quantityDelta: input.quantity,
            fromLocation: loading ? `warehouse:${warehouse.id}` : `crew:${crew.id}`,
            toLocation: loading ? `crew:${crew.id}` : `warehouse:${warehouse.id}`,
            warehouseId: warehouse.id,
            dealerCrewId: crew.id,
            requestKey: `dealer-stock:${crew.id}:${input.actionId}`,
            createdAt: now,
          },
        });
        return {
          next: current,
          result: await result(tx, ruleset, rules, roundPlayerId, player.city.slug, crew.id, now,
            loading ? `Loaded ${formatNumber(input.quantity)} ${name} from ${warehouse.name}.` : `Returned ${formatNumber(input.quantity)} ${name} to ${warehouse.name}.`),
          ledger: [],
        };
      },
    });
  },

  /**
   * Pause or resume a crew (a paused crew neither sells nor costs), move a paused crew to
   * another district for the setup turns, or close an empty crew and release its dealers.
   */
  manage(prisma: PrismaClient, roundPlayerId: string, crewId: string, rawInput: unknown) {
    const input = dealerCrewManageSchema.parse(rawInput);
    return ActionService.run<DealerCrewActionResult>(prisma, roundPlayerId, {
      action: 'DEALER_CREW_MANAGE',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player, now }) => {
        const rules = requireRules(ruleset);
        const home = player.city.slug;
        const crew = await loadCrew(tx, roundPlayerId, crewId);
        const where = `${districtName(ruleset, crew.citySlug, crew.districtKey)}, ${cityName(ruleset, crew.citySlug)}`;
        if (input.action === 'PAUSE' || input.action === 'RESUME') {
          const status = input.action === 'PAUSE' ? 'PAUSED' : 'ACTIVE';
          if (crew.status === status) throw AppError.conflict('DEALER_CREW_UNCHANGED', `The crew is already ${status === 'PAUSED' ? 'paused' : 'working'}.`);
          // 1.6.0-F: a resumed crew's clock starts now; paused hours neither sell nor cost.
          await tx.dealerCrew.update({ where: { id: crew.id }, data: status === 'ACTIVE' ? { status, salesSettledAt: now } : { status } });
          return { next: current, result: await result(tx, ruleset, rules, roundPlayerId, home, crew.id, now, `The crew in ${where} is ${status === 'PAUSED' ? 'paused' : 'back to work'}.`), ledger: [] };
        }
        if (input.action === 'MOVE') {
          if (!input.districtKey) throw AppError.badRequest('NO_DISTRICT', 'Pick where the crew moves to.', { districtKey: 'Pick a district.' });
          if (crew.status !== 'PAUSED') throw AppError.conflict('DEALER_CREW_WORKING', 'Pause the crew before it moves.');
          if (!(await supplyFootholds(tx, roundPlayerId, home, now)).has(crew.citySlug)) {
            throw AppError.conflict('NO_FOOTHOLD', `Moving within ${cityName(ruleset, crew.citySlug)} needs a paid-up safehouse there.`);
          }
          const taken = await tx.dealerCrew.findUnique({ where: { roundPlayerId_citySlug_districtKey: { roundPlayerId, citySlug: crew.citySlug, districtKey: input.districtKey } } });
          if (taken && taken.status !== 'CLOSED') throw AppError.conflict('DISTRICT_TAKEN', 'You already have a crew there.');
          assertTurns(current.turns, rules.setupTurns);
          // A closed crew's old row holds the district's slot; it goes, the moving crew takes it.
          if (taken) await tx.dealerCrew.delete({ where: { id: taken.id } });
          await tx.dealerCrew.update({ where: { id: crew.id }, data: { districtKey: input.districtKey } });
          return {
            next: { ...current, turns: current.turns - rules.setupTurns },
            result: await result(tx, ruleset, rules, roundPlayerId, home, crew.id, now, `The crew moved to ${districtName(ruleset, crew.citySlug, input.districtKey)}.`),
            ledger: [],
          };
        }
        // CLOSE
        if (held(crew) > 0) throw AppError.conflict('DEALER_CREW_NOT_EMPTY', 'Return the crew\'s stock to storage before it closes.');
        await assertStaffInSync(tx, roundPlayerId, current);
        const released = await tx.dealerStaff.updateMany({ where: { dealerCrewId: crew.id, releasedAt: null }, data: { dealerCrewId: null, releasedAt: now } });
        await tx.dealerCrew.update({ where: { id: crew.id }, data: { status: 'CLOSED', capacityUnits: 0, productKey: null, priceCents: null } });
        return {
          next: { ...current, dealerThugs: current.dealerThugs - released.count },
          result: await result(tx, ruleset, rules, roundPlayerId, home, null, now, `Closed the crew in ${where}. ${released.count} dealer${released.count === 1 ? ' is' : 's are'} back with the crew, experience kept.`),
          ledger: [],
        };
      },
    });
  },
};
