import type { PrismaClient } from '@prisma/client';
import { cornerMinimumFor, dealerRules, headsUpMinutes, type Ruleset } from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type { CrewDealerMembersInput, CrewPutToWorkResult, CrewTurfMembersInput, CrewTurfMoveMembersInput } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs, type PlayerState } from './action.service.js';
import { CrewRosterService } from './crew-roster.service.js';
import { PermanentUnlockService } from './permanent-unlock.service.js';
import {
  TurfService,
  addCornerGuns,
  allocateCornerGuns,
  cornerGunWorthCents,
  gunsFromTurf,
  localsReclaimAt,
  releaseCornerGuns,
  subtractCornerGuns,
  turfGunData,
  type CornerGuns,
} from './turf.service.js';
import { endTurfHold } from './turf-history.service.js';
import { recordTerritoryControlChange, territoryControlForCity } from './turf-territory.service.js';

type CrewMemberMoveRow = {
  id: string;
  role: 'THUG' | 'WORKER';
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_TRANSIT' | 'RECOVERING' | 'RELEASED';
  assignmentKind: 'BUSINESS' | 'DEALER' | 'TURF' | 'CORNER_ENFORCER' | 'CORNER_LOOKOUT' | 'STASH_GUARD' | 'RUNNER' | 'BODYGUARD' | 'ESCORT' | null;
  assignmentRef: string | null;
  dealerStaffId: string | null;
};

function requireRoster(ruleset: Ruleset): void {
  if (!ruleset.crewRoster?.enabled) throw AppError.conflict('CREW_ROSTER_DISABLED', 'Crew assignments need the named roster in this round.');
}

async function activeDealerCount(tx: Db, roundPlayerId: string): Promise<number> {
  return tx.dealerStaff.count({ where: { roundPlayerId, dealerCrewId: { not: null }, releasedAt: null } });
}

async function assertDealerSync(tx: Db, roundPlayerId: string, current: PlayerState): Promise<void> {
  if (await activeDealerCount(tx, roundPlayerId) !== current.dealerThugs) {
    throw AppError.conflict('DEALER_STAFF_OUT_OF_SYNC', 'Dealer assignments need an operator review before the crew can move.');
  }
}

async function loadMembers(tx: Db, roundPlayerId: string, memberIds: string[]): Promise<CrewMemberMoveRow[]> {
  const members = await tx.crewMember.findMany({
    where: { roundPlayerId, id: { in: memberIds } },
    select: { id: true, role: true, status: true, assignmentKind: true, assignmentRef: true, dealerStaffId: true },
  }) as CrewMemberMoveRow[];
  if (members.length !== memberIds.length) throw AppError.notFound('CREW_MEMBER_NOT_FOUND', 'One or more selected members are not on your roster.');
  const byId = new Map(members.map((member) => [member.id, member]));
  return memberIds.map((id) => byId.get(id)!);
}

function assertAvailableThugs(members: CrewMemberMoveRow[]): void {
  const bad = members.find((member) => member.role !== 'THUG' || member.status !== 'AVAILABLE');
  if (bad) throw AppError.conflict('CREW_MEMBER_UNAVAILABLE', 'Choose available thugs at home.');
}

function localDistrictName(ruleset: Ruleset, citySlug: string, district: DistrictKey): string {
  return ruleset.cities?.[citySlug]?.districts?.[district]?.name ?? ruleset.districts[district].name;
}

function nextWithPostedGuns(current: PlayerState, guns: CornerGuns, direction: 1 | -1, ruleset: Ruleset): PlayerState {
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

async function lockBlock(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}

async function totalCrewThugs(tx: Db, roundPlayerId: string, homeThugs: number): Promise<number> {
  const runs = await tx.run.findMany({ where: { roundPlayerId, status: 'ACTIVE' }, select: { escortThugs: true } });
  return homeThugs + runs.reduce((sum, run) => sum + run.escortThugs, 0);
}

async function assertNoSpottedPush(tx: Db, input: { turfId: string; ruleset: Ruleset; player: { hideoutLookoutsLevel: number; racketEffects: unknown }; now: Date }): Promise<void> {
  if (!input.ruleset.turf?.wars) return;
  const push = await tx.turfPush.findFirst({ where: { turfId: input.turfId, status: 'PENDING' }, select: { landsAt: true } });
  const spotted = push && push.landsAt <= new Date(input.now.getTime() + headsUpMinutes(input.ruleset, input.player.hideoutLookoutsLevel, input.player.racketEffects) * 60_000);
  if (spotted) throw AppError.conflict('TURF_UNDER_PUSH', 'Your Lookouts spotted a push here. Send fight backup instead of permanently moving thugs.');
}

function result(input: Omit<CrewPutToWorkResult, 'replayed'>): CrewPutToWorkResult {
  return { ...input, replayed: false };
}

export const CrewAssignmentService = {
  assignDealer(prisma: PrismaClient, roundPlayerId: string, crewId: string, input: CrewDealerMembersInput) {
    return ActionService.run<CrewPutToWorkResult>(prisma, roundPlayerId, {
      action: 'CREW_DEALER_ASSIGN',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        requireRoster(ruleset);
        if (!ruleset.supplyNetwork?.enabled) throw AppError.notFound('SUPPLY_DISABLED', 'Dealer assignments are not available in this round.');
        await CrewRosterService.sync(tx, roundPlayerId, ruleset, now, current);
        await assertDealerSync(tx, roundPlayerId, current);
        const rules = dealerRules(ruleset);
        if (!rules) throw AppError.notFound('DEALERS_DISABLED', 'Dealer crews are not available in this round.');
        const crew = await tx.dealerCrew.findFirst({ where: { id: crewId, roundPlayerId, status: { in: ['ACTIVE', 'PAUSED'] } } });
        if (!crew) throw AppError.notFound('DEALER_CREW_NOT_FOUND', 'That dealer crew is not yours.');
        const posted = await tx.dealerStaff.count({ where: { dealerCrewId: crew.id, releasedAt: null } });
        if (posted + input.memberIds.length > rules.maxDealersPerCrew) throw AppError.conflict('DEALER_CREW_FULL', `A crew takes at most ${rules.maxDealersPerCrew} dealers.`);
        if (fitThugs(current) < input.memberIds.length) throw AppError.conflict('NO_AVAILABLE_THUGS', `You only have ${fitThugs(current)} available thug${fitThugs(current) === 1 ? '' : 's'} at home.`);
        const members = await loadMembers(tx, roundPlayerId, input.memberIds);
        assertAvailableThugs(members);

        for (const member of members) {
          const staff = member.dealerStaffId
            ? await tx.dealerStaff.findFirst({ where: { id: member.dealerStaffId, roundPlayerId, dealerCrewId: null, releasedAt: { not: null } } })
            : null;
          if (member.dealerStaffId && !staff) throw AppError.conflict('DEALER_CAREER_UNAVAILABLE', 'One selected dealer career is not released and available to reassign.');
          const assigned = staff
            ? await tx.dealerStaff.update({ where: { id: staff.id }, data: { dealerCrewId: crew.id, assignedAt: now, releasedAt: null } })
            : await tx.dealerStaff.create({ data: { roundPlayerId, dealerCrewId: crew.id, experiencePoints: 0, assignedAt: now } });
          await tx.crewMember.update({
            where: { id: member.id },
            data: {
              status: 'ASSIGNED', assignmentKind: 'DEALER', assignmentRef: crew.id, statusSince: now, releasedAt: null,
              dealerStaffId: assigned.id, experiencePoints: assigned.experiencePoints, specialty: 'DEALER', specialtyExperiencePoints: assigned.experiencePoints,
            },
          });
        }
        await tx.crewMemberEvent.createMany({
          data: members.map((member) => ({ memberId: member.id, roundPlayerId, kind: 'ASSIGNED' as const, assignmentKind: 'DEALER' as const, assignmentRef: crew.id, summary: 'Assigned to a dealer crew.', at: now })),
        });
        await tx.dealerCrew.update({ where: { id: crew.id }, data: { capacityUnits: { increment: rules.unitsPerDealer * members.length } } });
        const next = { ...current, dealerThugs: current.dealerThugs + members.length };
        return {
          next,
          result: result({
            kind: 'DEALER_ASSIGN', memberIds: input.memberIds, assigned: members.length, released: 0, moved: 0,
            from: null, to: crew.id, dealerThugs: next.dealerThugs, postedThugs: next.postedThugs, availableThugs: fitThugs(next), turnsUsed: 0,
            message: `${members.length} dealer${members.length === 1 ? '' : 's'} assigned.`,
          }),
          ledger: [],
        };
      },
    });
  },

  releaseDealers(prisma: PrismaClient, roundPlayerId: string, input: CrewDealerMembersInput) {
    return ActionService.run<CrewPutToWorkResult>(prisma, roundPlayerId, {
      action: 'CREW_DEALER_RELEASE',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        requireRoster(ruleset);
        if (!ruleset.supplyNetwork?.enabled) throw AppError.notFound('SUPPLY_DISABLED', 'Dealer assignments are not available in this round.');
        await CrewRosterService.sync(tx, roundPlayerId, ruleset, now, current);
        await assertDealerSync(tx, roundPlayerId, current);
        const rules = dealerRules(ruleset);
        if (!rules) throw AppError.notFound('DEALERS_DISABLED', 'Dealer crews are not available in this round.');
        const members = await loadMembers(tx, roundPlayerId, input.memberIds);
        const bad = members.find((member) => member.role !== 'THUG' || member.status !== 'ASSIGNED' || member.assignmentKind !== 'DEALER' || !member.assignmentRef || !member.dealerStaffId);
        if (bad) throw AppError.conflict('CREW_MEMBER_UNAVAILABLE', 'Choose active dealers to bring home.');
        const byCrew = new Map<string, CrewMemberMoveRow[]>();
        for (const member of members) byCrew.set(member.assignmentRef!, [...(byCrew.get(member.assignmentRef!) ?? []), member]);
        for (const [id, rows] of byCrew) {
          const crew = await tx.dealerCrew.findFirst({ where: { id, roundPlayerId }, include: { inventory: true } });
          if (!crew) throw AppError.notFound('DEALER_CREW_NOT_FOUND', 'One selected dealer crew is not yours.');
          const inventory = crew.inventory.reduce((sum, row) => sum + row.quantity, 0);
          const capacity = Math.max(0, crew.capacityUnits - rules.unitsPerDealer * rows.length);
          if (inventory > capacity) throw AppError.conflict('DEALER_CREW_OVERFULL', `The crew would hold more than its dealers can carry. Return ${inventory - capacity} units to storage first.`);
          await tx.dealerCrew.update({ where: { id }, data: { capacityUnits: capacity } });
        }
        await tx.dealerStaff.updateMany({ where: { id: { in: members.map((member) => member.dealerStaffId!) }, roundPlayerId }, data: { dealerCrewId: null, releasedAt: now } });
        await tx.crewMember.updateMany({
          where: { roundPlayerId, id: { in: input.memberIds } },
          data: { status: 'AVAILABLE', assignmentKind: null, assignmentRef: null, statusSince: now, releasedAt: null },
        });
        await tx.crewMemberEvent.createMany({
          data: members.map((member) => ({ memberId: member.id, roundPlayerId, kind: 'UNASSIGNED' as const, assignmentKind: 'DEALER' as const, assignmentRef: member.assignmentRef, summary: 'Returned from dealer work.', at: now })),
        });
        const next = { ...current, dealerThugs: current.dealerThugs - members.length };
        return {
          next,
          result: result({
            kind: 'DEALER_RELEASE', memberIds: input.memberIds, assigned: 0, released: members.length, moved: 0,
            from: null, to: null, dealerThugs: next.dealerThugs, postedThugs: next.postedThugs, availableThugs: fitThugs(next), turnsUsed: 0,
            message: `${members.length} dealer${members.length === 1 ? '' : 's'} returned home.`,
          }),
          ledger: [],
        };
      },
    });
  },

  moveDealers(prisma: PrismaClient, roundPlayerId: string, crewId: string, input: CrewDealerMembersInput) {
    return ActionService.run<CrewPutToWorkResult>(prisma, roundPlayerId, {
      action: 'CREW_DEALER_MOVE',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        requireRoster(ruleset);
        if (!ruleset.supplyNetwork?.enabled) throw AppError.notFound('SUPPLY_DISABLED', 'Dealer assignments are not available in this round.');
        await CrewRosterService.sync(tx, roundPlayerId, ruleset, now, current);
        await assertDealerSync(tx, roundPlayerId, current);
        const rules = dealerRules(ruleset);
        if (!rules) throw AppError.notFound('DEALERS_DISABLED', 'Dealer crews are not available in this round.');
        const target = await tx.dealerCrew.findFirst({ where: { id: crewId, roundPlayerId, status: { in: ['ACTIVE', 'PAUSED'] } } });
        if (!target) throw AppError.notFound('DEALER_CREW_NOT_FOUND', 'That destination dealer crew is not yours.');
        const members = await loadMembers(tx, roundPlayerId, input.memberIds);
        const bad = members.find((member) => member.role !== 'THUG' || member.status !== 'ASSIGNED' || member.assignmentKind !== 'DEALER' || !member.assignmentRef || member.assignmentRef === target.id || !member.dealerStaffId);
        if (bad) throw AppError.conflict('CREW_MEMBER_UNAVAILABLE', 'Choose active dealers from another crew.');
        const targetPosted = await tx.dealerStaff.count({ where: { dealerCrewId: target.id, releasedAt: null } });
        if (targetPosted + members.length > rules.maxDealersPerCrew) throw AppError.conflict('DEALER_CREW_FULL', `A crew takes at most ${rules.maxDealersPerCrew} dealers.`);
        const bySource = new Map<string, CrewMemberMoveRow[]>();
        for (const member of members) bySource.set(member.assignmentRef!, [...(bySource.get(member.assignmentRef!) ?? []), member]);
        for (const [id, rows] of bySource) {
          const crew = await tx.dealerCrew.findFirst({ where: { id, roundPlayerId }, include: { inventory: true } });
          if (!crew) throw AppError.notFound('DEALER_CREW_NOT_FOUND', 'One selected dealer crew is not yours.');
          const inventory = crew.inventory.reduce((sum, row) => sum + row.quantity, 0);
          const capacity = Math.max(0, crew.capacityUnits - rules.unitsPerDealer * rows.length);
          if (inventory > capacity) throw AppError.conflict('DEALER_CREW_OVERFULL', `A source crew would hold more than its dealers can carry. Return ${inventory - capacity} units to storage first.`);
          await tx.dealerCrew.update({ where: { id }, data: { capacityUnits: capacity } });
        }
        await tx.dealerCrew.update({ where: { id: target.id }, data: { capacityUnits: { increment: rules.unitsPerDealer * members.length } } });
        await tx.dealerStaff.updateMany({ where: { id: { in: members.map((member) => member.dealerStaffId!) }, roundPlayerId }, data: { dealerCrewId: target.id, assignedAt: now, releasedAt: null } });
        await tx.crewMember.updateMany({
          where: { roundPlayerId, id: { in: input.memberIds } },
          data: { assignmentRef: target.id, statusSince: now },
        });
        await tx.crewMemberEvent.createMany({
          data: members.flatMap((member) => [
            { memberId: member.id, roundPlayerId, kind: 'UNASSIGNED' as const, assignmentKind: 'DEALER' as const, assignmentRef: member.assignmentRef, summary: 'Moved between dealer crews.', at: now },
            { memberId: member.id, roundPlayerId, kind: 'ASSIGNED' as const, assignmentKind: 'DEALER' as const, assignmentRef: target.id, summary: 'Moved to this dealer crew.', at: now },
          ]),
        });
        return {
          next: current,
          result: result({
            kind: 'DEALER_MOVE', memberIds: input.memberIds, assigned: 0, released: 0, moved: members.length,
            from: bySource.size === 1 ? [...bySource.keys()][0]! : null, to: target.id, dealerThugs: current.dealerThugs, postedThugs: current.postedThugs, availableThugs: fitThugs(current), turnsUsed: 0,
            message: `${members.length} dealer${members.length === 1 ? '' : 's'} moved.`,
          }),
          ledger: [],
        };
      },
    });
  },

  postTurf(prisma: PrismaClient, roundPlayerId: string, input: CrewTurfMembersInput) {
    return ActionService.run<CrewPutToWorkResult>(prisma, roundPlayerId, {
      action: 'CREW_TURF_POST',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        requireRoster(ruleset);
        if (!TurfService.holdingEnabled(ruleset)) throw AppError.conflict('TURF_HOLDING_DISABLED', 'Corners cannot be claimed in this round.');
        await CrewRosterService.sync(tx, roundPlayerId, ruleset, now, current);
        const key = input.district as DistrictKey;
        await PermanentUnlockService.assertCanAccessDistrict(tx, roundPlayerId, ruleset, key);
        const block = await tx.turf.findUnique({ where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district: key } } });
        if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not on the map.');
        await lockBlock(tx, block.id);
        const fresh = await tx.turf.findUniqueOrThrow({ where: { id: block.id } });
        if (fresh.holderId !== roundPlayerId) throw AppError.conflict('NOT_YOUR_TURF', 'You do not hold that block.');
        await assertNoSpottedPush(tx, { turfId: fresh.id, ruleset, player, now });
        const members = await loadMembers(tx, roundPlayerId, input.memberIds);
        assertAvailableThugs(members);
        if (input.memberIds.length > fitThugs(current)) throw AppError.conflict('TURF_NOT_ENOUGH_FIT', `You only have ${fitThugs(current)} fit thugs at home.`);
        const guns = allocateCornerGuns(current, input.memberIds.length);
        if (!guns) throw AppError.conflict('TURF_NOT_ENOUGH_ARMED', `You need ${input.memberIds.length} home guns to reinforce that corner.`);
        assertTurns(current.turns, ruleset.turf!.corner.postTurnCost);

        const existingGuns = gunsFromTurf(fresh);
        const cornerThugs = fresh.cornerThugs + input.memberIds.length;
        await tx.turf.update({ where: { id: fresh.id }, data: { cornerThugs, ...turfGunData(addCornerGuns(existingGuns, guns)), upkeepAt: now } });
        await tx.crewMember.updateMany({
          where: { roundPlayerId, id: { in: input.memberIds } },
          data: { status: 'ASSIGNED', assignmentKind: 'TURF', assignmentRef: fresh.id, statusSince: now, releasedAt: null },
        });
        await tx.crewMemberEvent.createMany({
          data: input.memberIds.map((memberId) => ({ memberId, roundPlayerId, kind: 'ASSIGNED' as const, assignmentKind: 'TURF' as const, assignmentRef: fresh.id, summary: 'Posted to a corner.', at: now })),
        });
        const moved = nextWithPostedGuns(current, guns, 1, ruleset);
        const next = { ...moved, turns: current.turns - ruleset.turf!.corner.postTurnCost, postedThugs: current.postedThugs + input.memberIds.length };
        return {
          next,
          result: result({
            kind: 'TURF_POST', memberIds: input.memberIds, assigned: input.memberIds.length, released: 0, moved: 0,
            from: null, to: fresh.id, dealerThugs: next.dealerThugs, postedThugs: next.postedThugs, availableThugs: fitThugs(next), turnsUsed: ruleset.turf!.corner.postTurnCost,
            message: `${input.memberIds.length} thug${input.memberIds.length === 1 ? '' : 's'} posted to ${localDistrictName(ruleset, player.city.slug, key)}.`,
          }),
          activity: { type: 'TURF_POST', payload: { district: key, thugs: input.memberIds.length, cornerThugs } },
          ledger: [],
        };
      },
    });
  },

  pullTurf(prisma: PrismaClient, roundPlayerId: string, input: CrewTurfMembersInput) {
    return ActionService.run<CrewPutToWorkResult>(prisma, roundPlayerId, {
      action: 'CREW_TURF_PULL',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        requireRoster(ruleset);
        if (!TurfService.holdingEnabled(ruleset)) throw AppError.conflict('TURF_HOLDING_DISABLED', 'Corners cannot be claimed in this round.');
        await CrewRosterService.sync(tx, roundPlayerId, ruleset, now, current);
        const key = input.district as DistrictKey;
        await PermanentUnlockService.assertCanAccessDistrict(tx, roundPlayerId, ruleset, key);
        const block = await tx.turf.findUnique({ where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district: key } }, include: { city: { select: { slug: true } } } });
        if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not on the map.');
        await lockBlock(tx, block.id);
        const fresh = await tx.turf.findUniqueOrThrow({ where: { id: block.id }, include: { city: { select: { slug: true } } } });
        if (fresh.holderId !== roundPlayerId) throw AppError.conflict('NOT_YOUR_TURF', 'You do not hold that block.');
        const members = await loadMembers(tx, roundPlayerId, input.memberIds);
        const bad = members.find((member) => member.role !== 'THUG' || member.status !== 'ASSIGNED' || member.assignmentKind !== 'TURF' || member.assignmentRef !== fresh.id);
        if (bad) throw AppError.conflict('CREW_MEMBER_UNAVAILABLE', 'Choose thugs posted on that corner.');
        if (input.memberIds.length > fresh.cornerThugs) throw AppError.badRequest('TURF_PULL_TOO_MANY', `Only ${fresh.cornerThugs} thugs are posted there.`);
        assertTurns(current.turns, ruleset.turf!.corner.pullTurnCost);

        const crewThugs = await totalCrewThugs(tx, roundPlayerId, current.thugs);
        const cornerThugs = fresh.cornerThugs - input.memberIds.length;
        const released = cornerThugs === 0;
        if (!released) {
          const minimum = cornerMinimumFor(ruleset, key, crewThugs);
          if (cornerThugs < minimum) throw AppError.conflict('TURF_CORNER_MINIMUM', `Leave at least ${minimum} on the corner, or pull the whole crew.`);
        }
        const controlBefore = released ? await territoryControlForCity(tx, round.id, player.cityId, ruleset) : null;
        const existingGuns = gunsFromTurf(fresh);
        const returned = releaseCornerGuns(existingGuns, input.memberIds.length);
        const remainingGuns = subtractCornerGuns(existingGuns, returned);
        if (released) await endTurfHold(tx, fresh.id, now);
        await tx.turf.update({
          where: { id: fresh.id },
          data: released ? {
            holderId: null, cornerThugs: 0, ...turfGunData({ pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 }),
            heldSince: null, shieldUntil: null, upkeepAt: now, localsThugs: 0, localsAt: now, localsReclaimAt: localsReclaimAt(ruleset, now),
          } : { cornerThugs, ...turfGunData(remainingGuns), upkeepAt: now },
        });
        if (released) await recordTerritoryControlChange(tx, { roundId: round.id, cityId: player.cityId, ruleset, before: controlBefore, at: now });
        await tx.crewMember.updateMany({
          where: { roundPlayerId, id: { in: input.memberIds } },
          data: { status: 'AVAILABLE', assignmentKind: null, assignmentRef: null, statusSince: now, releasedAt: null },
        });
        await tx.crewMemberEvent.createMany({
          data: input.memberIds.map((memberId) => ({ memberId, roundPlayerId, kind: 'UNASSIGNED' as const, assignmentKind: 'TURF' as const, assignmentRef: fresh.id, summary: 'Returned from a corner.', at: now })),
        });
        const moved = nextWithPostedGuns(current, returned, -1, ruleset);
        const next = { ...moved, turns: current.turns - ruleset.turf!.corner.pullTurnCost, postedThugs: Math.max(0, current.postedThugs - input.memberIds.length) };
        return {
          next,
          result: result({
            kind: 'TURF_PULL', memberIds: input.memberIds, assigned: 0, released: input.memberIds.length, moved: 0,
            from: fresh.id, to: null, dealerThugs: next.dealerThugs, postedThugs: next.postedThugs, availableThugs: fitThugs(next), turnsUsed: ruleset.turf!.corner.pullTurnCost,
            message: `${input.memberIds.length} thug${input.memberIds.length === 1 ? '' : 's'} returned from ${localDistrictName(ruleset, fresh.city.slug, key)}.`,
          }),
          activity: { type: 'TURF_PULL', payload: { district: key, thugs: input.memberIds.length, cornerThugs, released } },
          ledger: [],
        };
      },
    });
  },

  moveTurf(prisma: PrismaClient, roundPlayerId: string, input: CrewTurfMoveMembersInput) {
    return ActionService.run<CrewPutToWorkResult>(prisma, roundPlayerId, {
      action: 'CREW_TURF_MOVE',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        requireRoster(ruleset);
        if (!TurfService.holdingEnabled(ruleset)) throw AppError.conflict('TURF_HOLDING_DISABLED', 'Corners cannot be claimed in this round.');
        await CrewRosterService.sync(tx, roundPlayerId, ruleset, now, current);
        const targetKey = input.toDistrict as DistrictKey;
        await PermanentUnlockService.assertCanAccessDistrict(tx, roundPlayerId, ruleset, targetKey);
        const target = await tx.turf.findUnique({ where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district: targetKey } } });
        if (!target) throw AppError.notFound('TURF_NOT_FOUND', 'That destination block is not on the map.');
        await lockBlock(tx, target.id);
        const freshTarget = await tx.turf.findUniqueOrThrow({ where: { id: target.id } });
        if (freshTarget.holderId !== roundPlayerId) throw AppError.conflict('NOT_YOUR_TURF', 'You do not hold the destination block.');
        await assertNoSpottedPush(tx, { turfId: freshTarget.id, ruleset, player, now });
        const members = await loadMembers(tx, roundPlayerId, input.memberIds);
        const bad = members.find((member) => member.role !== 'THUG' || member.status !== 'ASSIGNED' || member.assignmentKind !== 'TURF' || !member.assignmentRef || member.assignmentRef === freshTarget.id);
        if (bad) throw AppError.conflict('CREW_MEMBER_UNAVAILABLE', 'Choose thugs posted on another corner.');
        assertTurns(current.turns, ruleset.turf!.corner.postTurnCost);
        const bySource = new Map<string, CrewMemberMoveRow[]>();
        for (const member of members) bySource.set(member.assignmentRef!, [...(bySource.get(member.assignmentRef!) ?? []), member]);
        const crewThugs = await totalCrewThugs(tx, roundPlayerId, current.thugs);
        const controlBefore = await territoryControlForCity(tx, round.id, player.cityId, ruleset);
        let anyReleased = false;
        let incomingGuns: CornerGuns = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
        for (const [id, rows] of bySource) {
          await lockBlock(tx, id);
          const source = await tx.turf.findUniqueOrThrow({ where: { id } });
          if (source.holderId !== roundPlayerId) throw AppError.conflict('NOT_YOUR_TURF', 'One selected source block is no longer yours.');
          if (rows.length > source.cornerThugs) throw AppError.badRequest('TURF_MOVE_TOO_MANY', `Only ${source.cornerThugs} thugs are posted on a source corner.`);
          const cornerThugs = source.cornerThugs - rows.length;
          const released = cornerThugs === 0;
          if (!released) {
            const minimum = cornerMinimumFor(ruleset, source.district as DistrictKey, crewThugs);
            if (cornerThugs < minimum) throw AppError.conflict('TURF_CORNER_MINIMUM', `Leave at least ${minimum} on each source corner, or move the whole crew.`);
          }
          const existingGuns = gunsFromTurf(source);
          const carried = releaseCornerGuns(existingGuns, rows.length);
          incomingGuns = addCornerGuns(incomingGuns, carried);
          const remainingGuns = subtractCornerGuns(existingGuns, carried);
          if (released) {
            await endTurfHold(tx, source.id, now);
            anyReleased = true;
          }
          await tx.turf.update({
            where: { id: source.id },
            data: released ? {
              holderId: null, cornerThugs: 0, ...turfGunData({ pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 }),
              heldSince: null, shieldUntil: null, upkeepAt: now, localsThugs: 0, localsAt: now, localsReclaimAt: localsReclaimAt(ruleset, now),
            } : { cornerThugs, ...turfGunData(remainingGuns), upkeepAt: now },
          });
        }
        const targetGuns = addCornerGuns(gunsFromTurf(freshTarget), incomingGuns);
        await tx.turf.update({
          where: { id: freshTarget.id },
          data: { cornerThugs: freshTarget.cornerThugs + members.length, ...turfGunData(targetGuns), upkeepAt: now },
        });
        if (anyReleased) await recordTerritoryControlChange(tx, { roundId: round.id, cityId: player.cityId, ruleset, before: controlBefore, at: now });
        await tx.crewMember.updateMany({
          where: { roundPlayerId, id: { in: input.memberIds } },
          data: { assignmentRef: freshTarget.id, statusSince: now },
        });
        await tx.crewMemberEvent.createMany({
          data: members.flatMap((member) => [
            { memberId: member.id, roundPlayerId, kind: 'UNASSIGNED' as const, assignmentKind: 'TURF' as const, assignmentRef: member.assignmentRef, summary: 'Moved between corners.', at: now },
            { memberId: member.id, roundPlayerId, kind: 'ASSIGNED' as const, assignmentKind: 'TURF' as const, assignmentRef: freshTarget.id, summary: 'Moved to this corner.', at: now },
          ]),
        });
        const next = { ...current, turns: current.turns - ruleset.turf!.corner.postTurnCost };
        return {
          next,
          result: result({
            kind: 'TURF_MOVE', memberIds: input.memberIds, assigned: 0, released: 0, moved: members.length,
            from: bySource.size === 1 ? [...bySource.keys()][0]! : null, to: freshTarget.id, dealerThugs: next.dealerThugs, postedThugs: next.postedThugs, availableThugs: fitThugs(next), turnsUsed: ruleset.turf!.corner.postTurnCost,
            message: `${members.length} thug${members.length === 1 ? '' : 's'} moved to ${localDistrictName(ruleset, player.city.slug, targetKey)}.`,
          }),
          activity: { type: 'TURF_POST', payload: { district: targetKey, thugs: members.length, cornerThugs: freshTarget.cornerThugs + members.length, moved: true } },
          ledger: [],
        };
      },
    });
  },
};
