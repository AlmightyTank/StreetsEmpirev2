import type { PrismaClient } from '@prisma/client';
import {
  blockTier,
  businessLevelCostCents,
  businessStaff,
  isRacketKey,
  lotsOpen,
  racketRules,
  racketSwitchOpensAt,
  racketType,
  tierOpening,
  type Ruleset,
} from '@streets/rules-engine';
import type { BusinessKey, DistrictKey } from '@streets/rulesets';
import type {
  BusinessBuildInput,
  BusinessBuildResult,
  BusinessCollectInput,
  BusinessCollectResult,
  BusinessRacketInput,
  BusinessRacketResult,
  BusinessStaffInput,
  BusinessStaffResult,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs, workingWhores, type PlayerState } from './action.service.js';
import { BusinessService, buildingOn, racketOf, releaseForeignStaff, staffColumns } from './business.service.js';
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

/**
 * Staff stay in the crew's counts: sending them to a business (or bringing them home)
 * only marks them in businessThugs or businessWhores, which keeps them off the street,
 * out of fights and away from the stove.
 */
function withStaff(current: PlayerState, ruleset: Ruleset, business: BusinessKey, delta: number): PlayerState {
  if (delta === 0) return current;
  const columns = staffColumns(ruleset, business, delta);
  return {
    ...current,
    businessThugs: current.businessThugs + columns.businessThugs,
    businessWhores: current.businessWhores + columns.businessWhores,
  };
}

/** Can the crew send `count` more staff of this kind from home right now? */
function assertStaffAvailable(current: PlayerState, ruleset: Ruleset, business: BusinessKey, count: number): void {
  if (count <= 0) return;
  if (ruleset.business!.catalog[business].staff === 'WHORES') {
    const working = workingWhores(current);
    if (working < count) throw AppError.conflict('BUSINESS_NOT_ENOUGH_GIRLS', `This needs ${count} girls from home; you have ${working} working.`);
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
            // A new level comes fully staffed; the crew can turn it down again afterwards.
            staffTarget: staff,
            // A business taken over from another crew (or from nobody) starts with no racket.
            ...(row.staffOwnerId === roundPlayerId ? {} : { autoStaff: true, racket: null, racketSince: null }),
            staffOwnerId: roundPlayerId,
            ...(wasRunning ? {} : { accruedAt: now, registerCents: row.staffOwnerId === roundPlayerId ? row.registerCents : 0n }),
          },
        });

        if (racketRules(ruleset)) await BusinessService.refreshRacketEffects(tx, roundPlayerId, ruleset);
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

  /**
   * Set how many staff a business keeps (0 closes it; up to the level's max) and whether it
   * refills itself. It earns in proportion to its staff, so a crew can bring people home
   * when it needs them. Changing the head count costs turns; flipping auto-staff alone is free.
   */
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
        const maxStaff = businessStaff(ruleset, business, row.level);
        if (input.staff > maxStaff) throw AppError.badRequest('BUSINESS_TOO_MANY_STAFF', `The ${type.name} takes at most ${maxStaff} at this level.`);

        // Another crew's staff still standing in it go home first; their register is lost.
        if (row.staffOwnerId && row.staffOwnerId !== roundPlayerId) await releaseForeignStaff(tx, ruleset, row, now);
        const mine = row.staffOwnerId === roundPlayerId ? row.staff : 0;
        const autoStaff = input.autoStaff ?? (row.staffOwnerId === roundPlayerId ? row.autoStaff : true);
        const change = input.staff - mine;
        if (change === 0 && autoStaff === row.autoStaff && row.staffOwnerId === roundPlayerId && row.staffTarget === input.staff) {
          throw AppError.conflict('BUSINESS_NO_CHANGE', `The ${type.name} already has ${mine} staff.`);
        }
        const turnsUsed = change === 0 ? 0 : rules.staffTurnCost;
        assertTurns(current.turns, turnsUsed);
        assertStaffAvailable(current, ruleset, business, change);

        await tx.business.update({
          where: { id: row.id },
          data: {
            staff: input.staff,
            staffTarget: input.staff,
            autoStaff,
            staffOwnerId: roundPlayerId,
            // A business that was empty starts its clock now; one that was running keeps it.
            ...(mine > 0 ? {} : { accruedAt: now }),
            ...(row.staffOwnerId === roundPlayerId ? {} : { registerCents: 0n, racket: null, racketSince: null }),
          },
        });
        // Fewer staff run a weaker racket; none shut it.
        if (racketRules(ruleset)) await BusinessService.refreshRacketEffects(tx, roundPlayerId, ruleset);

        const next = { ...withStaff(current, ruleset, business, change), turns: current.turns - turnsUsed };
        const name = districtName(ruleset, turf.city.slug, district);
        return {
          next,
          result: {
            district, districtName: name, lot: input.lot, name: type.name, open: input.staff > 0,
            staff: input.staff, maxStaff, autoStaff, staffChange: change, staffKind: type.staff, turnsUsed,
          },
          activity: { type: 'BUSINESS_STAFF', payload: { district, districtName: name, lot: input.lot, kind: business, name: type.name, open: input.staff > 0, staff: input.staff, maxStaff, autoStaff } },
        };
      },
    });
  },

  /**
   * 1.1.0-C. Run one of the business's rackets on top of its front, switch to the other, or
   * shut it (null). Costs turns, and locks the choice for the ruleset's cooldown. The first
   * racket on a business is never locked out.
   */
  async racket(prisma: PrismaClient, roundPlayerId: string, input: BusinessRacketInput) {
    return ActionService.run<BusinessRacketResult>(prisma, roundPlayerId, {
      action: 'BUSINESS_RACKET', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        assertBuilding(ruleset);
        const rules = racketRules(ruleset);
        if (!rules) throw AppError.conflict('RACKETS_DISABLED', 'Rackets arrive in 1.1.0-C.');
        const { turf, row, district, business } = await heldLot(tx, ruleset, {
          roundId: round.id, roundPlayerId, cityId: player.cityId, district: input.district, lot: input.lot,
        });
        const type = ruleset.business!.catalog[business];
        if (row.level <= 0) throw AppError.conflict('BUSINESS_EMPTY_LOT', 'Build something on this lot first.');
        if (row.staffOwnerId !== roundPlayerId) throw AppError.conflict('BUSINESS_NOT_RUNNING', `Staff the ${type.name} before running a racket out of it.`);

        let racket: ReturnType<typeof racketOf> = null;
        if (input.racket !== null) {
          const key = input.racket.toUpperCase();
          if (!isRacketKey(key) || racketType(ruleset, key)?.business !== business) {
            throw AppError.badRequest('RACKET_NOT_HERE', `The ${type.name} cannot run that racket.`, { racket: 'Pick one of this business’s rackets.' });
          }
          racket = key;
        }
        const previous = racketOf(ruleset, row.racket);
        if (racket === previous) throw AppError.conflict('RACKET_NO_CHANGE', racket ? `The ${type.name} already runs ${racketType(ruleset, racket)!.name}.` : `The ${type.name} runs no racket.`);
        // Only a racket that has been running is locked: setting the first one never waits.
        const opensAt = previous ? racketSwitchOpensAt(ruleset, row.racketSince, now) : null;
        if (opensAt) {
          throw AppError.conflict('RACKET_COOLDOWN', `The ${type.name} can switch rackets again at ${opensAt.toISOString()}.`);
        }
        assertTurns(current.turns, rules.switchTurnCost);

        await tx.business.update({ where: { id: row.id }, data: { racket, racketSince: now } });
        await BusinessService.refreshRacketEffects(tx, roundPlayerId, ruleset);

        const name = districtName(ruleset, turf.city.slug, district);
        const racketName = racket ? racketType(ruleset, racket)!.name : null;
        const switchAt = new Date(now.getTime() + rules.switchCooldownHours * HOUR_MS).toISOString();
        return {
          next: { ...current, turns: current.turns - rules.switchTurnCost },
          result: { district, districtName: name, lot: input.lot, name: type.name, racket, racketName, previous, turnsUsed: rules.switchTurnCost, switchAt },
          activity: { type: 'BUSINESS_RACKET', payload: { district, districtName: name, lot: input.lot, kind: business, name: type.name, racket, racketName, previous, previousName: previous ? racketType(ruleset, previous)!.name : null } },
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
