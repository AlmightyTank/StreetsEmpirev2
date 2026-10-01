import type { PrismaClient } from '@prisma/client';
import {
  BUSINESS_JOB,
  businessIncomeCentsPerHour,
  businessStaff,
  businessUpkeep,
  defaultWorkSupplyPolicy,
  loadRulesetForRound,
  registerCapCents,
  workSupplyOrder,
  type Ruleset,
} from '@streets/rules-engine';
import type { BusinessKey, DistrictKey } from '@streets/rulesets';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { ProductInventoryService } from './product-inventory.service.js';

const HOUR_MS = 3_600_000;

export interface BusinessSettlement {
  beer: number;
  crack: number;
  thugs: number;
  whores: number;
  businessNetWorthCents: bigint;
  /** Staff who came home because their crew no longer runs the block. */
  staffReturned: number;
  /** Uncollected register cash lost with a block the crew no longer runs. */
  registerLostCents: bigint;
}

/** Building, staffing and collecting are on in this round. */
export function buildingOn(ruleset: Ruleset): boolean {
  return Boolean(ruleset.turf && ruleset.business?.building);
}

/** What one staff member is worth: the same as they were at home. */
export function staffWorthCents(ruleset: Ruleset, business: BusinessKey, count: number): bigint {
  const kind = ruleset.business!.catalog[business].staff;
  const each = kind === 'WHORES' ? ruleset.economy.netWorth.perWhoreCents : ruleset.economy.netWorth.perThugCents;
  return BigInt(each) * BigInt(Math.max(0, count));
}

/** Staff go home: back into the column they came from. */
export function staffHome(ruleset: Ruleset, business: BusinessKey, count: number): { thugs: number; whores: number } {
  const kind = ruleset.business!.catalog[business].staff;
  return kind === 'WHORES' ? { thugs: 0, whores: count } : { thugs: count, whores: 0 };
}

/**
 * Send another crew's staff home and burn their register. Used when a new holder takes
 * over a business whose old staff have not settled home yet. The caller holds the
 * block's lock; the increments are atomic on the other crew's row.
 */
export async function releaseForeignStaff(
  tx: Db,
  ruleset: Ruleset,
  row: { id: string; kind: string; staff: number; staffOwnerId: string | null },
  now: Date,
): Promise<void> {
  if (!row.staffOwnerId || row.staff <= 0) return;
  const business = row.kind as BusinessKey;
  const home = staffHome(ruleset, business, row.staff);
  await tx.roundPlayer.update({
    where: { id: row.staffOwnerId },
    data: {
      thugs: { increment: home.thugs },
      whores: { increment: home.whores },
      businessNetWorthCents: { decrement: staffWorthCents(ruleset, business, row.staff) },
    },
  });
  await tx.business.update({ where: { id: row.id }, data: { staff: 0, staffOwnerId: null, registerCents: 0n, accruedAt: now } });
}

export const BusinessService = {
  /**
   * 1.1.0-B. Settle a crew's businesses, lazily, on whole hours like corner upkeep:
   * - staff on a block the crew no longer holds at home come home, and the register is lost;
   * - a staffed business burns beer and product from home under the BUSINESS supply job,
   *   and earns its front income into the register for the share of each hour it was
   *   supplied, up to the register's cap.
   * The caller holds the player's lock.
   */
  async settlePlayer(tx: Db, roundPlayerId: string, ruleset: Ruleset, now = new Date()): Promise<BusinessSettlement | null> {
    if (!buildingOn(ruleset)) return null;
    const rows = await tx.business.findMany({
      where: { staffOwnerId: roundPlayerId },
      include: { turf: { select: { holderId: true, cityId: true, district: true, city: { select: { slug: true } } } } },
      orderBy: [{ turfId: 'asc' }, { lot: 'asc' }],
    });
    if (!rows.length) return null;

    const player = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { cityId: true, thugs: true, whores: true, beer: true, crack: true, businessNetWorthCents: true },
    });
    let { thugs, whores, beer, businessNetWorthCents } = player;
    let staffReturned = 0;
    let registerLostCents = 0n;

    const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
    const productChanges: Record<string, number> = {};
    const policyRow = await tx.workSupplyPolicy.findUnique({ where: { roundPlayerId_job: { roundPlayerId, job: BUSINESS_JOB } } });
    const order = workSupplyOrder(policyRow
      ? { primary: policyRow.primary, fallback: policyRow.fallback, emergency: policyRow.emergency, strict: policyRow.strict }
      : defaultWorkSupplyPolicy());
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

    for (const row of rows) {
      const business = row.kind as BusinessKey;
      // B runs home businesses only: a lost block, or one that is now away, sends staff home.
      if (row.turf.holderId !== roundPlayerId || row.turf.cityId !== player.cityId) {
        const home = staffHome(ruleset, business, row.staff);
        thugs += home.thugs;
        whores += home.whores;
        businessNetWorthCents -= staffWorthCents(ruleset, business, row.staff);
        staffReturned += row.staff;
        registerLostCents += row.registerCents;
        await tx.business.update({ where: { id: row.id }, data: { staff: 0, staffOwnerId: null, registerCents: 0n, accruedAt: now } });
        continue;
      }

      const wholeHours = Math.floor((now.getTime() - row.accruedAt.getTime()) / HOUR_MS);
      if (wholeHours <= 0) continue;
      const advanceTo = new Date(row.accruedAt.getTime() + wholeHours * HOUR_MS);
      const required = businessStaff(ruleset, business, row.level);
      // A closed business (no staff) earns nothing and burns nothing; its clock just moves on.
      if (row.level <= 0 || row.staff <= 0 || row.staff < required) {
        await tx.business.update({ where: { id: row.id }, data: { accruedAt: advanceTo } });
        continue;
      }

      const need = businessUpkeep(ruleset, row.staff, wholeHours);
      const beerUsed = Math.min(beer, need.beer);
      beer -= beerUsed;
      const productUsed = takeProduct(need.product);
      const beerShare = need.beer > 0 ? beerUsed / need.beer : 1;
      const productShare = need.product > 0 ? productUsed / need.product : 1;
      const suppliedShare = Math.max(0, Math.min(1, beerShare, productShare));

      const perHour = businessIncomeCentsPerHour(ruleset, {
        citySlug: row.turf.city.slug,
        district: row.turf.district as DistrictKey,
        business,
        level: row.level,
      });
      const earned = BigInt(Math.floor(perHour * wholeHours * suppliedShare));
      const cap = BigInt(registerCapCents(ruleset, perHour));
      const register = row.registerCents + earned > cap ? cap : row.registerCents + earned;
      await tx.business.update({ where: { id: row.id }, data: { registerCents: register, accruedAt: advanceTo } });
    }

    if (Object.keys(productChanges).length > 0) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, productChanges);
    if (businessNetWorthCents < 0n) throw new RangeError('Business net worth fell below zero.');
    if (thugs !== player.thugs || whores !== player.whores || beer !== player.beer || businessNetWorthCents !== player.businessNetWorthCents) {
      await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { thugs, whores, beer, businessNetWorthCents } });
    }
    return {
      beer, crack: inventory.CRACK ?? player.crack, thugs, whores, businessNetWorthCents, staffReturned, registerLostCents,
    };
  },

  /** Settle in a transaction of its own, for read paths that do not run an action. */
  async settleFor(prisma: PrismaClient, roundPlayerId: string, now = new Date()): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { round: true } });
      if (!player) return;
      const ruleset = loadRulesetForRound(player.round);
      if (!buildingOn(ruleset)) return;
      await lockRoundPlayer(tx, roundPlayerId);
      await BusinessService.settlePlayer(tx, roundPlayerId, ruleset, now);
    });
  },
};
