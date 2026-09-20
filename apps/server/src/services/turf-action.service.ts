import type { PrismaClient } from '@prisma/client';
import { cornerMinimumFor, equipCombatSquad, headsUpMinutes, localsAfter, localsThugs, type Rng, type Ruleset } from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type { TurfClaimInput, TurfClaimResult, TurfPostInput, TurfPostResult, TurfPullInput, TurfPullResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import {
  TurfService, addCornerGuns, allocateCornerGuns, cornerGunWorthCents, gunsFromTurf,
  releaseCornerGuns, subtractCornerGuns, turfGunData, type CornerGuns,
} from './turf.service.js';

const HOUR_MS = 3_600_000;
function localDistrictName(ruleset: Ruleset, citySlug: string, district: DistrictKey): string {
  return ruleset.cities?.[citySlug]?.districts?.[district]?.name ?? ruleset.districts[district].name;
}
function assertHolding(ruleset: Ruleset): void {
  if (!TurfService.holdingEnabled(ruleset)) throw AppError.conflict('TURF_HOLDING_DISABLED', 'Corners cannot be claimed in this round.');
}
async function totalCrewThugs(tx: any, roundPlayerId: string, homeThugs: number): Promise<number> {
  const run = await tx.run.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { escortThugs: true } });
  return homeThugs + (run?.escortThugs ?? 0);
}
async function lockBlock(tx: any, id: string): Promise<void> { await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`; }
async function assertCaps(tx: any, player: any, roundId: string, cityId: string, ruleset: Ruleset): Promise<void> {
  const [home, reserved] = await Promise.all([
    tx.turf.count({ where: { roundId, holderId: player.id, cityId } }),
    ruleset.turf?.wars ? tx.turfPush.count({ where: { roundId, attackerId: player.id, status: 'PENDING', turf: { cityId } } }) : 0,
  ]);
  if (home + reserved >= ruleset.turf!.caps.blocksPerCrewHome) {
    throw AppError.conflict('TURF_CREW_CAP', `You already hold or are pushing for your ${ruleset.turf!.caps.blocksPerCrewHome}-block home cap.`);
  }
  if (player.allianceId) {
    const [alliance, allianceReserved] = await Promise.all([
      tx.turf.count({ where: { roundId, cityId, holder: { allianceId: player.allianceId } } }),
      ruleset.turf?.wars ? tx.turfPush.count({ where: { roundId, status: 'PENDING', turf: { cityId }, attacker: { allianceId: player.allianceId } } }) : 0,
    ]);
    if (alliance + allianceReserved >= ruleset.turf!.caps.blocksPerAllianceInCity) {
      throw AppError.conflict('TURF_ALLIANCE_CAP', `Your alliance already holds or is pushing for ${ruleset.turf!.caps.blocksPerAllianceInCity} blocks in this city.`);
    }
  }
}
function engineGuns(guns: CornerGuns) { return { PISTOL: guns.pistols, SHOTGUN: guns.shotguns, TEK9: guns.tek9s, AK47: guns.ak47s }; }
function localsGuns(ruleset: Ruleset, locals: number) {
  const guns = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };
  guns[ruleset.turf!.locals.weapon] = Math.min(locals, Math.ceil(locals * ruleset.turf!.locals.armedShare));
  return guns;
}
function nextWithPostedGuns(current: any, guns: CornerGuns, direction: 1 | -1, ruleset: Ruleset) {
  const worth = cornerGunWorthCents(ruleset, guns);
  const postedNetWorthCents = direction > 0 ? current.postedNetWorthCents + worth : current.postedNetWorthCents - worth;
  if (postedNetWorthCents < 0n) throw new RangeError('Posted turf net worth fell below zero.');
  return {
    ...current,
    pistols: current.pistols - direction * guns.pistols,
    shotguns: current.shotguns - direction * guns.shotguns,
    tek9s: current.tek9s - direction * guns.tek9s,
    ak47s: current.ak47s - direction * guns.ak47s,
    postedNetWorthCents,
  };
}

export const TurfActionService = {
  async claim(prisma: PrismaClient, roundPlayerId: string, input: TurfClaimInput, rng: Rng = Math.random) {
    return ActionService.run<TurfClaimResult>(prisma, roundPlayerId, {
      action: 'TURF_CLAIM', actionId: input.actionId,
      execute: async ({ tx, current, thugHappiness, player, round, ruleset, now }) => {
        assertHolding(ruleset);
        await TurfService.ensureRound(tx, round.id, ruleset);
        const key = input.district as DistrictKey;
        if (!ruleset.turf!.districts[key]) throw AppError.badRequest('UNKNOWN_DISTRICT', 'That is not a turf block.');
        const block = await tx.turf.findUnique({
          where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district: key } },
          include: { city: { select: { slug: true } } },
        });
        if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not on the map.');
        await lockBlock(tx, block.id);
        const fresh = await tx.turf.findUniqueOrThrow({ where: { id: block.id }, include: { city: { select: { slug: true } } } });
        if (fresh.holderId) throw AppError.conflict('TURF_HELD', 'A crew already holds this block. Player pushes arrive in 0.6.0-C.');

        await assertCaps(tx, player, round.id, player.cityId, ruleset);
        const presence = await TurfService.presenceFor(tx, roundPlayerId, player.cityId, key, ruleset, now);
        if (presence < ruleset.turf!.presence.turnsToClaim) throw AppError.conflict('TURF_NO_PRESENCE', `You need ${ruleset.turf!.presence.turnsToClaim} presence here before you can claim it.`);

        const crewThugs = await totalCrewThugs(tx, roundPlayerId, current.thugs);
        const minimum = cornerMinimumFor(ruleset, key, crewThugs);
        const fit = fitThugs(current);
        if (input.thugs < minimum) throw AppError.badRequest('TURF_SQUAD_SMALL', `This corner needs at least ${minimum} thugs.`);
        if (input.thugs > fit) throw AppError.conflict('TURF_NOT_ENOUGH_FIT', `You only have ${fit} fit thugs at home.`);
        const guns = allocateCornerGuns(current, input.thugs);
        if (!guns) throw AppError.conflict('TURF_NOT_ENOUGH_ARMED', `You need ${input.thugs} home guns to post that squad.`);
        assertTurns(current.turns, ruleset.turf!.corner.postTurnCost);

        const locals = Math.round(localsAfter(ruleset, { citySlug: fresh.city.slug, district: key }, fresh.localsThugs, Math.max(0, (now.getTime() - fresh.localsAt.getTime()) / HOUR_MS)));
        const model = ruleset.combat;
        if (!model) throw AppError.conflict('COMBAT_DISABLED', 'There is no street fight model in this round.');
        const attacker = equipCombatSquad({ thugs: input.thugs, thugHappiness, weapons: engineGuns(guns) }, Math.min(input.thugs, model.squadCap), model);
        const defender = equipCombatSquad({ thugs: locals, thugHappiness: 100, weapons: localsGuns(ruleset, locals) }, Math.min(locals, model.squadCap), model);
        const variance = ruleset.turf!.push.fight.variance;
        const attackerStrength = attacker.strength * (1 + (rng() * 2 - 1) * variance);
        const defenderStrength = defender.strength * ruleset.turf!.push.fight.defenseMultiplier;
        const won = attackerStrength > defenderStrength;

        if (won) await tx.turf.update({
          where: { id: fresh.id },
          data: {
            holderId: roundPlayerId, cornerThugs: input.thugs, ...turfGunData(guns), heldSince: now,
            shieldUntil: null, upkeepAt: now, localsThugs: locals, localsAt: now,
          },
        });

        const moved = won ? nextWithPostedGuns(current, guns, 1, ruleset) : current;
        const next = { ...moved, turns: current.turns - ruleset.turf!.corner.postTurnCost, postedThugs: current.postedThugs + (won ? input.thugs : 0) };
        const districtName = localDistrictName(ruleset, player.city.slug, key);
        return {
          next,
          result: { district: key, districtName, won, squad: input.thugs, localsThugs: locals, cornerThugs: won ? input.thugs : 0, turnsUsed: ruleset.turf!.corner.postTurnCost },
          activity: { type: 'TURF_CLAIM', payload: {
            district: key, districtName, won, thugs: input.thugs, locals,
            attackerStrength: Math.round(attackerStrength * 10) / 10, defenderStrength: Math.round(defenderStrength * 10) / 10,
          } },
        };
      },
    });
  },

  async post(prisma: PrismaClient, roundPlayerId: string, input: TurfPostInput) {
    return ActionService.run<TurfPostResult>(prisma, roundPlayerId, {
      action: 'TURF_POST', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        assertHolding(ruleset);
        const key = input.district as DistrictKey;
        const block = await tx.turf.findUnique({ where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district: key } } });
        if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not on the map.');
        await lockBlock(tx, block.id);
        const fresh = await tx.turf.findUniqueOrThrow({ where: { id: block.id } });
        if (fresh.holderId !== roundPlayerId) throw AppError.conflict('NOT_YOUR_TURF', 'You do not hold that block.');
        if (ruleset.turf?.wars) {
          const push = await tx.turfPush.findFirst({ where: { turfId: fresh.id, status: 'PENDING' }, select: { landsAt: true } });
          const spotted = push && push.landsAt <= new Date(now.getTime() + headsUpMinutes(ruleset, player.hideoutLookoutsLevel) * 60_000);
          if (spotted) {
            throw AppError.conflict('TURF_UNDER_PUSH', 'Your Lookouts spotted a push here. Send fight backup instead of permanently posting more thugs.');
          }
        }

        const fit = fitThugs(current);
        if (input.thugs > fit) throw AppError.conflict('TURF_NOT_ENOUGH_FIT', `You only have ${fit} fit thugs at home.`);
        const guns = allocateCornerGuns(current, input.thugs);
        if (!guns) throw AppError.conflict('TURF_NOT_ENOUGH_ARMED', `You need ${input.thugs} home guns to reinforce that corner.`);
        assertTurns(current.turns, ruleset.turf!.corner.postTurnCost);

        const existingGuns = gunsFromTurf(fresh);
        const cornerThugs = fresh.cornerThugs + input.thugs;
        await tx.turf.update({ where: { id: fresh.id }, data: { cornerThugs, ...turfGunData(addCornerGuns(existingGuns, guns)), upkeepAt: now } });
        const moved = nextWithPostedGuns(current, guns, 1, ruleset);
        return {
          next: { ...moved, turns: current.turns - ruleset.turf!.corner.postTurnCost, postedThugs: current.postedThugs + input.thugs },
          result: { district: key, districtName: localDistrictName(ruleset, player.city.slug, key), posted: input.thugs, cornerThugs, turnsUsed: ruleset.turf!.corner.postTurnCost },
          activity: { type: 'TURF_POST', payload: { district: key, thugs: input.thugs, cornerThugs } },
        };
      },
    });
  },

  async pull(prisma: PrismaClient, roundPlayerId: string, input: TurfPullInput) {
    return ActionService.run<TurfPullResult>(prisma, roundPlayerId, {
      action: 'TURF_PULL', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        assertHolding(ruleset);
        const key = input.district as DistrictKey;
        const block = await tx.turf.findUnique({
          where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district: key } },
          include: { city: { select: { slug: true } } },
        });
        if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not on the map.');
        await lockBlock(tx, block.id);
        const fresh = await tx.turf.findUniqueOrThrow({ where: { id: block.id }, include: { city: { select: { slug: true } } } });
        if (fresh.holderId !== roundPlayerId) throw AppError.conflict('NOT_YOUR_TURF', 'You do not hold that block.');
        if (input.thugs > fresh.cornerThugs) throw AppError.badRequest('TURF_PULL_TOO_MANY', `Only ${fresh.cornerThugs} thugs are posted there.`);
        assertTurns(current.turns, ruleset.turf!.corner.pullTurnCost);

        const crewThugs = await totalCrewThugs(tx, roundPlayerId, current.thugs);
        const cornerThugs = fresh.cornerThugs - input.thugs;
        const released = cornerThugs === 0;
        if (!released) {
          const minimum = cornerMinimumFor(ruleset, key, crewThugs);
          if (cornerThugs < minimum) throw AppError.conflict('TURF_CORNER_MINIMUM', `Leave at least ${minimum} on the corner, or pull the whole crew.`);
        }

        const existingGuns = gunsFromTurf(fresh);
        const returned = releaseCornerGuns(existingGuns, input.thugs);
        const remainingGuns = subtractCornerGuns(existingGuns, returned);
        await tx.turf.update({
          where: { id: fresh.id },
          data: released ? {
            holderId: null, cornerThugs: 0, ...turfGunData({ pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 }),
            heldSince: null, shieldUntil: null, upkeepAt: now,
            localsThugs: localsThugs(ruleset, { citySlug: fresh.city.slug, district: key }), localsAt: now,
          } : { cornerThugs, ...turfGunData(remainingGuns), upkeepAt: now },
        });

        const moved = nextWithPostedGuns(current, returned, -1, ruleset);
        return {
          next: { ...moved, turns: current.turns - ruleset.turf!.corner.pullTurnCost, postedThugs: Math.max(0, current.postedThugs - input.thugs) },
          result: { district: key, districtName: localDistrictName(ruleset, player.city.slug, key), pulled: input.thugs, cornerThugs, released, turnsUsed: ruleset.turf!.corner.pullTurnCost },
          activity: { type: 'TURF_PULL', payload: { district: key, thugs: input.thugs, cornerThugs, released } },
        };
      },
    });
  },
};
