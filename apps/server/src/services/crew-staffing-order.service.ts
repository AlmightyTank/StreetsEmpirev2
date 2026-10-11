import type { CrewJobPostKind, Prisma, PrismaClient } from '@prisma/client';
import { dealerRules, headsUpMinutes, type Ruleset } from '@streets/rules-engine';
import type {
  CrewAssignmentKindDto,
  CrewJobPostKindDto,
  CrewStaffingOrderDto,
  CrewStaffingOrderFillDto,
  CrewStaffingOrderInput,
  CrewStaffingOrderResult,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer } from '../utils/db.js';
import { IdempotencyService } from './idempotency.service.js';
import type { PlayerState } from './action.service.js';
import { fitThugs } from './crew-availability.js';
import { CrewRosterService } from './crew-roster.service.js';
import {
  TurfService,
  addCornerGuns,
  allocateCornerGuns,
  cornerGunWorthCents,
  gunsFromTurf,
  turfGunData,
  type CornerGuns,
} from './turf.service.js';

type StaffingKind = Extract<CrewJobPostKindDto, 'DEALER' | 'TURF' | 'CORNER_LOOKOUT' | 'STASH_GUARD' | 'RUNNER'>;
type OrderRow = {
  id: string;
  kind: CrewJobPostKind;
  targetRef: string | null;
  citySlug: string | null;
  districtKey: string | null;
  headcount: number;
  settings: Prisma.JsonValue;
  isActive: boolean;
  updatedAt: Date;
};

const DEFAULT_KEEP_TURNS = 10;
const CORNER_JOB_LIMITS = { CORNER_LOOKOUT: 3, STASH_GUARD: 5 } as const;

function settingsFor(keepTurns: number): Prisma.InputJsonObject {
  return { keepTurns };
}

function keepTurnsFrom(settings: Prisma.JsonValue): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return DEFAULT_KEEP_TURNS;
  const value = (settings as Record<string, unknown>).keepTurns;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_KEEP_TURNS;
}

function toDto(row: OrderRow): CrewStaffingOrderDto {
  return {
    id: row.id,
    kind: row.kind as CrewJobPostKindDto,
    targetRef: row.targetRef ?? '',
    citySlug: row.citySlug,
    districtKey: row.districtKey,
    headcount: row.headcount,
    keepTurns: keepTurnsFrom(row.settings),
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function jobName(kind: StaffingKind): string {
  switch (kind) {
    case 'DEALER': return 'dealer';
    case 'TURF': return 'corner defender';
    case 'RUNNER': return 'runner';
    case 'CORNER_LOOKOUT': return 'corner lookout';
    case 'STASH_GUARD': return 'stash guard';
  }
}

function assignmentKind(kind: Extract<StaffingKind, 'RUNNER' | 'CORNER_LOOKOUT' | 'STASH_GUARD'>): CrewAssignmentKindDto {
  return kind;
}

function nextWithPostedGuns(current: PlayerState, guns: CornerGuns, ruleset: Ruleset): PlayerState {
  const postedNetWorthCents = current.postedNetWorthCents + cornerGunWorthCents(ruleset, guns);
  return {
    ...current,
    pistols: current.pistols - guns.pistols,
    shotguns: current.shotguns - guns.shotguns,
    tek9s: current.tek9s - guns.tek9s,
    ak47s: current.ak47s - guns.ak47s,
    postedNetWorthCents,
  };
}

function oneLine(order: OrderRow, assigned: number, turnsUsed: number): CrewStaffingOrderFillDto {
  const noun = jobName(order.kind as StaffingKind);
  return {
    orderId: order.id,
    kind: order.kind as CrewJobPostKindDto,
    targetRef: order.targetRef ?? '',
    assigned,
    turnsUsed,
    message: `Staffing order filled ${assigned} ${noun}${assigned === 1 ? '' : 's'}${turnsUsed ? ` for ${turnsUsed} turns` : ''}.`,
  };
}

async function availableThugs(tx: Db, roundPlayerId: string, count: number) {
  if (count <= 0) return [];
  return tx.crewMember.findMany({
    where: { roundPlayerId, role: 'THUG', status: 'AVAILABLE' },
    orderBy: [{ statusSince: 'asc' }, { serial: 'asc' }],
    take: count,
    select: { id: true, dealerStaffId: true },
  });
}

async function lockBlock(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}

async function spottedPush(tx: Db, input: { turfId: string; ruleset: Ruleset; player: { hideoutLookoutsLevel: number; racketEffects: unknown }; now: Date }): Promise<boolean> {
  if (!input.ruleset.turf?.wars) return false;
  const push = await tx.turfPush.findFirst({ where: { turfId: input.turfId, status: 'PENDING' }, select: { landsAt: true } });
  return Boolean(push && push.landsAt <= new Date(input.now.getTime() + headsUpMinutes(input.ruleset, input.player.hideoutLookoutsLevel, input.player.racketEffects) * 60_000));
}

export const CrewStaffingOrderService = {
  async list(prisma: PrismaClient, roundPlayerId: string): Promise<CrewStaffingOrderDto[]> {
    const rows = await prisma.crewJobPost.findMany({
      where: { roundPlayerId, kind: { in: ['DEALER', 'TURF', 'CORNER_LOOKOUT', 'STASH_GUARD', 'RUNNER'] }, targetRef: { not: null } },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    }) as OrderRow[];
    return rows.map(toDto);
  },

  async set(prisma: PrismaClient, roundPlayerId: string, input: CrewStaffingOrderInput, ruleset: Ruleset, now = new Date()): Promise<CrewStaffingOrderResult> {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const replay = await IdempotencyService.find<CrewStaffingOrderResult>(tx, input.actionId, roundPlayerId, 'CREW_STAFFING_ORDER_SET');
      if (replay) return replay;

      let citySlug: string | null = null;
      let districtKey: string | null = null;
      if (input.kind === 'DEALER' || input.kind === 'RUNNER') {
        if (!dealerRules(ruleset)) throw AppError.notFound('DEALERS_DISABLED', 'Dealer crews are not available in this round.');
        const crew = await tx.dealerCrew.findFirst({ where: { id: input.targetRef, roundPlayerId, status: { in: ['ACTIVE', 'PAUSED'] } } });
        if (!crew) throw AppError.notFound('DEALER_CREW_NOT_FOUND', 'That dealer crew is not yours.');
        citySlug = crew.citySlug;
        districtKey = crew.districtKey;
      } else {
        if (!TurfService.holdingEnabled(ruleset)) throw AppError.conflict('TURF_HOLDING_DISABLED', 'Corners cannot be claimed in this round.');
        const turf = await tx.turf.findFirst({ where: { id: input.targetRef, holderId: roundPlayerId } });
        if (!turf) throw AppError.notFound('TURF_NOT_FOUND', 'That corner is not yours.');
        citySlug = null;
        districtKey = turf.district;
      }

      const existing = await tx.crewJobPost.findFirst({ where: { roundPlayerId, kind: input.kind, targetRef: input.targetRef }, orderBy: { createdAt: 'asc' } });
      const data = {
        citySlug,
        districtKey,
        headcount: input.headcount,
        settings: settingsFor(input.keepTurns),
        isActive: input.headcount > 0,
      };
      const row = existing
        ? await tx.crewJobPost.update({ where: { id: existing.id }, data })
        : await tx.crewJobPost.create({ data: {
          roundPlayerId,
          kind: input.kind,
          targetRef: input.targetRef,
          ...data,
        } }) as OrderRow;
      const result = {
        order: toDto(row),
        message: input.headcount > 0
          ? `Staffing order set for ${input.headcount} ${jobName(input.kind)}${input.headcount === 1 ? '' : 's'}.`
          : 'Staffing order turned off.',
      };
      await IdempotencyService.record(tx, input.actionId, roundPlayerId, 'CREW_STAFFING_ORDER_SET', result, now);
      return result;
    });
  },

  async apply(tx: Db, input: { roundPlayerId: string; ruleset: Ruleset; now: Date; state: PlayerState; player: { id: string; roundId: string; cityId: string; hideoutLookoutsLevel: number; racketEffects: unknown } }): Promise<{ next: PlayerState; fills: CrewStaffingOrderFillDto[] }> {
    if (!input.ruleset.crewRoster?.enabled) return { next: input.state, fills: [] };
    let state = input.state;
    const fills: CrewStaffingOrderFillDto[] = [];
    const orders = await tx.crewJobPost.findMany({
      where: {
        roundPlayerId: input.roundPlayerId,
        isActive: true,
        headcount: { gt: 0 },
        targetRef: { not: null },
        kind: { in: ['DEALER', 'TURF', 'CORNER_LOOKOUT', 'STASH_GUARD', 'RUNNER'] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }) as OrderRow[];
    if (!orders.length) return { next: state, fills };
    await CrewRosterService.sync(tx, input.roundPlayerId, input.ruleset, input.now, state);

    for (const order of orders) {
      const kind = order.kind as StaffingKind;
      const targetRef = order.targetRef;
      if (!targetRef) continue;
      const keepTurns = keepTurnsFrom(order.settings);
      if (kind === 'DEALER') {
        const rules = dealerRules(input.ruleset);
        if (!rules) continue;
        const crew = await tx.dealerCrew.findFirst({ where: { id: targetRef, roundPlayerId: input.roundPlayerId, status: { in: ['ACTIVE', 'PAUSED'] } } });
        if (!crew) continue;
        const posted = await tx.dealerStaff.count({ where: { dealerCrewId: crew.id, releasedAt: null } });
        const wanted = Math.min(order.headcount, rules.maxDealersPerCrew) - posted;
        const count = Math.min(Math.max(0, wanted), fitThugs(state));
        const members = await availableThugs(tx, input.roundPlayerId, count);
        if (!members.length) continue;
        const assignedMembers: typeof members = [];
        for (const member of members) {
          const career = member.dealerStaffId
            ? await tx.dealerStaff.findFirst({ where: { id: member.dealerStaffId, roundPlayerId: input.roundPlayerId, dealerCrewId: null, releasedAt: { not: null } } })
            : null;
          if (member.dealerStaffId && !career) continue;
          const assigned = career
            ? await tx.dealerStaff.update({ where: { id: career.id }, data: { dealerCrewId: crew.id, assignedAt: input.now, releasedAt: null } })
            : await tx.dealerStaff.create({ data: { roundPlayerId: input.roundPlayerId, dealerCrewId: crew.id, experiencePoints: 0, assignedAt: input.now } });
          await tx.crewMember.update({
            where: { id: member.id },
            data: {
              status: 'ASSIGNED', assignmentKind: 'DEALER', assignmentRef: crew.id, statusSince: input.now, releasedAt: null,
              dealerStaffId: assigned.id, experiencePoints: assigned.experiencePoints, specialty: 'DEALER', specialtyExperiencePoints: assigned.experiencePoints,
            },
          });
          assignedMembers.push(member);
        }
        if (!assignedMembers.length) continue;
        await tx.crewMemberEvent.createMany({
          data: assignedMembers.map((member) => ({ memberId: member.id, roundPlayerId: input.roundPlayerId, kind: 'ASSIGNED' as const, assignmentKind: 'DEALER' as const, assignmentRef: crew.id, summary: 'Assigned by staffing order.', at: input.now })),
        });
        await tx.dealerCrew.update({ where: { id: crew.id }, data: { capacityUnits: { increment: rules.unitsPerDealer * assignedMembers.length } } });
        state = { ...state, dealerThugs: state.dealerThugs + assignedMembers.length };
        fills.push(oneLine(order, assignedMembers.length, 0));
      } else if (kind === 'RUNNER') {
        if (!input.ruleset.supplyNetwork?.enabled || !dealerRules(input.ruleset)) continue;
        const crew = await tx.dealerCrew.findFirst({ where: { id: targetRef, roundPlayerId: input.roundPlayerId, status: { in: ['ACTIVE', 'PAUSED'] } } });
        if (!crew) continue;
        const posted = await tx.crewMember.count({ where: { roundPlayerId: input.roundPlayerId, role: 'THUG', status: 'ASSIGNED', assignmentKind: 'RUNNER', assignmentRef: crew.id } });
        const count = Math.min(Math.max(0, order.headcount - posted), fitThugs(state));
        const members = await availableThugs(tx, input.roundPlayerId, count);
        if (!members.length) continue;
        await tx.crewMember.updateMany({
          where: { roundPlayerId: input.roundPlayerId, id: { in: members.map((member) => member.id) } },
          data: { status: 'ASSIGNED', assignmentKind: 'RUNNER', assignmentRef: crew.id, statusSince: input.now, releasedAt: null },
        });
        await tx.crewMemberEvent.createMany({
          data: members.map((member) => ({ memberId: member.id, roundPlayerId: input.roundPlayerId, kind: 'ASSIGNED' as const, assignmentKind: 'RUNNER' as const, assignmentRef: crew.id, summary: 'Assigned by staffing order.', at: input.now })),
        });
        state = { ...state, busyThugs: state.busyThugs + members.length };
        fills.push(oneLine(order, members.length, 0));
      } else if (kind === 'TURF') {
        if (!TurfService.holdingEnabled(input.ruleset) || !input.ruleset.turf) continue;
        if (state.turns - input.ruleset.turf.corner.postTurnCost < keepTurns) continue;
        const turf = await tx.turf.findFirst({ where: { id: targetRef, holderId: input.roundPlayerId }, include: { city: { select: { slug: true } } } });
        if (!turf || await spottedPush(tx, { turfId: turf.id, ruleset: input.ruleset, player: input.player, now: input.now })) continue;
        await lockBlock(tx, turf.id);
        const fresh = await tx.turf.findUniqueOrThrow({ where: { id: turf.id } });
        if (fresh.holderId !== input.roundPlayerId) continue;
        const wanted = Math.max(0, order.headcount - fresh.cornerThugs);
        const maxByHome = Math.min(wanted, fitThugs(state));
        let count = maxByHome;
        let guns = allocateCornerGuns(state, count);
        while (count > 0 && !guns) {
          count -= 1;
          guns = allocateCornerGuns(state, count);
        }
        if (!count || !guns) continue;
        const members = await availableThugs(tx, input.roundPlayerId, count);
        if (!members.length) continue;
        const existingGuns = gunsFromTurf(fresh);
        await tx.turf.update({
          where: { id: fresh.id },
          data: { cornerThugs: fresh.cornerThugs + members.length, ...turfGunData(addCornerGuns(existingGuns, guns)), upkeepAt: input.now },
        });
        await tx.crewMember.updateMany({
          where: { roundPlayerId: input.roundPlayerId, id: { in: members.map((member) => member.id) } },
          data: { status: 'ASSIGNED', assignmentKind: 'TURF', assignmentRef: fresh.id, statusSince: input.now, releasedAt: null },
        });
        await tx.crewMemberEvent.createMany({
          data: members.map((member) => ({ memberId: member.id, roundPlayerId: input.roundPlayerId, kind: 'ASSIGNED' as const, assignmentKind: 'TURF' as const, assignmentRef: fresh.id, summary: 'Posted by staffing order.', at: input.now })),
        });
        state = { ...nextWithPostedGuns(state, guns, input.ruleset), turns: state.turns - input.ruleset.turf.corner.postTurnCost, postedThugs: state.postedThugs + members.length };
        fills.push(oneLine(order, members.length, input.ruleset.turf.corner.postTurnCost));
      } else {
        const limit = CORNER_JOB_LIMITS[kind];
        const posted = await tx.crewMember.count({ where: { roundPlayerId: input.roundPlayerId, role: 'THUG', status: 'ASSIGNED', assignmentKind: assignmentKind(kind), assignmentRef: targetRef } });
        const count = Math.max(0, Math.min(order.headcount, limit) - posted);
        if (!count) continue;
        const members = await tx.crewMember.findMany({
          where: { roundPlayerId: input.roundPlayerId, role: 'THUG', status: 'ASSIGNED', assignmentKind: 'TURF', assignmentRef: targetRef, dealerStaffId: null },
          orderBy: [{ statusSince: 'asc' }, { serial: 'asc' }],
          take: count,
          select: { id: true },
        });
        if (!members.length) continue;
        await tx.crewMember.updateMany({
          where: { roundPlayerId: input.roundPlayerId, id: { in: members.map((member) => member.id) } },
          data: { assignmentKind: assignmentKind(kind), assignmentRef: targetRef, statusSince: input.now },
        });
        await tx.crewMemberEvent.createMany({
          data: members.map((member) => ({ memberId: member.id, roundPlayerId: input.roundPlayerId, kind: 'ASSIGNED' as const, assignmentKind: assignmentKind(kind), assignmentRef: targetRef, summary: 'Assigned by staffing order.', at: input.now })),
        });
        fills.push(oneLine(order, members.length, 0));
      }
    }

    return { next: state, fills };
  },
};

