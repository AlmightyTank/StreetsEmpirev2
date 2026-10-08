import type { Prisma, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { VehicleClassId } from '@streets/rulesets';
import type { AdminPlayerFleetDto, AdminVehicleAdjustmentInput, AdminVehicleClassDto, AdminVehicleRoundDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { fitThugs, toState } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { assertCorrectionState } from './admin-correction.shared.js';
import { writeRanks } from './combat.service.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';
import { PlayerStateService } from './player-state.service.js';
import { RankingService } from './ranking.service.js';
import { VEHICLE_FIELDS, readVehicleDamage, readVehicleLoadout } from './vehicle-fleet.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAYER_LIMIT = 50;
const PROBLEM_LIMIT = 25;
const CLASSES: readonly VehicleClassId[] = ['LOW_RIDER', 'SEDAN', 'VAN'];
/** A correction sets home counts; anything this large is a typo, not a fleet. */
export const ADMIN_VEHICLE_MAX = 500;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type HomeCounts = Record<(typeof VEHICLE_FIELDS)[VehicleClassId][keyof (typeof VEHICLE_FIELDS)[VehicleClassId]], number>;

function className(ruleset: ReturnType<typeof loadRulesetForRound>, classId: VehicleClassId): string {
  return ruleset.vehicleCatalog?.classes.find((entry) => entry.id === classId)?.name ?? classId;
}

async function ledgerSum(prisma: PrismaClient, where: Prisma.EconomyLedgerEntryWhereInput): Promise<{ entries: number; spentCents: number }> {
  const sum = await prisma.economyLedgerEntry.aggregate({ where, _count: { _all: true }, _sum: { amountCents: true } });
  return { entries: sum._count._all, spentCents: -Number(sum._sum.amountCents ?? 0n) };
}

/** 1.5.0-E. A player's fleet for the inspector: where every car is, and the garage bill so far. */
export async function adminPlayerFleet(prisma: PrismaClient, roundPlayerId: string): Promise<AdminPlayerFleetDto | null> {
  const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { round: { select: { rulesetId: true, rulesetVersion: true } } } });
  if (!player) return null;
  const ruleset = loadRulesetForRound(player.round);
  if (!ruleset.vehicleCatalog) return null;
  const runs = await prisma.run.findMany({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true, lowRiders: true, vehicleLoadout: true, vehicleDamage: true }, orderBy: { launchedAt: 'asc' } });
  const loaded = runs.map((run) => {
    const loadout = readVehicleLoadout(run.vehicleLoadout, run.lowRiders);
    return { runId: run.id, loadout, ...readVehicleDamage(run.vehicleDamage, loadout) };
  });
  const classes = ruleset.vehicleCatalog.classes.map((vehicleClass): AdminVehicleClassDto => {
    const fields = VEHICLE_FIELDS[vehicleClass.id];
    return {
      classId: vehicleClass.id,
      name: vehicleClass.name,
      ready: player[fields.ready],
      away: loaded.reduce((sum, run) => sum + run.loadout[vehicleClass.id], 0),
      damaged: player[fields.damaged],
      disabled: player[fields.disabled],
    };
  });
  return { classes, runs: loaded, service: await ledgerSum(prisma, { roundPlayerId, source: 'VEHICLE_SERVICE' }) };
}

export const AdminVehicleService = {
  async report(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminVehicleRoundDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true, rulesetId: true, rulesetVersion: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const none = { entries: 0, spentCents: 0 };
    const empty: AdminVehicleRoundDto = {
      roundId, generatedAt: now.toISOString(), enabled: false, rulesetId: round.rulesetId, fleet: [], players: [],
      service24h: none, service7d: none, purchases7d: none, adjustments7d: 0, integrity: { checked: 0, problems: [] },
    };
    if (!ruleset.vehicleCatalog) return empty;

    const inRound = { roundPlayer: { roundId } };
    const day = new Date(now.getTime() - DAY_MS);
    const week = new Date(now.getTime() - 7 * DAY_MS);
    const [players, runs, service24h, service7d, purchases7d, adjustments7d] = await Promise.all([
      prisma.roundPlayer.findMany({
        where: { roundId },
        select: { id: true, displayName: true, lowRiders: true, sedans: true, vans: true, damagedLowRiders: true, damagedSedans: true, damagedVans: true, disabledLowRiders: true, disabledSedans: true, disabledVans: true },
      }),
      prisma.run.findMany({ where: { status: 'ACTIVE', ...inRound }, select: { id: true, roundPlayerId: true, lowRiders: true, vehicleLoadout: true, vehicleDamage: true } }),
      ledgerSum(prisma, { ...inRound, source: 'VEHICLE_SERVICE', createdAt: { gte: day } }),
      ledgerSum(prisma, { ...inRound, source: 'VEHICLE_SERVICE', createdAt: { gte: week } }),
      ledgerSum(prisma, { ...inRound, source: 'STORE_BUY', label: { startsWith: 'Charlie’s garage' }, createdAt: { gte: week } }),
      prisma.adminAuditLog.count({ where: { action: 'vehicle.fleet-adjust', createdAt: { gte: week }, after: { path: ['roundId'], equals: roundId } } }),
    ]);
    const names = new Map(players.map((player) => [player.id, player.displayName]));
    const awayBy = new Map<string, Record<VehicleClassId, number>>();
    const problems: AdminVehicleRoundDto['integrity']['problems'] = [];
    for (const run of runs) {
      const counts = run.vehicleLoadout && typeof run.vehicleLoadout === 'object' && !Array.isArray(run.vehicleLoadout) ? run.vehicleLoadout as Record<string, unknown> : {};
      const stored = CLASSES.reduce((sum, key) => sum + (typeof counts[key] === 'number' ? counts[key] as number : 0), 0);
      // A loadout that misses its car count is read as all Low-Riders: the run still drives, but a class was lost.
      if (stored !== run.lowRiders) problems.push({ runId: run.id, roundPlayerId: run.roundPlayerId, displayName: names.get(run.roundPlayerId) ?? run.roundPlayerId, problem: `classes add up to ${stored}, the run has ${run.lowRiders} cars` });
      const loadout = readVehicleLoadout(run.vehicleLoadout, run.lowRiders);
      const away = awayBy.get(run.roundPlayerId) ?? { LOW_RIDER: 0, SEDAN: 0, VAN: 0 };
      for (const key of CLASSES) away[key] += loadout[key];
      awayBy.set(run.roundPlayerId, away);
    }
    const perPlayer = players.map((player) => {
      const away = awayBy.get(player.id) ?? { LOW_RIDER: 0, SEDAN: 0, VAN: 0 };
      return {
        roundPlayerId: player.id,
        displayName: player.displayName,
        ready: player.lowRiders + player.sedans + player.vans,
        away: away.LOW_RIDER + away.SEDAN + away.VAN,
        damaged: player.damagedLowRiders + player.damagedSedans + player.damagedVans,
        disabled: player.disabledLowRiders + player.disabledSedans + player.disabledVans,
      };
    });
    const fleet = CLASSES.filter((classId) => ruleset.vehicleCatalog!.classes.some((entry) => entry.id === classId)).map((classId): AdminVehicleClassDto => {
      const fields = VEHICLE_FIELDS[classId];
      return {
        classId,
        name: className(ruleset, classId),
        ready: players.reduce((sum, player) => sum + player[fields.ready], 0),
        away: [...awayBy.values()].reduce((sum, away) => sum + away[classId], 0),
        damaged: players.reduce((sum, player) => sum + player[fields.damaged], 0),
        disabled: players.reduce((sum, player) => sum + player[fields.disabled], 0),
      };
    });
    return {
      roundId,
      generatedAt: now.toISOString(),
      enabled: true,
      rulesetId: round.rulesetId,
      fleet,
      players: perPlayer
        .filter((row) => row.ready + row.away + row.damaged + row.disabled > 0)
        .sort((a, b) => (b.ready + b.away + b.damaged + b.disabled) - (a.ready + a.away + a.damaged + a.disabled))
        .slice(0, PLAYER_LIMIT),
      service24h,
      service7d,
      purchases7d,
      adjustments7d,
      integrity: { checked: runs.length, problems: problems.slice(0, PROBLEM_LIMIT) },
    };
  },

  /**
   * 1.5.0-E. Set one class's home counts exactly: Ready, Damaged and Disabled. Cars out on a run
   * are left alone; they come home on their own. Settles the player first, recomputes net worth
   * and ranks, and leaves a player-visible activity and an audit row.
   */
  async adjust(prisma: PrismaClient, actor: AuditActor, roundPlayerId: string, input: AdminVehicleAdjustmentInput, now = new Date()) {
    for (const [field, value] of Object.entries({ ready: input.ready, damaged: input.damaged, disabled: input.disabled })) {
      if (!Number.isSafeInteger(value) || value < 0 || value > ADMIN_VEHICLE_MAX) {
        throw AppError.badRequest('VEHICLE_COUNT_INVALID', `Use a whole number from 0 to ${ADMIN_VEHICLE_MAX}.`, { [field]: `0 to ${ADMIN_VEHICLE_MAX}.` });
      }
    }
    await prisma.$transaction(async (tx) => {
      const prior = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { round: { select: { id: true, status: true } } } });
      if (!prior) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
      if (prior.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to correct your own fleet.');
      if (prior.round.status !== 'ACTIVE' && prior.round.status !== 'REGISTRATION') {
        throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its fleets are frozen.');
      }
      // A run that is due home lands its cars before the correction reads the counts.
      const { player, ruleset } = await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: false });
      const vehicleClass = ruleset.vehicleCatalog?.classes.find((entry) => entry.id === input.classId);
      if (!ruleset.vehicleCatalog) throw AppError.conflict('VEHICLES_DISABLED', 'This round has no vehicle classes.');
      if (!vehicleClass) throw AppError.notFound('VEHICLE_CLASS_NOT_FOUND', 'That vehicle class is not part of this round.');
      if (!ruleset.vehicleCatalog.service && (input.damaged > 0 || input.disabled > 0)) {
        throw AppError.badRequest('VEHICLE_SERVICE_DISABLED', 'This round has no garage service, so nothing can be Damaged or Disabled.');
      }
      const fields = VEHICLE_FIELDS[input.classId];
      const before = { ready: player[fields.ready], damaged: player[fields.damaged], disabled: player[fields.disabled] };
      const after = { ready: input.ready, damaged: input.damaged, disabled: input.disabled };
      if (before.ready === after.ready && before.damaged === after.damaged && before.disabled === after.disabled) {
        throw AppError.conflict('VEHICLES_UNCHANGED', `${player.displayName} already has exactly those ${vehicleClass.name}s at home.`);
      }

      const next = { ...toState(player), [fields.ready]: after.ready, [fields.damaged]: after.damaged, [fields.disabled]: after.disabled };
      assertCorrectionState(next, ruleset, player.displayName);
      const ranksBefore = await RankingService.ranksFor(tx, player);
      const held = await HappinessService.otherProducts(tx, player.id, ruleset);
      const worth = NetWorthService.calculate({ ...next, products: held }, ruleset);
      const happiness = HappinessService.recalculate({ ...next, thugs: fitThugs(next), products: held }, ruleset, await HappinessService.awayPenalty(tx, ruleset, player.id, now));
      const counts: Partial<HomeCounts> = { [fields.ready]: after.ready, [fields.damaged]: after.damaged, [fields.disabled]: after.disabled };
      await tx.roundPlayer.update({
        where: { id: player.id },
        data: { ...counts, netWorthCents: worth, whoreHappiness: happiness.whoreHappiness, thugHappiness: happiness.thugHappiness },
      });
      const ranksAfter = await RankingService.ranksFor(tx, { ...player, netWorthCents: worth });
      await writeRanks(tx, ruleset, now, [[player.id, prior, ranksBefore, ranksAfter]]);

      await ActivityService.log(tx, player.id, 'ADMIN_GRANT', json({
        reason: input.reason,
        corrected: { classId: input.classId, className: vehicleClass.name, before, after },
      }));
      await AdminAuditService.record(tx, actor, {
        action: 'vehicle.fleet-adjust',
        targetType: 'player-vehicles',
        targetId: player.id,
        reason: input.reason,
        before: { roundId: prior.round.id, roundPlayerId: player.id, displayName: player.displayName, classId: input.classId, ...before, netWorthCents: Number(player.netWorthCents) },
        after: { roundId: prior.round.id, roundPlayerId: player.id, displayName: player.displayName, classId: input.classId, ...after, netWorthCents: Number(worth) },
      });
    }, { timeout: 15_000, maxWait: 10_000 });
    const { AdminPlayerService } = await import('./admin-player.service.js');
    return AdminPlayerService.inspect(prisma, roundPlayerId, now);
  },
};
