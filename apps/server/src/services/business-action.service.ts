import type { PrismaClient } from '@prisma/client';
import {
  blockTier,
  businessLevelCostCents,
  businessStaff,
  lotsOpen,
  tierOpening,
  type Ruleset,
} from '@streets/rules-engine';
import type { BusinessKey, DistrictKey } from '@streets/rulesets';
import type {
  BusinessBuildInput,
  BusinessBuildResult,
  BusinessCollectInput,
  BusinessCollectResult,
  BusinessStaffInput,
  BusinessStaffResult,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs, type PlayerState } from './action.service.js';
import { buildingOn, releaseForeignStaff, staffWorthCents } from './business.service.js';
import { TurfService } from './turf.service.js';

const HOUR_MS = 3_600_000;
const TIER_NAME = { FOOTHOLD: 'a Foothold', ESTABLISHED: 'Established', STRONGHOLD: 'a Stronghold' } as const;

function districtName(ruleset: Ruleset, citySlug: string, district: DistrictKey): string {
  return ruleset.cities?.[citySlug]?.districts?.[district]?.name ?? ruleset.districts[district].name;
}

function assertBuilding(ruleset: Ruleset): void {
  if (!buildingOn(ruleset)) throw AppError.conflict('BUSINESS_DISABLED', 'Businesses cannot be built in this round.');
}

async function lockBlock(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}

/** Staff come out of, or go back into, the column they live in at home. */
function withStaff(current: PlayerState, ruleset: Ruleset, business: BusinessKey, delta: number): PlayerState {
  if (delta === 0) return current;
  const girls = ruleset.business!.catalog[business].staff === 'WHORES';
  return {
    ...current,
    thugs: girls ? current.thugs : current.thugs - delta,
    whores: girls ? current.whores - delta : current.whores,
    businessNetWorthCents: delta > 0
      ? current.businessNetWorthCents + staffWorthCents(ruleset, business, delta)
      : current.businessNetWorthCents - staffWorthCents(ruleset, business, -delta),
  };
}

/** Can the crew send `count` more staff of this kind from home right now? */
function assertStaffAvailable(current: PlayerState, ruleset: Ruleset, business: BusinessKey, count: number): void {
  if (count <= 0) return;
  if (ruleset.business!.catalog[business].staff === 'WHORES') {
    if (current.whores < count) throw AppError.conflict('BUSINESS_NOT_ENOUGH_GIRLS', `This needs ${count} girls from home; you have ${current.whores}.`);
    return;
  }
  const fit = fitThugs(current);
  if (fit < count) throw AppError.conflict('BUSINESS_NOT_ENOUGH_THUGS', `This needs ${count} fit thugs from home; you have ${fit}.`);
}

/**
 * The player's own home block and one of its lots, locked. Businesses only run on a
 * block the crew holds in the city it lives in (outposts arrive in 1.1.0-E).
 */
async function heldLot(
  tx: Db,
  ruleset: Ruleset,
  input: { roundId: string; roundPlayerId: string; cityId: string; district: string; lot: number },
) {
  await TurfService.ensureRound(tx, input.roundId, ruleset);
  const district = input.district as DistrictKey;
  if (!ruleset.turf!.districts[district]) throw AppError.badRequest('UNKNOWN_DISTRICT', 'That is not a turf block.');
  const block = await tx.turf.findUnique({
    where: { roundId_cityId_district: { roundId: input.roundId, cityId: input.cityId, district } },
    select: { id: true },
  });
  if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not on the map.');
  await lockBlock(tx, block.id);
  const turf = await tx.turf.findUniqueOrThrow({
    where: { id: block.id },
    include: { city: { select: { slug: true } }, businesses: { orderBy: { lot: 'asc' } } },
  });
  if (turf.holderId !== input.roundPlayerId) throw AppError.conflict('BUSINESS_NOT_YOUR_BLOCK', 'You can only run businesses on a block your crew holds.');
  const row = turf.businesses.find((entry) => entry.lot === input.lot);
  if (!row) throw AppError.notFound('BUSINESS_NOT_FOUND', 'That lot is not on this block.');
  return { turf, row, district, business: row.kind as BusinessKey };
}

export const BusinessActionService = {
  /** Build an empty lot at level 1, or take a business up a level. Staffs it for the new level. */
  async build(prisma: PrismaClient, roundPlayerId: string, input: BusinessBuildInput) {
    return ActionService.run<BusinessBuildResult>(prisma, roundPlayerId, {
      action: 'BUSINESS_BUILD', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        assertBuilding(ruleset);
        const { turf, row, district, business } = await heldLot(tx, ruleset, {
          roundId: round.id, roundPlayerId, cityId: player.cityId, district: input.district, lot: input.lot,
        });
        const rules = ruleset.business!;
        const type = rules.catalog[business];

        // The block's tier opens its lots: uninterrupted holding plus levels invested.
        const heldHours = turf.heldSince ? (now.getTime() - turf.heldSince.getTime()) / HOUR_MS : 0;
        const tier = blockTier(ruleset, { heldHours, levels: turf.businesses.map((entry) => entry.level) });
        if (input.lot > lotsOpen(ruleset, tier)) {
          const opening = tierOpening(ruleset, input.lot);
          throw AppError.conflict('BUSINESS_LOT_CLOSED', `Lot ${input.lot} opens when the block is ${opening ? TIER_NAME[opening] : 'bigger'}.`);
        }
        if (row.level >= rules.levels.maxLevel) throw AppError.conflict('BUSINESS_MAX_LEVEL', `${type.name} is already at the top level.`);

        const level = row.level + 1;
        const costCents = businessLevelCostCents(ruleset, business, level);
        assertTurns(current.turns, rules.levels.buildTurnCost);
        if (current.cashCents < BigInt(costCents)) {
          throw AppError.conflict('NOT_ENOUGH_CASH', `${level === 1 ? 'Building' : 'Upgrading'} the ${type.name} costs $${(costCents / 100).toLocaleString('en-US')}.`);
        }

        // Another crew's staff still standing in it go home first; their register is lost.
        if (row.staffOwnerId && row.staffOwnerId !== roundPlayerId) await releaseForeignStaff(tx, ruleset, row, now);
        const mine = row.staffOwnerId === roundPlayerId ? row.staff : 0;
        const staff = businessStaff(ruleset, business, level);
        const staffAdded = staff - mine;
        assertStaffAvailable(current, ruleset, business, staffAdded);

        const wasRunning = mine > 0 && row.level > 0;
        await tx.business.update({
          where: { id: row.id },
          data: {
            level,
            staff,
            staffOwnerId: roundPlayerId,
            ...(wasRunning ? {} : { accruedAt: now, registerCents: row.staffOwnerId === roundPlayerId ? row.registerCents : 0n }),
          },
        });

        const next: PlayerState = {
          ...withStaff(current, ruleset, business, staffAdded),
          cashCents: current.cashCents - BigInt(costCents),
          turns: current.turns - rules.levels.buildTurnCost,
        };
        const name = districtName(ruleset, turf.city.slug, district);
        return {
          next,
          result: {
            district, districtName: name, lot: input.lot, kind: business, name: type.name, level, staff,
            staffKind: type.staff, staffAdded, costCents, turnsUsed: rules.levels.buildTurnCost,
          },
          ledger: [{
            source: 'BUSINESS_BUILD',
            label: level === 1 ? `Built ${type.name}` : `${type.name} to level ${level}`,
            amountCents: -BigInt(costCents),
            metadata: { district, lot: input.lot, kind: business, level },
          }],
          activity: { type: 'BUSINESS_BUILD', payload: { district, districtName: name, lot: input.lot, kind: business, name: type.name, level, staff, costCents } },
        };
      },
    });
  },

  /** Open a business (send its staff in from home) or close it (bring them home). */
  async staff(prisma: PrismaClient, roundPlayerId: string, input: BusinessStaffInput) {
    return ActionService.run<BusinessStaffResult>(prisma, roundPlayerId, {
      action: 'BUSINESS_STAFF', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        assertBuilding(ruleset);
        const { turf, row, district, business } = await heldLot(tx, ruleset, {
          roundId: round.id, roundPlayerId, cityId: player.cityId, district: input.district, lot: input.lot,
        });
        const rules = ruleset.business!;
        const type = rules.catalog[business];
        if (row.level <= 0) throw AppError.conflict('BUSINESS_EMPTY_LOT', 'Build something on this lot first.');
        assertTurns(current.turns, rules.staffTurnCost);

        let next: PlayerState;
        let staff: number;
        if (input.open) {
          const mine = row.staffOwnerId === roundPlayerId ? row.staff : 0;
          if (mine > 0) throw AppError.conflict('BUSINESS_ALREADY_OPEN', `The ${type.name} is already open.`);
          if (row.staffOwnerId && row.staffOwnerId !== roundPlayerId) await releaseForeignStaff(tx, ruleset, row, now);
          staff = businessStaff(ruleset, business, row.level);
          assertStaffAvailable(current, ruleset, business, staff);
          await tx.business.update({
            where: { id: row.id },
            data: {
              staff,
              staffOwnerId: roundPlayerId,
              accruedAt: now,
              ...(row.staffOwnerId === roundPlayerId ? {} : { registerCents: 0n }),
            },
          });
          next = withStaff(current, ruleset, business, staff);
        } else {
          if (row.staffOwnerId !== roundPlayerId || row.staff <= 0) throw AppError.conflict('BUSINESS_ALREADY_CLOSED', `The ${type.name} is already closed.`);
          // Closed, the register stays: the crew still holds the block and can collect it.
          await tx.business.update({ where: { id: row.id }, data: { staff: 0, accruedAt: now } });
          next = withStaff(current, ruleset, business, -row.staff);
          staff = 0;
        }
        next = { ...next, turns: current.turns - rules.staffTurnCost };
        const name = districtName(ruleset, turf.city.slug, district);
        return {
          next,
          result: { district, districtName: name, lot: input.lot, name: type.name, open: input.open, staff, staffKind: type.staff, turnsUsed: rules.staffTurnCost },
          activity: { type: 'BUSINESS_STAFF', payload: { district, districtName: name, lot: input.lot, kind: business, name: type.name, open: input.open, staff } },
        };
      },
    });
  },

  /** Empty every register on the crew's home blocks into its cash. */
  async collect(prisma: PrismaClient, roundPlayerId: string, input: BusinessCollectInput) {
    return ActionService.run<BusinessCollectResult>(prisma, roundPlayerId, {
      action: 'BUSINESS_COLLECT', actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        assertBuilding(ruleset);
        const rules = ruleset.business!;
        // The settle at the start of the action has already sent home any staff on a lost
        // block, so everything still owned here is on a block the crew holds at home.
        const rows = await tx.business.findMany({
          where: { staffOwnerId: roundPlayerId, registerCents: { gt: 0n }, turf: { holderId: roundPlayerId } },
          select: { id: true, registerCents: true },
        });
        const total = rows.reduce((sum, row) => sum + row.registerCents, 0n);
        if (total <= 0n) throw AppError.conflict('BUSINESS_NOTHING_TO_COLLECT', 'Every register is empty.');
        assertTurns(current.turns, rules.register.collectTurnCost);
        await tx.business.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { registerCents: 0n } });
        const collectedCents = Number(total);
        return {
          next: { ...current, cashCents: current.cashCents + total, turns: current.turns - rules.register.collectTurnCost },
          result: { collectedCents, businesses: rows.length, turnsUsed: rules.register.collectTurnCost },
          ledger: [{ source: 'BUSINESS_INCOME', label: 'Business income', amountCents: total, metadata: { businesses: rows.length } }],
          activity: { type: 'BUSINESS_COLLECT', payload: { collectedCents, businesses: rows.length } },
        };
      },
    });
  },
};
