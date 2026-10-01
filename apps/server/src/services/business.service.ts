import type { PrismaClient } from '@prisma/client';
import {
  BUSINESS_JOB,
  businessIncomeCentsPerHour,
  businessStaff,
  businessStaffDepartures,
  businessUpkeep,
  defaultWorkSupplyPolicy,
  loadRulesetForRound,
  registerCapCents,
  workSupplyOrder,
  type Rng,
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
  businessThugs: number;
  businessWhores: number;
  /** Staff who walked off an unhappy crew's businesses and left it. */
  staffDeparted: number;
  /** Staff who came home because their crew no longer runs the block. */
  staffReturned: number;
  /** Uncollected register cash lost with a block the crew no longer runs. */
  registerLostCents: bigint;
}

/** Building, staffing and collecting are on in this round. */
export function buildingOn(ruleset: Ruleset): boolean {
  return Boolean(ruleset.turf && ruleset.business?.building);
}

export function staffKind(ruleset: Ruleset, business: BusinessKey): 'THUGS' | 'WHORES' {
  return ruleset.business!.catalog[business].staff;
}

/** Staff as a change to the crew's business columns. Totals never move: staff are still the crew's. */
export function staffColumns(ruleset: Ruleset, business: BusinessKey, count: number): { businessThugs: number; businessWhores: number } {
  return staffKind(ruleset, business) === 'WHORES'
    ? { businessThugs: 0, businessWhores: count }
    : { businessThugs: count, businessWhores: 0 };
}

/**
 * Send another crew's staff home and burn their register. Used when a new holder takes
 * over a business whose old staff have not settled home yet. The staff were always in
 * the other crew's counts, so only their business columns move.
 */
export async function releaseForeignStaff(
  tx: Db,
  ruleset: Ruleset,
  row: { id: string; kind: string; staff: number; staffOwnerId: string | null },
  now: Date,
): Promise<void> {
  if (!row.staffOwnerId || row.staff <= 0) return;
  const columns = staffColumns(ruleset, row.kind as BusinessKey, row.staff);
  await tx.roundPlayer.update({
    where: { id: row.staffOwnerId },
    data: {
      businessThugs: { decrement: columns.businessThugs },
      businessWhores: { decrement: columns.businessWhores },
    },
  });
  await tx.business.update({ where: { id: row.id }, data: { staff: 0, staffOwnerId: null, registerCents: 0n, accruedAt: now } });
}

export const BusinessService = {
  /**
   * Staff the crew lost some other way (lured off in a raid): take them off its businesses,
   * the least-built business first. Only the Business rows change; the caller writes the
   * crew's own counts.
   */
  async loseStaff(
    tx: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    lost: { thugs: number; whores: number },
    now: Date,
  ): Promise<void> {
    if (!buildingOn(ruleset) || (lost.thugs <= 0 && lost.whores <= 0)) return;
    const rows = await tx.business.findMany({
      where: { staffOwnerId: roundPlayerId, staff: { gt: 0 } },
      orderBy: [{ level: 'asc' }, { lot: 'desc' }],
    });
    const remaining = { THUGS: Math.max(0, lost.thugs), WHORES: Math.max(0, lost.whores) };
    for (const row of rows) {
      const kind = staffKind(ruleset, row.kind as BusinessKey);
      const take = Math.min(row.staff, remaining[kind]);
      if (take <= 0) continue;
      remaining[kind] -= take;
      await tx.business.update({ where: { id: row.id }, data: { staff: row.staff - take, ...(row.staff - take === 0 ? { accruedAt: now } : {}) } });
    }
  },

  /**
   * 1.1.0-B. Settle a crew's businesses, lazily, on whole hours like corner upkeep:
   * - staff on a block the crew no longer holds at home come home, and the register is lost;
   * - an unhappy crew's staff walk off, out of the business and out of the crew;
   * - a fully staffed business burns beer and product from home under the BUSINESS supply
   *   job, and earns its front income into the register for the share of each hour it was
   *   supplied, up to the register's cap.
   * Staff never leave the crew's counts by working: they are marked in businessThugs and
   * businessWhores, which keep them off the street, out of fights and away from the stove.
   * The caller holds the player's lock.
   */
  async settlePlayer(tx: Db, roundPlayerId: string, ruleset: Ruleset, now = new Date(), rng: Rng = Math.random): Promise<BusinessSettlement | null> {
    if (!buildingOn(ruleset)) return null;
    const player = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: {
        cityId: true, thugs: true, whores: true, woundedThugs: true, busyThugs: true, postedThugs: true,
        businessThugs: true, businessWhores: true, beer: true, crack: true, thugHappiness: true, whoreHappiness: true,
      },
    });
    const rows = await tx.business.findMany({
      where: { staffOwnerId: roundPlayerId },
      include: { turf: { select: { holderId: true, cityId: true, district: true, city: { select: { slug: true } } } } },
      orderBy: [{ turfId: 'asc' }, { lot: 'asc' }],
    });
    if (!rows.length && player.businessThugs === 0 && player.businessWhores === 0) return null;

    let { thugs, whores, beer } = player;
    let staffDeparted = 0;
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

    // What each row ends the settle with, so the crew's columns are rebuilt from the rows.
    const kept: Array<{ kind: 'THUGS' | 'WHORES'; staff: number }> = [];

    for (const row of rows) {
      const business = row.kind as BusinessKey;
      const kind = staffKind(ruleset, business);
      // B runs home businesses only: a lost block, or one that is now away, sends staff home.
      if (row.turf.holderId !== roundPlayerId || row.turf.cityId !== player.cityId) {
        staffReturned += row.staff;
        registerLostCents += row.registerCents;
        await tx.business.update({ where: { id: row.id }, data: { staff: 0, staffOwnerId: null, registerCents: 0n, accruedAt: now } });
        continue;
      }

      const wholeHours = Math.floor((now.getTime() - row.accruedAt.getTime()) / HOUR_MS);
      if (wholeHours <= 0) {
        kept.push({ kind, staff: row.staff });
        continue;
      }
      const advanceTo = new Date(row.accruedAt.getTime() + wholeHours * HOUR_MS);
      const required = businessStaff(ruleset, business, row.level);
      const running = row.level > 0 && row.staff > 0 && row.staff >= required;

      let register = row.registerCents;
      if (running) {
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
        register = register + earned > cap ? cap : register + earned;
      }

      // Unhappy staff walk off over the same hours, out of the business and the crew.
      const happiness = kind === 'WHORES' ? player.whoreHappiness : player.thugHappiness;
      const departed = businessStaffDepartures(ruleset, row.staff, happiness, wholeHours, rng);
      if (departed > 0) {
        staffDeparted += departed;
        if (kind === 'WHORES') whores = Math.max(0, whores - departed);
        else thugs = Math.max(0, thugs - departed);
      }
      const staff = row.staff - departed;
      kept.push({ kind, staff });
      await tx.business.update({ where: { id: row.id }, data: { registerCents: register, accruedAt: advanceTo, staff } });
    }

    let businessThugs = kept.filter((entry) => entry.kind === 'THUGS').reduce((sum, entry) => sum + entry.staff, 0);
    let businessWhores = kept.filter((entry) => entry.kind === 'WHORES').reduce((sum, entry) => sum + entry.staff, 0);

    // Anything else that took the crew's people since (an admin change, a path that does not
    // know about businesses) cannot leave more staff than crew: shed the difference.
    const thugRoom = Math.max(0, thugs - player.woundedThugs - player.busyThugs - player.postedThugs);
    const shed = { thugs: Math.max(0, businessThugs - thugRoom), whores: Math.max(0, businessWhores - whores) };
    if (shed.thugs > 0 || shed.whores > 0) {
      await BusinessService.loseStaff(tx, roundPlayerId, ruleset, shed, now);
      businessThugs -= shed.thugs;
      businessWhores -= shed.whores;
    }

    if (Object.keys(productChanges).length > 0) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, productChanges);
    if (thugs !== player.thugs || whores !== player.whores || beer !== player.beer ||
        businessThugs !== player.businessThugs || businessWhores !== player.businessWhores) {
      await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { thugs, whores, beer, businessThugs, businessWhores } });
    }
    return {
      beer, crack: inventory.CRACK ?? player.crack, thugs, whores, businessThugs, businessWhores,
      staffDeparted, staffReturned, registerLostCents,
    };
  },

  /** Settle in a transaction of its own, for read paths that do not run an action. */
  async settleFor(prisma: PrismaClient, roundPlayerId: string, now = new Date(), rng: Rng = Math.random): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { round: true } });
      if (!player) return;
      const ruleset = loadRulesetForRound(player.round);
      if (!buildingOn(ruleset)) return;
      await lockRoundPlayer(tx, roundPlayerId);
      await BusinessService.settlePlayer(tx, roundPlayerId, ruleset, now, rng);
    });
  },
};
