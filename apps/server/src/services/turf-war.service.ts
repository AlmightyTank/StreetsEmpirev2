import type { Prisma, PrismaClient } from '@prisma/client';
import { cornerMinimumFor, headsUpMinutes, turfPushCombatModel, type Ruleset } from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type {
  TurfPushBackupInput,
  TurfPushBackupResult,
  TurfPushCallInput,
  TurfPushCallResult,
  TurfPushInput,
  TurfPushStartResult,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { accountsShareNetwork } from './admin-signals.service.js';
import { allianceTargetBlock } from './alliance.service.js';
import {
  TurfService,
  allocateCornerGuns,
  cornerGunWorthCents,
  type CornerGuns,
} from './turf.service.js';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function requireWars(ruleset: Ruleset) {
  if (!ruleset.turf?.wars) throw AppError.conflict('TURF_WARS_DISABLED', 'Player turf wars are not open in this round.');
  return ruleset.turf;
}

function engineGuns(guns: CornerGuns) {
  return { PISTOL: guns.pistols, SHOTGUN: guns.shotguns, TEK9: guns.tek9s, AK47: guns.ak47s };
}

async function lockBlock(tx: any, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}
async function lockPush(tx: any, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "TurfPush" WHERE id = ${id} FOR UPDATE`;
}

async function crewSize(tx: any, playerId: string, homeThugs: number): Promise<number> {
  const run = await tx.run.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, select: { escortThugs: true } });
  return homeThugs + (run?.escortThugs ?? 0);
}

async function assertRoom(tx: any, player: any, roundId: string, cityId: string, ruleset: Ruleset): Promise<void> {
  const rules = ruleset.turf!;
  const [held, reserved] = await Promise.all([
    tx.turf.count({ where: { roundId, cityId, holderId: player.id } }),
    rules.wars ? tx.turfPush.count({ where: { roundId, attackerId: player.id, status: 'PENDING', turf: { cityId } } }) : 0,
  ]);
  if (held + reserved >= rules.caps.blocksPerCrewHome) {
    throw AppError.conflict('TURF_CREW_CAP', `You already hold or are pushing for your ${rules.caps.blocksPerCrewHome}-block home cap.`);
  }
  if (player.allianceId) {
    const [allianceHeld, allianceReserved] = await Promise.all([
      tx.turf.count({ where: { roundId, cityId, holder: { allianceId: player.allianceId } } }),
      rules.wars ? tx.turfPush.count({ where: { roundId, status: 'PENDING', turf: { cityId }, attacker: { allianceId: player.allianceId } } }) : 0,
    ]);
    if (allianceHeld + allianceReserved >= rules.caps.blocksPerAllianceInCity) {
      throw AppError.conflict('TURF_ALLIANCE_CAP', `Your alliance already holds or is pushing for ${rules.caps.blocksPerAllianceInCity} blocks in this city.`);
    }
  }
}

function districtName(ruleset: Ruleset, city: string, district: DistrictKey): string {
  return ruleset.cities?.[city]?.districts?.[district]?.name ?? ruleset.districts[district].name;
}

function seesPush(ruleset: Ruleset, player: { hideoutLookoutsLevel: number }, landsAt: Date, now: Date): boolean {
  return landsAt <= new Date(now.getTime() + headsUpMinutes(ruleset, player.hideoutLookoutsLevel) * 60_000);
}

/**
 * C1: commit a real squad and its real guns to a delayed push.
 *
 * Landing and reinforcement are deliberately separate: this start path creates
 * the durable window C will settle even if neither player is online.
 */
export const TurfWarService = {
  start(prisma: PrismaClient, attackerId: string, input: TurfPushInput, at: Date = new Date()) {
    return ActionService.run<TurfPushStartResult>(prisma, attackerId, {
      action: 'TURF_PUSH',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const turfRules = requireWars(ruleset);
        const model = turfPushCombatModel(ruleset);
        if (!model) throw AppError.conflict('COMBAT_DISABLED', 'Street fights are not enabled in this round.');
        const district = input.district as DistrictKey;
        if (!turfRules.districts[district]) throw AppError.badRequest('UNKNOWN_DISTRICT', 'That is not a turf block.');

        await TurfService.ensureRound(tx, round.id, ruleset);
        const block = await tx.turf.findUnique({
          where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district } },
          include: {
            city: { select: { id: true, slug: true } },
            holder: { select: { id: true, accountId: true, allianceId: true, publicPimpId: true, displayName: true } },
          },
        });
        if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not in your city.');
        await lockBlock(tx, block.id);
        const fresh = await tx.turf.findUniqueOrThrow({
          where: { id: block.id },
          include: {
            city: { select: { id: true, slug: true } },
            holder: { select: { id: true, accountId: true, allianceId: true, publicPimpId: true, displayName: true } },
          },
        });

        const defender = fresh.holder;
        if (!defender) throw AppError.conflict('LOCALS_BLOCK', 'The locals hold that block. Claim it instead of starting a turf war.');
        if (defender.id === attackerId || defender.accountId === player.accountId) throw AppError.badRequest('OWN_TURF', 'That is your own block.');
        const allied = allianceTargetBlock(player, defender, now);
        if (allied) throw AppError.conflict('ALLIED', allied);
        if (await accountsShareNetwork(tx, player.accountId, defender.accountId, now)) {
          throw AppError.conflict('LINKED_ACCOUNTS', 'You have played from the same network as this crew, so you cannot push their turf.');
        }
        if (fresh.shieldUntil && fresh.shieldUntil > now) {
          throw AppError.conflict('TURF_SHIELDED', `That block is protected until ${fresh.shieldUntil.toISOString()}.`);
        }
        if (await tx.turfPush.findFirst({ where: { turfId: fresh.id, status: 'PENDING' } })) {
          throw AppError.conflict('TURF_PUSH_PENDING', 'Someone is already pushing that block.');
        }
        const cooldownSince = new Date(now.getTime() - turfRules.push.attackerCooldownHours * 3_600_000);
        if (await tx.turfPush.findFirst({ where: { turfId: fresh.id, attackerId, startedAt: { gt: cooldownSince } } })) {
          throw AppError.conflict('TURF_PUSH_COOLDOWN', 'Your crew pushed this block too recently.');
        }

        await assertRoom(tx, player, round.id, player.cityId, ruleset);
        const presence = await TurfService.presenceFor(tx, attackerId, player.cityId, district, ruleset, now);
        if (presence < turfRules.presence.turnsToClaim) {
          throw AppError.conflict('TURF_NO_PRESENCE', `Work this block until you have ${turfRules.presence.turnsToClaim} presence before pushing it.`);
        }

        const fullCrew = await crewSize(tx, attackerId, current.thugs);
        const minimum = cornerMinimumFor(ruleset, district, fullCrew);
        if (input.squad < minimum) {
          throw AppError.badRequest('TURF_SQUAD_SMALL', `A winning corner here needs at least ${minimum} thugs.`);
        }
        const fit = Math.min(fitThugs(current), model.squadCap);
        if (input.squad > fit) throw AppError.badRequest('TURF_SQUAD_TOO_BIG', `Send at most ${fit} fit thugs.`);
        const guns = allocateCornerGuns(current, input.squad);
        if (!guns) throw AppError.conflict('TURF_NOT_ENOUGH_ARMED', `You need ${input.squad} home guns to send that squad.`);
        assertTurns(current.turns, turfRules.push.turnCost);

        const landsAt = new Date(now.getTime() + turfRules.push.warningMinutes * 60_000);
        const push = await tx.turfPush.create({
          data: {
            roundId: round.id,
            turfId: fresh.id,
            attackerId,
            defenderId: defender.id,
            squad: input.squad,
            attackerCrew: json({ thugHappiness: player.thugHappiness, weapons: engineGuns(guns) }),
            turnsSpent: turfRules.push.turnCost,
            actionId: input.actionId,
            startedAt: now,
            landsAt,
          },
        });

        const worth = cornerGunWorthCents(ruleset, guns);
        const result: TurfPushStartResult = {
          pushId: push.id,
          district,
          districtName: districtName(ruleset, fresh.city.slug, district),
          defender: { publicPimpId: defender.publicPimpId, displayName: defender.displayName },
          squad: input.squad,
          turnsUsed: turfRules.push.turnCost,
          startedAt: now.toISOString(),
          landsAt: landsAt.toISOString(),
        };

        return {
          next: {
            ...current,
            turns: current.turns - turfRules.push.turnCost,
            busyThugs: current.busyThugs + input.squad,
            pistols: current.pistols - guns.pistols,
            shotguns: current.shotguns - guns.shotguns,
            tek9s: current.tek9s - guns.tek9s,
            ak47s: current.ak47s - guns.ak47s,
            postedNetWorthCents: current.postedNetWorthCents + worth,
          },
          result,
          activity: { type: 'TURF_PUSH', payload: json(result) },
        };
      },
    }, at);
  },
  backup(prisma: PrismaClient, senderId: string, input: TurfPushBackupInput, at: Date = new Date()) {
    return ActionService.run<TurfPushBackupResult>(prisma, senderId, {
      action: 'TURF_PUSH_BACKUP',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const rules = requireWars(ruleset);
        const model = turfPushCombatModel(ruleset);
        if (!model) throw AppError.conflict('COMBAT_DISABLED', 'Street fights are not enabled in this round.');

        await lockPush(tx, input.pushId);
        const push = await tx.turfPush.findUnique({
          where: { id: input.pushId },
          include: {
            turf: true,
            defender: { select: { id: true, allianceId: true, displayName: true } },
            backups: { select: { playerId: true, kind: true } },
          },
        });
        if (!push || push.roundId !== round.id) throw AppError.notFound('TURF_PUSH_NOT_FOUND', 'That turf push is gone.');
        if (push.status !== 'PENDING' || push.landsAt <= now) throw AppError.conflict('TURF_PUSH_OVER', 'Too late: that push has already landed.');
        if (push.turf.holderId !== push.defenderId) throw AppError.conflict('TURF_ABANDONED', 'That corner was already abandoned.');
        if (push.backups.some((row) => row.playerId === senderId)) throw AppError.conflict('TURF_BACKUP_SENT', 'You already sent help to this fight.');

        const kind: 'OWNER' | 'ALLY' = push.defenderId === senderId ? 'OWNER' : 'ALLY';
        if (kind === 'OWNER') {
          if (!seesPush(ruleset, player, push.landsAt, now)) {
            throw AppError.notFound('TURF_PUSH_NOT_FOUND', 'Your Lookouts have not spotted that push yet.');
          }
        } else {
          if (!player.allianceId || player.allianceId !== push.defender.allianceId) {
            throw AppError.conflict('NOT_ALLIED', 'Only the holder\'s allies can answer this call.');
          }
          if (player.cityId !== push.turf.cityId) throw AppError.conflict('WRONG_CITY', 'Only allies living in this city can answer.');
          if (!push.alliesCalledAt) throw AppError.conflict('NOT_CALLED', 'The holder has not called the alliance for help.');
          const helpers = push.backups.filter((row) => row.kind === 'ALLY').length;
          if (helpers >= rules.push.allies.maxHelpers) {
            throw AppError.conflict('TURF_HELP_FULL', 'Enough allies are already riding to that corner.');
          }
        }

        const fit = Math.min(fitThugs(current), model.squadCap);
        const allyCap = kind === 'ALLY'
          ? Math.max(1, Math.floor(push.turf.cornerThugs * rules.push.allies.maxShareOfDefender))
          : model.squadCap;
        const max = Math.min(fit, allyCap);
        if (max < 1) throw AppError.conflict('TURF_NO_BACKUP', 'You have no fit thugs at home to send.');
        if (input.thugs > max) throw AppError.badRequest('TURF_BACKUP_TOO_BIG', `Send at most ${max} thugs.`);

        const guns = allocateCornerGuns(current, input.thugs);
        if (!guns) throw AppError.conflict('TURF_NOT_ENOUGH_ARMED', `You need ${input.thugs} home guns to send that backup.`);

        await tx.turfPushBackup.create({
          data: {
            pushId: push.id,
            playerId: senderId,
            kind,
            thugs: input.thugs,
            crew: json({ thugHappiness: player.thugHappiness, weapons: engineGuns(guns) }),
            sentAt: now,
          },
        });

        const result: TurfPushBackupResult = {
          pushId: push.id,
          thugs: input.thugs,
          kind,
          landsAt: push.landsAt.toISOString(),
        };
        return {
          next: {
            ...current,
            busyThugs: current.busyThugs + input.thugs,
            pistols: current.pistols - guns.pistols,
            shotguns: current.shotguns - guns.shotguns,
            tek9s: current.tek9s - guns.tek9s,
            ak47s: current.ak47s - guns.ak47s,
            postedNetWorthCents: current.postedNetWorthCents + cornerGunWorthCents(ruleset, guns),
          },
          result,
          activity: { type: 'TURF_PUSH_BACKUP', payload: json({ ...result, defender: push.defender.displayName }) },
        };
      },
    }, at);
  },

  callAllies(prisma: PrismaClient, defenderId: string, input: TurfPushCallInput, at: Date = new Date()) {
    return ActionService.run<TurfPushCallResult>(prisma, defenderId, {
      action: 'TURF_PUSH_CALL',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        requireWars(ruleset);
        await lockPush(tx, input.pushId);
        const push = await tx.turfPush.findUnique({
          where: { id: input.pushId },
          include: { turf: true, defender: { select: { allianceId: true } } },
        });
        if (!push || push.roundId !== round.id || push.defenderId !== defenderId) {
          throw AppError.notFound('TURF_PUSH_NOT_FOUND', 'That push is not against your turf.');
        }
        if (push.status !== 'PENDING' || push.landsAt <= now) throw AppError.conflict('TURF_PUSH_OVER', 'Too late: that push has already landed.');
        if (push.turf.holderId !== defenderId) throw AppError.conflict('TURF_ABANDONED', 'You already abandoned that corner.');
        if (!seesPush(ruleset, player, push.landsAt, now)) {
          throw AppError.notFound('TURF_PUSH_NOT_FOUND', 'Your Lookouts have not spotted that push yet.');
        }
        if (!player.allianceId || player.allianceId !== push.defender.allianceId) {
          throw AppError.conflict('NO_ALLIANCE', 'You have no alliance to call.');
        }
        if (push.alliesCalledAt) return { next: current, result: { pushId: push.id, called: 0 } };

        const called = await tx.roundPlayer.count({
          where: { roundId: round.id, cityId: push.turf.cityId, allianceId: player.allianceId, id: { not: defenderId } },
        });
        await tx.turfPush.update({ where: { id: push.id }, data: { alliesCalledAt: now } });
        return { next: current, result: { pushId: push.id, called } };
      },
    }, at);
  },

};
