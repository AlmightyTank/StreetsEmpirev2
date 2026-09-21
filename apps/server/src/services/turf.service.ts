import type { Prisma, PrismaClient } from '@prisma/client';
import {
  cornerMinimumFor,
  cornerUpkeep,
  defaultWorkSupplyPolicy,
  localsAfter,
  localsThugs,
  presenceAfter,
  runNetWorthCents,
  turfBlocks,
  turfHoldBonus,
  turfTax,
  workSupplyOrder,
  headsUpMinutes,
  type Ruleset,
} from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type { CityTurfDto, TurfBattleReportDto, TurfBlockDto, TurfSummaryDto, TurfTripDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { accountsShareNetwork } from './admin-signals.service.js';
import { ProductInventoryService } from './product-inventory.service.js';
import { turfRevengeByAttacker } from './turf-revenge.service.js';
import { endTurfHold } from './turf-history.service.js';
import {
  controlFromRows,
  recordTerritoryControlChange,
  territoryControlForCity,
  type CityControl,
} from './turf-territory.service.js';

type TurfDb = PrismaClient | Db;
const HOUR_MS = 3_600_000;

export interface CornerGuns {
  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
}

const EMPTY_GUNS: CornerGuns = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
const BEST_FIRST = ['ak47s', 'tek9s', 'shotguns', 'pistols'] as const;
const RETURN_FIRST = ['pistols', 'shotguns', 'tek9s', 'ak47s'] as const;

function districtName(ruleset: Ruleset, citySlug: string, district: string): string {
  const key = district as keyof typeof ruleset.districts;
  return ruleset.cities?.[citySlug]?.districts?.[key]?.name
    ?? ruleset.districts[key]?.name
    ?? district;
}
function hoursSince(at: Date, now: Date): number { return Math.max(0, (now.getTime() - at.getTime()) / HOUR_MS); }

export function localsOnBlock(
  ruleset: Ruleset,
  row: { holderId?: string | null; citySlug: string; district: DistrictKey; localsThugs: number; localsAt: Date; localsReclaimAt?: Date | null },
  now: Date,
): number {
  if (row.holderId) return 0;
  if (row.localsReclaimAt && row.localsReclaimAt > now) return 0;
  return Math.round(localsAfter(ruleset, { citySlug: row.citySlug, district: row.district }, row.localsThugs, hoursSince(row.localsAt, now)));
}

export function localsReclaimAt(ruleset: Ruleset, releasedAt: Date): Date {
  return new Date(releasedAt.getTime() + (ruleset.turf?.locals.reclaimHours ?? 0) * HOUR_MS);
}
function utcDay(now: Date): Date { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
function holdingOn(ruleset: Ruleset): boolean { return ruleset.turf?.holding === true; }
function homeFit(player: { thugs: number; woundedThugs: number; busyThugs: number; postedThugs: number }): number {
  return Math.max(0, player.thugs - player.woundedThugs - player.busyThugs - player.postedThugs);
}
function gunCount(guns: CornerGuns): number { return guns.pistols + guns.shotguns + guns.tek9s + guns.ak47s; }

export function cornerGunCount(guns: CornerGuns): number { return gunCount(guns); }
export function gunsFromTurf(row: { cornerPistols: number; cornerShotguns: number; cornerTek9s: number; cornerAk47s: number }): CornerGuns {
  return { pistols: row.cornerPistols, shotguns: row.cornerShotguns, tek9s: row.cornerTek9s, ak47s: row.cornerAk47s };
}
export function turfGunData(guns: CornerGuns) {
  return { cornerPistols: guns.pistols, cornerShotguns: guns.shotguns, cornerTek9s: guns.tek9s, cornerAk47s: guns.ak47s };
}
export function addCornerGuns(a: CornerGuns, b: CornerGuns): CornerGuns {
  return { pistols: a.pistols + b.pistols, shotguns: a.shotguns + b.shotguns, tek9s: a.tek9s + b.tek9s, ak47s: a.ak47s + b.ak47s };
}
export function subtractCornerGuns(a: CornerGuns, b: CornerGuns): CornerGuns {
  return { pistols: a.pistols - b.pistols, shotguns: a.shotguns - b.shotguns, tek9s: a.tek9s - b.tek9s, ak47s: a.ak47s - b.ak47s };
}
export function allocateCornerGuns(source: CornerGuns, count: number): CornerGuns | null {
  const guns: CornerGuns = { ...EMPTY_GUNS };
  let remaining = count;
  for (const key of BEST_FIRST) {
    if (remaining <= 0) break;
    const amount = Math.min(Math.max(0, source[key]), remaining);
    guns[key] = amount;
    remaining -= amount;
  }
  return remaining === 0 ? guns : null;
}
export function releaseCornerGuns(source: CornerGuns, count: number): CornerGuns {
  const guns: CornerGuns = { ...EMPTY_GUNS };
  let remaining = count;
  for (const key of RETURN_FIRST) {
    if (remaining <= 0) break;
    const amount = Math.min(Math.max(0, source[key]), remaining);
    guns[key] = amount;
    remaining -= amount;
  }
  if (remaining !== 0) throw new RangeError('Corner gun custody is below the posted thug count.');
  return guns;
}
export function cornerGunWorthCents(ruleset: Ruleset, guns: CornerGuns): bigint {
  const v = ruleset.economy.netWorth;
  return BigInt(guns.pistols) * BigInt(v.perPistolCents)
    + BigInt(guns.shotguns) * BigInt(v.perShotgunCents)
    + BigInt(guns.tek9s) * BigInt(v.perTek9Cents)
    + BigInt(guns.ak47s) * BigInt(v.perAk47Cents);
}
function dtoGuns(guns: CornerGuns) { return { ...guns, total: gunCount(guns) }; }

export function outpostBoxWorthCents(
  ruleset: Ruleset,
  box: { cashCents: bigint; beer: number; products: Record<string, number> },
): bigint {
  return runNetWorthCents(ruleset, {
    cashCents: box.cashCents,
    lowRiders: 0,
    escortThugs: 0,
    beer: box.beer,
    cargo: box.products,
  });
}

export function settleOutpostSupplies(
  ruleset: Ruleset,
  input: { thugs: number; hours: number; beer: number; products: Record<string, number>; order: readonly string[] },
): { beer: number; products: Record<string, number>; beerUsed: number; productUsed: number; leaving: number } {
  const need = cornerUpkeep(ruleset, input.thugs, input.hours);
  const beerUsed = Math.min(Math.max(0, input.beer), need.beer);
  const products = { ...input.products };
  let productUsed = 0;
  for (const key of input.order) {
    if (productUsed >= need.product) break;
    const available = Math.max(0, products[key] ?? 0);
    const amount = Math.min(available, need.product - productUsed);
    if (amount <= 0) continue;
    products[key] = available - amount;
    productUsed += amount;
  }
  const beerShare = need.beer > 0 ? beerUsed / need.beer : 1;
  const productShare = need.product > 0 ? productUsed / need.product : 1;
  const missingShare = Math.max(0, 1 - Math.min(beerShare, productShare));
  const leaving = Math.min(
    input.thugs,
    Math.ceil(input.thugs * (ruleset.turf?.corner.walkoutSharePerHour ?? 0) * input.hours * missingShare),
  );
  return { beer: input.beer - beerUsed, products, beerUsed, productUsed, leaving };
}

async function lockOutpost(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "TurfOutpost" WHERE id = ${id} FOR UPDATE`;
}

export { controlFromRows } from './turf-territory.service.js';

interface StoredTurfFight {
  won: boolean;
  unopposed: boolean;
  stale: boolean;
  attackerWounds: number;
  defenderWounds: number;
  cornerWounds: number;
  ownerBackupWounds: number;
  allyBackup: number;
  defenders?: { corner: number; ownerBackup: number; allyCommitted: number; allyShowed: number };
  strength: { attacker: number; defender: number } | null;
  shieldUntil?: string | null;
  outpostLoot?: { cashCents: number; beer: number; products: Record<string, number> } | null;
}

export const TurfService = {
  holdingEnabled: holdingOn,

  async ensureRound(db: TurfDb, roundId: string, ruleset: Ruleset): Promise<void> {
    const blocks = turfBlocks(ruleset);
    if (!blocks.length) return;
    const slugs = [...new Set(blocks.map((block) => block.citySlug))];
    const cities = await db.city.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const cityBySlug = new Map(cities.map((city) => [city.slug, city.id]));
    await db.turf.createMany({
      skipDuplicates: true,
      data: blocks.flatMap((block) => {
        const cityId = cityBySlug.get(block.citySlug);
        return cityId ? [{ roundId, cityId, district: block.district, localsThugs: localsThugs(ruleset, block) }] : [];
      }),
    });
  },

  async addPresence(db: TurfDb, input: {
    roundPlayerId: string; roundId: string; cityId: string; district: string;
    turns: number; ruleset: Ruleset; now?: Date;
  }): Promise<number> {
    if (!holdingOn(input.ruleset) || input.turns <= 0) return 0;
    const now = input.now ?? new Date();
    await TurfService.ensureRound(db, input.roundId, input.ruleset);
    const where = { roundPlayerId_cityId_district: { roundPlayerId: input.roundPlayerId, cityId: input.cityId, district: input.district } };
    const existing = await db.turfPresence.findUnique({ where });
    const faded = existing ? presenceAfter(input.ruleset, existing.turns, hoursSince(existing.at, now)) : 0;
    const turns = faded + input.turns * input.ruleset.turf!.presence.perScoutTurn;
    await db.turfPresence.upsert({
      where,
      create: { roundPlayerId: input.roundPlayerId, cityId: input.cityId, district: input.district, turns, at: now },
      update: { turns, at: now },
    });
    return turns;
  },

  async presenceFor(db: TurfDb, roundPlayerId: string, cityId: string, district: string, ruleset: Ruleset, now = new Date()): Promise<number> {
    const row = await db.turfPresence.findUnique({ where: { roundPlayerId_cityId_district: { roundPlayerId, cityId, district } } });
    return row ? presenceAfter(ruleset, row.turns, hoursSince(row.at, now)) : 0;
  },

  async settlePlayer(tx: Db, roundPlayerId: string, ruleset: Ruleset, now = new Date()) {
    if (!holdingOn(ruleset)) return null;
    const player = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: {
        id: true, roundId: true, cashCents: true, beer: true, crack: true, thugs: true,
        postedThugs: true, postedNetWorthCents: true, outpostNetWorthCents: true, pistols: true, shotguns: true, tek9s: true, ak47s: true,
      },
    });
    await TurfService.ensureRound(tx, player.roundId, ruleset);
    const held = await tx.turf.findMany({
      where: { roundId: player.roundId, holderId: roundPlayerId },
      include: { city: { select: { slug: true } }, outpost: true },
      orderBy: [{ city: { sortOrder: 'asc' } }, { district: 'asc' }],
    });

    let beer = player.beer;
    let thugs = player.thugs;
    let postedThugs = player.postedThugs;
    let postedNetWorthCents = player.postedNetWorthCents;
    let outpostNetWorthCents = player.outpostNetWorthCents;
    let homeGuns: CornerGuns = { pistols: player.pistols, shotguns: player.shotguns, tek9s: player.tek9s, ak47s: player.ak47s };
    let walkouts = 0;

    const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
    const productChanges: Record<string, number> = {};
    const policyRow = await tx.workSupplyPolicy.findUnique({ where: { roundPlayerId_job: { roundPlayerId, job: 'CORNER' } } });
    const policy = policyRow
      ? { primary: policyRow.primary, fallback: policyRow.fallback, emergency: policyRow.emergency, strict: policyRow.strict }
      : defaultWorkSupplyPolicy();
    const order = workSupplyOrder(policy);
    const takeProduct = (need: number): number => {
      let used = 0;
      for (const key of order) {
        if (used >= need) break;
        const available = Math.max(0, inventory[key] ?? 0);
        const amount = Math.min(available, need - used);
        if (amount <= 0) continue;
        inventory[key] = available - amount;
        productChanges[key] = (productChanges[key] ?? 0) - amount;
        used += amount;
      }
      return used;
    };

    for (const row of held) {
      const wholeHours = Math.floor(hoursSince(row.upkeepAt, now));
      if (row.outpost) {
        if (wholeHours <= 0 || row.cornerThugs <= 0) continue;
        await lockOutpost(tx, row.outpost.id);
        const box = await tx.turfOutpost.findUniqueOrThrow({ where: { id: row.outpost.id } });
        const settled = settleOutpostSupplies(ruleset, {
          thugs: row.cornerThugs,
          hours: wholeHours,
          beer: box.beer,
          products: box.products as Record<string, number>,
          order,
        });
        const advanceTo = new Date(row.upkeepAt.getTime() + wholeHours * HOUR_MS);
        const gunsBefore = gunsFromTurf(row);
        const desertedGuns = settled.leaving > 0 ? releaseCornerGuns(gunsBefore, settled.leaving) : { ...EMPTY_GUNS };
        const gunsAfter = subtractCornerGuns(gunsBefore, desertedGuns);
        const cornerAfter = row.cornerThugs - settled.leaving;

        if (settled.leaving > 0) {
          walkouts += settled.leaving;
          thugs = Math.max(0, thugs - settled.leaving);
          postedThugs = Math.max(0, postedThugs - settled.leaving);
          postedNetWorthCents -= cornerGunWorthCents(ruleset, desertedGuns);
          if (postedNetWorthCents < 0n) throw new RangeError('Posted turf net worth fell below zero.');
        }

        const controlBefore = cornerAfter <= 0
          ? await territoryControlForCity(tx, player.roundId, row.cityId, ruleset)
          : null;
        if (cornerAfter > 0) {
          await tx.turfOutpost.update({
            where: { id: box.id },
            data: { beer: settled.beer, products: settled.products as Prisma.InputJsonValue },
          });
          await tx.turf.update({
            where: { id: row.id },
            data: { cornerThugs: cornerAfter, ...turfGunData(gunsAfter), upkeepAt: advanceTo },
          });
        } else {
          // Nobody remains to secure the remote box. Deserters take their guns and the
          // abandoned stock is lost rather than teleporting back to the home city.
          await tx.turfOutpost.delete({ where: { id: box.id } });
          await endTurfHold(tx, row.id, now);
          await tx.turf.update({
            where: { id: row.id },
            data: {
              holderId: null, cornerThugs: 0, ...turfGunData(EMPTY_GUNS), heldSince: null, shieldUntil: null,
              upkeepAt: advanceTo, localsThugs: 0, localsAt: now, localsReclaimAt: localsReclaimAt(ruleset, now),
            },
          });
          await recordTerritoryControlChange(tx, {
            roundId: player.roundId, cityId: row.cityId, ruleset, before: controlBefore, at: now,
          });
        }
        continue;
      }
      if (wholeHours <= 0 || row.cornerThugs <= 0) continue;
      const need = cornerUpkeep(ruleset, row.cornerThugs, wholeHours);
      const beerUsed = Math.min(beer, need.beer);
      beer -= beerUsed;
      const productUsed = takeProduct(need.product);
      const beerShare = need.beer > 0 ? beerUsed / need.beer : 1;
      const productShare = need.product > 0 ? productUsed / need.product : 1;
      const missingShare = Math.max(0, 1 - Math.min(beerShare, productShare));
      const leaving = Math.min(row.cornerThugs, Math.ceil(row.cornerThugs * ruleset.turf!.corner.walkoutSharePerHour * wholeHours * missingShare));
      const advanceTo = new Date(row.upkeepAt.getTime() + wholeHours * HOUR_MS);
      const gunsBefore = gunsFromTurf(row);
      const returned = leaving > 0 ? releaseCornerGuns(gunsBefore, leaving) : { ...EMPTY_GUNS };
      const gunsAfter = subtractCornerGuns(gunsBefore, returned);
      const cornerAfter = row.cornerThugs - leaving;

      if (leaving > 0) {
        walkouts += leaving;
        thugs = Math.max(0, thugs - leaving);
        postedThugs = Math.max(0, postedThugs - leaving);
        homeGuns = addCornerGuns(homeGuns, returned);
        postedNetWorthCents -= cornerGunWorthCents(ruleset, returned);
        if (postedNetWorthCents < 0n) throw new RangeError('Posted turf net worth fell below zero.');
      }

      const controlBefore = cornerAfter <= 0
        ? await territoryControlForCity(tx, player.roundId, row.cityId, ruleset)
        : null;
      if (cornerAfter <= 0) await endTurfHold(tx, row.id, now);
      await tx.turf.update({
        where: { id: row.id },
        data: cornerAfter > 0
          ? { cornerThugs: cornerAfter, ...turfGunData(gunsAfter), upkeepAt: advanceTo }
          : {
              holderId: null, cornerThugs: 0, ...turfGunData(EMPTY_GUNS), heldSince: null, shieldUntil: null,
              upkeepAt: advanceTo, localsThugs: 0, localsAt: now, localsReclaimAt: localsReclaimAt(ruleset, now),
            },
      });
      if (cornerAfter <= 0) {
        await recordTerritoryControlChange(tx, {
          roundId: player.roundId, cityId: row.cityId, ruleset, before: controlBefore, at: now,
        });
      }
    }

    if (Object.keys(productChanges).length > 0) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, productChanges);

    const ledgers = await tx.turfTaxLedger.findMany({ where: { holderId: roundPlayerId } });
    let taxCreditedCents = 0n;
    for (const row of ledgers) {
      const due = row.mintedCents - row.creditedCents;
      if (due <= 0n) continue;
      taxCreditedCents += due;
      await tx.turfTaxLedger.update({ where: { id: row.id }, data: { creditedCents: row.mintedCents } });
    }
    const cashCents = player.cashCents + taxCreditedCents;
    const boxes = await tx.turfOutpost.findMany({
      where: { ownerId: roundPlayerId },
      select: { cashCents: true, beer: true, products: true },
    });
    outpostNetWorthCents = boxes.reduce(
      (sum, box) => sum + outpostBoxWorthCents(ruleset, {
        cashCents: box.cashCents,
        beer: box.beer,
        products: box.products as Record<string, number>,
      }),
      0n,
    );

    if (beer !== player.beer || thugs !== player.thugs || postedThugs !== player.postedThugs ||
        postedNetWorthCents !== player.postedNetWorthCents || outpostNetWorthCents !== player.outpostNetWorthCents ||
        homeGuns.pistols !== player.pistols || homeGuns.shotguns !== player.shotguns ||
        homeGuns.tek9s !== player.tek9s || homeGuns.ak47s !== player.ak47s || taxCreditedCents > 0n) {
      await tx.roundPlayer.update({
        where: { id: roundPlayerId },
        data: { cashCents, beer, thugs, postedThugs, postedNetWorthCents, outpostNetWorthCents, ...homeGuns },
      });
    }

    return {
      cashCents, beer, crack: inventory.CRACK ?? player.crack, thugs, postedThugs, postedNetWorthCents,
      outpostNetWorthCents, ...homeGuns, taxCreditedCents, walkouts,
    };
  },

  async scoutEconomy(tx: Db, input: {
    roundPlayerId: string; accountId: string; roundId: string; cityId: string;
    district: DistrictKey; takeCents: number; ruleset: Ruleset; now?: Date;
  }): Promise<TurfTripDto> {
    const empty: TurfTripDto = { kind: 'locals', holder: null, holdBonusCents: 0, taxPaidCents: 0, taxMintedCents: 0, linked: false, controlledCityExempt: false };
    if (!holdingOn(input.ruleset) || input.takeCents <= 0) return empty;
    const now = input.now ?? new Date();
    await TurfService.ensureRound(tx, input.roundId, input.ruleset);
    let row = await tx.turf.findUnique({
      where: { roundId_cityId_district: { roundId: input.roundId, cityId: input.cityId, district: input.district } },
      include: {
        holder: { select: { id: true, accountId: true, publicPimpId: true, displayName: true } },
        outpost: { select: { id: true } },
      },
    });

    // A rival's persisted corner may be hours out of date. Settle its upkeep
    // before deciding whether this worker owes tax, then reread the block in
    // case the corner walked out while the holder was offline.
    if (row?.holder && row.holder.id !== input.roundPlayerId) {
      await TurfService.settlePlayer(tx, row.holder.id, input.ruleset, now);
      row = await tx.turf.findUnique({
        where: { roundId_cityId_district: { roundId: input.roundId, cityId: input.cityId, district: input.district } },
        include: {
          holder: { select: { id: true, accountId: true, publicPimpId: true, displayName: true } },
          outpost: { select: { id: true } },
        },
      });
    }

    if (!row?.holder) return empty;
    if (row.holder.id === input.roundPlayerId) {
      const multiplier = turfHoldBonus(input.ruleset, input.district, true);
      return {
        kind: 'own', holder: { publicPimpId: row.holder.publicPimpId, displayName: row.holder.displayName },
        holdBonusCents: Math.max(0, Math.round(input.takeCents * (multiplier - 1))), taxPaidCents: 0, taxMintedCents: 0, linked: false, controlledCityExempt: false,
      };
    }

    const worker = input.ruleset.turf?.territory?.controlledCityNoTax
      ? await tx.roundPlayer.findUniqueOrThrow({ where: { id: input.roundPlayerId }, select: { allianceId: true } })
      : null;
    const control = worker?.allianceId
      ? await territoryControlForCity(tx, input.roundId, input.cityId, input.ruleset)
      : null;
    if (worker?.allianceId && control?.allianceId === worker.allianceId) {
      return {
        kind: 'rival', holder: { publicPimpId: row.holder.publicPimpId, displayName: row.holder.displayName },
        holdBonusCents: 0, taxPaidCents: 0, taxMintedCents: 0, linked: false, controlledCityExempt: true,
      };
    }

    const linked = await accountsShareNetwork(tx, input.accountId, row.holder.accountId, now);
    if (linked) {
      return {
        kind: 'rival', holder: { publicPimpId: row.holder.publicPimpId, displayName: row.holder.displayName },
        holdBonusCents: 0, taxPaidCents: 0, taxMintedCents: 0, linked: true, controlledCityExempt: false,
      };
    }
    const day = utcDay(now);
    const ledger = await tx.turfTaxLedger.findUnique({
      where: { roundId_payerId_holderId_day: { roundId: input.roundId, payerId: input.roundPlayerId, holderId: row.holder.id, day } },
    });
    const tax = turfTax(input.ruleset, input.district, input.takeCents, Number(ledger?.mintedCents ?? 0n));
    if (row.outpost) {
      const rules = input.ruleset.turf?.outposts;
      if (!rules) {
        return {
          kind: 'rival', holder: { publicPimpId: row.holder.publicPimpId, displayName: row.holder.displayName },
          holdBonusCents: 0, taxPaidCents: 0, taxMintedCents: 0, linked: false, controlledCityExempt: false,
        };
      }
      await lockOutpost(tx, row.outpost.id);
      const box = await tx.turfOutpost.findUniqueOrThrow({ where: { id: row.outpost.id } });
      const room = Math.max(0, rules.cashCapCents - Number(box.cashCents));
      const mintCents = Math.min(tax.mintCents, room);
      if (mintCents > 0) {
        await tx.turfOutpost.update({
          where: { id: box.id },
          data: { cashCents: { increment: BigInt(mintCents) } },
        });
        // Credited moves with minted here because the money already landed in the remote
        // box. The shared ledger still enforces the daily payer/holder cap across all blocks.
        await tx.turfTaxLedger.upsert({
          where: { roundId_payerId_holderId_day: { roundId: input.roundId, payerId: input.roundPlayerId, holderId: row.holder.id, day } },
          create: {
            roundId: input.roundId, payerId: input.roundPlayerId, holderId: row.holder.id, day,
            mintedCents: BigInt(mintCents), creditedCents: BigInt(mintCents),
          },
          update: {
            mintedCents: { increment: BigInt(mintCents) },
            creditedCents: { increment: BigInt(mintCents) },
          },
        });
      }
      return {
        kind: 'rival', holder: { publicPimpId: row.holder.publicPimpId, displayName: row.holder.displayName },
        holdBonusCents: 0, taxPaidCents: tax.burnCents, taxMintedCents: mintCents, linked: false, controlledCityExempt: false,
      };
    }

    if (tax.mintCents > 0) {
      await tx.turfTaxLedger.upsert({
        where: { roundId_payerId_holderId_day: { roundId: input.roundId, payerId: input.roundPlayerId, holderId: row.holder.id, day } },
        create: { roundId: input.roundId, payerId: input.roundPlayerId, holderId: row.holder.id, day, mintedCents: BigInt(tax.mintCents) },
        update: { mintedCents: { increment: BigInt(tax.mintCents) } },
      });
    }
    return {
      kind: 'rival', holder: { publicPimpId: row.holder.publicPimpId, displayName: row.holder.displayName },
      holdBonusCents: 0, taxPaidCents: tax.burnCents, taxMintedCents: tax.mintCents, linked: false, controlledCityExempt: false,
    };
  },

  async summary(db: TurfDb, roundPlayerId: string, ruleset: Ruleset, now = new Date()): Promise<TurfSummaryDto | null> {
    if (!holdingOn(ruleset)) return null;
    const player = await db.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { roundId: true } });
    const day = utcDay(now);
    const [held, today, all] = await Promise.all([
      db.turf.findMany({ where: { roundId: player.roundId, holderId: roundPlayerId }, select: { cornerPistols: true, cornerShotguns: true, cornerTek9s: true, cornerAk47s: true } }),
      db.turfTaxLedger.findMany({ where: { roundId: player.roundId, holderId: roundPlayerId, day } }),
      db.turfTaxLedger.findMany({ where: { roundId: player.roundId, holderId: roundPlayerId } }),
    ]);
    const posted = held.reduce((sum, row) => addCornerGuns(sum, gunsFromTurf(row)), { ...EMPTY_GUNS });
    const earned = today.reduce((sum, row) => sum + row.mintedCents, 0n);
    const pending = all.reduce((sum, row) => sum + (row.mintedCents - row.creditedCents), 0n);
    return {
      enabled: true, blocksHeld: held.length, postedGuns: dtoGuns(posted),
      taxEarnedTodayCents: Number(earned), taxPendingCents: Number(pending),
      taxPayersToday: new Set(today.map((row) => row.payerId)).size,
      dailyTaxCapCentsPerPayer: ruleset.turf!.caps.dailyTaxCapCentsPerPayer,
    };
  },

  async byCity(db: TurfDb, roundPlayerId: string, ruleset: Ruleset, now = new Date()): Promise<Map<string, CityTurfDto> | null> {
    if (!ruleset.turf) return null;
    const player = await db.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: {
        id: true, roundId: true, cityId: true, thugs: true, woundedThugs: true, busyThugs: true, postedThugs: true,
        pistols: true, shotguns: true, tek9s: true, ak47s: true, allianceId: true, allianceJoinedAt: true,
        lockedUntil: true, movingUntil: true, hideoutLookoutsLevel: true,
      },
    });
    await TurfService.ensureRound(db, player.roundId, ruleset);
    const [rows, presenceRows, activeRun, pendingPushes, myRecentPushes, recentFights, revengeByAttacker] = await Promise.all([
      db.turf.findMany({
        where: { roundId: player.roundId },
        include: {
          city: { select: { id: true, slug: true } },
          holder: { select: { id: true, allianceId: true, publicPimpId: true, displayName: true, alliance: { select: { name: true, tag: true } } } },
          outpost: true,
        },
        orderBy: [{ city: { sortOrder: 'asc' } }, { district: 'asc' }],
      }),
      db.turfPresence.findMany({ where: { roundPlayerId: player.id }, include: { city: { select: { slug: true } } } }),
      db.run.findMany({ where: { roundPlayerId, status: 'ACTIVE' }, select: { escortThugs: true } }),
      ruleset.turf.wars
        ? db.turfPush.findMany({
            where: { roundId: player.roundId, status: 'PENDING' },
            select: {
              id: true, turfId: true, attackerId: true, defenderId: true, squad: true, startedAt: true, landsAt: true,
              alliesCalledAt: true,
              attacker: { select: { allianceId: true } },
              defender: { select: { allianceId: true } },
              backups: { select: { playerId: true } },
            },
          })
        : Promise.resolve([]),
      ruleset.turf.wars
        ? db.turfPush.findMany({
            where: {
              roundId: player.roundId,
              attackerId: player.id,
              startedAt: { gt: new Date(now.getTime() - ruleset.turf.push.attackerCooldownHours * HOUR_MS) },
            },
            select: { turfId: true },
          })
        : Promise.resolve([]),
      ruleset.turf.wars
        ? db.turfPush.findMany({
            where: {
              roundId: player.roundId,
              status: 'LANDED',
              OR: [{ attackerId: player.id }, { defenderId: player.id }, { backups: { some: { playerId: player.id } } }],
            },
            include: {
              turf: { include: { city: { select: { slug: true } } } },
              attacker: { select: { publicPimpId: true, displayName: true } },
              defender: { select: { publicPimpId: true, displayName: true } },
              backups: { select: { playerId: true, kind: true, thugs: true, showedUp: true, wounded: true } },
            },
            orderBy: { settledAt: 'desc' },
            take: 40,
          })
        : Promise.resolve([]),
      ruleset.turf.wars
        ? turfRevengeByAttacker(db, player, player.roundId, ruleset, now)
        : Promise.resolve(new Map<string, Date>()),
    ]);

    const allianceIds = [...new Set(recentFights.flatMap((fight) => [fight.attackerAllianceId, fight.defenderAllianceId]).filter((id): id is string => Boolean(id)))];
    const allianceRows = allianceIds.length
      ? await db.alliance.findMany({ where: { id: { in: allianceIds } }, select: { id: true, tag: true } })
      : [];
    const allianceTags = new Map(allianceRows.map((alliance) => [alliance.id, alliance.tag]));
    const reportsByCity = new Map<string, TurfBattleReportDto[]>();
    for (const fight of recentFights) {
      if (!fight.settledAt || !fight.result) continue;
      const result = fight.result as unknown as StoredTurfFight;
      const role: TurfBattleReportDto['role'] = fight.attackerId === player.id
        ? 'attacker'
        : fight.defenderId === player.id ? 'defender' : 'ally';
      const myBackup = role === 'ally' ? fight.backups.find((backup) => backup.playerId === player.id) ?? null : null;
      const defenders = result.defenders ?? {
        corner: 0,
        ownerBackup: fight.backups.filter((backup) => backup.kind === 'OWNER').reduce((sum, backup) => sum + backup.thugs, 0),
        allyCommitted: fight.backups.filter((backup) => backup.kind === 'ALLY').reduce((sum, backup) => sum + backup.thugs, 0),
        allyShowed: result.allyBackup ?? 0,
      };
      const revengeUntil = role === 'attacker' ? null : revengeByAttacker.get(fight.attackerId) ?? null;
      const report: TurfBattleReportDto = {
        id: fight.id,
        city: fight.turf.city.slug,
        cityName: ruleset.cities?.[fight.turf.city.slug]?.name ?? fight.turf.city.slug,
        district: fight.turf.district as TurfBlockDto['district'],
        districtName: districtName(ruleset, fight.turf.city.slug, fight.turf.district),
        settledAt: fight.settledAt.toISOString(),
        role,
        won: role === 'attacker' ? result.won : !result.won,
        captured: fight.captured,
        unopposed: result.unopposed,
        stale: result.stale,
        attacker: {
          publicPimpId: fight.attacker.publicPimpId,
          displayName: fight.attacker.displayName,
          allianceTag: fight.attackerAllianceId ? allianceTags.get(fight.attackerAllianceId) ?? null : null,
        },
        defender: {
          publicPimpId: fight.defender.publicPimpId,
          displayName: fight.defender.displayName,
          allianceTag: fight.defenderAllianceId ? allianceTags.get(fight.defenderAllianceId) ?? null : null,
        },
        attackers: fight.squad,
        defenders,
        yourWounds: role === 'attacker'
          ? result.attackerWounds
          : role === 'defender' ? result.cornerWounds + result.ownerBackupWounds : myBackup?.wounded ?? 0,
        opponentWounds: role === 'attacker' ? result.defenderWounds : result.attackerWounds,
        showedUp: role === 'ally' ? myBackup?.showedUp ?? false : null,
        strength: result.strength,
        shieldUntil: result.shieldUntil ?? null,
        revengeUntil: revengeUntil?.toISOString() ?? null,
        outpostLoot: result.outpostLoot ?? null,
      };
      const cityReports = reportsByCity.get(report.city) ?? [];
      cityReports.push(report);
      reportsByCity.set(report.city, cityReports);
    }

    const presence = new Map(presenceRows.map((row) => [`${row.city.slug}:${row.district}`, presenceAfter(ruleset, row.turns, hoursSince(row.at, now))]));
    const crewThugs = player.thugs + activeRun.reduce((sum, run) => sum + run.escortThugs, 0);
    const armedAtHome = Math.min(homeFit(player), gunCount({ pistols: player.pistols, shotguns: player.shotguns, tek9s: player.tek9s, ak47s: player.ak47s }));
    const heldAtHome = rows.filter((row) => row.city.id === player.cityId && row.holder?.id === player.id).length;
    const heldAway = rows.filter((row) => row.city.id !== player.cityId && row.holder?.id === player.id).length;
    const cityByTurfId = new Map(rows.map((row) => [row.id, row.city.id]));
    const reservedAtHome = pendingPushes.filter((push) => push.attackerId === player.id && cityByTurfId.get(push.turfId) === player.cityId).length;
    const heldOrReservedAtHome = heldAtHome + reservedAtHome;
    const allianceHeld = (cityId: string) => player.allianceId
      ? rows.filter((row) => row.city.id === cityId && row.holder?.allianceId === player.allianceId).length : 0;
    const allianceReserved = (cityId: string) => player.allianceId
      ? pendingPushes.filter((push) => cityByTurfId.get(push.turfId) === cityId && push.attacker.allianceId === player.allianceId).length : 0;
    const allianceHeldOrReserved = (cityId: string) => allianceHeld(cityId) + allianceReserved(cityId);
    const controlByCityId = new Map<string, CityControl | null>();
    for (const cityId of new Set(rows.map((row) => row.city.id))) {
      controlByCityId.set(cityId, controlFromRows(ruleset, rows.filter((row) => row.city.id === cityId)));
    }

    const byCity = new Map<string, CityTurfDto>();
    for (const row of rows) {
      const citySlug = row.city.slug;
      const district = row.district as TurfBlockDto['district'];
      const block = { citySlug, district };
      const blocks = byCity.get(citySlug)?.blocks ?? [];
      const fullLocals = localsThugs(ruleset, block);
      const p = presence.get(`${citySlug}:${row.district}`) ?? 0;
      const isMine = row.holder?.id === player.id;
      const revengeUntil = row.holder ? revengeByAttacker.get(row.holder.id) ?? null : null;
      const revengeAvailable = Boolean(revengeUntil && revengeUntil > now);
      const minimum = cornerMinimumFor(ruleset, district, crewThugs);
      let claimBlockedReason: string | null = null;
      let pushBlockedReason: string | null = null;
      const pending = pendingPushes.find((push) => push.turfId === row.id) ?? null;
      const defenderSees = pending?.defenderId === player.id &&
        pending.landsAt <= new Date(now.getTime() + headsUpMinutes(ruleset, player.hideoutLookoutsLevel) * 60_000);
      const allySees = Boolean(
        pending?.alliesCalledAt &&
        player.allianceId &&
        pending.defender.allianceId === player.allianceId &&
        pending.defenderId !== player.id &&
        row.city.id === player.cityId,
      );
      const visiblePush = pending && (pending.attackerId === player.id || defenderSees || allySees) ? pending : null;
      const pushRole = !visiblePush ? null
        : visiblePush.attackerId === player.id ? 'attacker' as const
        : visiblePush.defenderId === player.id ? 'defender' as const
        : 'ally' as const;

      if (holdingOn(ruleset) && !row.holder) {
        if (row.city.id !== player.cityId) claimBlockedReason = ruleset.turf.outposts
          ? 'Send a run into town to establish an outpost on this block.'
          : 'Outposts arrive in 0.6.0-D.';
        else if (player.lockedUntil && player.lockedUntil > now) claimBlockedReason = 'You cannot claim turf while locked up.';
        else if (player.movingUntil && player.movingUntil > now) claimBlockedReason = 'Finish moving house before claiming turf.';
        else if (heldOrReservedAtHome >= ruleset.turf.caps.blocksPerCrewHome) claimBlockedReason = `You already hold your ${ruleset.turf.caps.blocksPerCrewHome}-block home cap.`;
        else if (player.allianceId && allianceHeldOrReserved(row.city.id) >= ruleset.turf.caps.blocksPerAllianceInCity) claimBlockedReason = `Your alliance already holds ${ruleset.turf.caps.blocksPerAllianceInCity} blocks here.`;
        else if (p < ruleset.turf.presence.turnsToClaim) claimBlockedReason = `Work this block until you have ${ruleset.turf.presence.turnsToClaim} presence.`;
        else if (armedAtHome < minimum) claimBlockedReason = `You need ${minimum} fit, armed thugs at home.`;
      } else if (holdingOn(ruleset) && row.holder && !isMine && !ruleset.turf.wars) {
        claimBlockedReason = 'A crew holds this block. Turf pushes arrive in 0.6.0-C.';
      }

      if (ruleset.turf.wars && row.holder && !isMine) {
        if (row.city.id !== player.cityId) pushBlockedReason = 'Outpost turf wars arrive in 0.6.0-D.';
        else if (row.holder.allianceId && player.allianceId === row.holder.allianceId) pushBlockedReason = 'That block belongs to an ally.';
        else if (row.shieldUntil && row.shieldUntil > now) pushBlockedReason = `Shielded until ${row.shieldUntil.toLocaleTimeString()}.`;
        else if (pending) pushBlockedReason = 'Someone is already pushing this block.';
        else if (myRecentPushes.some((push) => push.turfId === row.id)) pushBlockedReason = 'Your crew pushed this block too recently.';
        else if (heldOrReservedAtHome >= ruleset.turf.caps.blocksPerCrewHome) pushBlockedReason = `You already hold your ${ruleset.turf.caps.blocksPerCrewHome}-block home cap.`;
        else if (player.allianceId && allianceHeldOrReserved(row.city.id) >= ruleset.turf.caps.blocksPerAllianceInCity) pushBlockedReason = `Your alliance already holds ${ruleset.turf.caps.blocksPerAllianceInCity} blocks here.`;
        else if (!revengeAvailable && p < ruleset.turf.presence.turnsToClaim) pushBlockedReason = `Work this block until you have ${ruleset.turf.presence.turnsToClaim} presence.`;
        else if (armedAtHome < minimum) pushBlockedReason = `You need ${minimum} fit, armed thugs at home.`;
      }

      blocks.push({
        city: citySlug, district, districtName: districtName(ruleset, citySlug, row.district),
        holder: row.holder ? {
          publicPimpId: row.holder.publicPimpId, displayName: row.holder.displayName,
          alliance: row.holder.alliance ? { name: row.holder.alliance.name, tag: row.holder.alliance.tag } : null,
        } : null,
        isMine, cornerThugs: row.cornerThugs, cornerMinimumThugs: minimum, cornerGuns: dtoGuns(gunsFromTurf(row)),
        outpost: isMine && row.city.id !== player.cityId && row.outpost ? {
          cashCents: Number(row.outpost.cashCents),
          beer: row.outpost.beer,
          products: row.outpost.products as Record<string, number>,
        } : null,
        localsThugs: localsOnBlock(ruleset, {
          holderId: row.holderId, citySlug, district, localsThugs: row.localsThugs,
          localsAt: row.localsAt, localsReclaimAt: row.localsReclaimAt,
        }, now),
        localsFullThugs: fullLocals,
        localsReclaimAt: !row.holderId && row.localsReclaimAt && row.localsReclaimAt > now ? row.localsReclaimAt.toISOString() : null,
        heldSince: row.heldSince?.toISOString() ?? null,
        shieldUntil: row.shieldUntil?.toISOString() ?? null, presenceTurns: p, claimBlockedReason,
        push: visiblePush && pushRole ? {
          id: visiblePush.id,
          role: pushRole,
          squad: visiblePush.squad,
          startedAt: visiblePush.startedAt.toISOString(),
          landsAt: visiblePush.landsAt.toISOString(),
          alliesCalled: Boolean(visiblePush.alliesCalledAt),
          backupSent: visiblePush.backups.some((backup) => backup.playerId === player.id),
          canCallAllies: pushRole === 'defender' && Boolean(player.allianceId) && !visiblePush.alliesCalledAt,
        } : null,
        revengeAvailable,
        revengeUntil: revengeUntil?.toISOString() ?? null,
        pushBlockedReason,
      });
      const cityControl = controlByCityId.get(row.city.id) ?? null;
      byCity.set(citySlug, {
        enabled: true,
        holdingEnabled: holdingOn(ruleset),
        warsEnabled: ruleset.turf.wars === true,
        control: cityControl ? {
          alliance: cityControl.alliance,
          blocksHeld: cityControl.blocksHeld,
          blocksTotal: cityControl.blocksTotal,
          share: cityControl.share,
          isYours: cityControl.allianceId === player.allianceId,
        } : null,
        presenceRequired: ruleset.turf.presence.turnsToClaim,
        postTurnCost: ruleset.turf.corner.postTurnCost,
        pullTurnCost: ruleset.turf.corner.pullTurnCost,
        pushTurnCost: ruleset.turf.push.turnCost,
        pushWarningMinutes: ruleset.turf.push.warningMinutes,
        homeCap: ruleset.turf.caps.blocksPerCrewHome,
        awayCap: ruleset.turf.caps.blocksPerCrewAway,
        heldAtHome,
        heldAway,
        blocks,
        reports: reportsByCity.get(citySlug) ?? [],
      });
    }
    return byCity;
  },
};
