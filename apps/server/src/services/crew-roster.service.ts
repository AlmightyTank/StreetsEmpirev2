import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type { BusinessKey } from '@streets/rulesets';
import type { CrewAssignmentKindDto, CrewMemberDto, CrewMemberStatusDto, CrewRosterDto, CrewRosterQuery } from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import {
  crewPlaceCounts,
  crewPlaceKey,
  crewTargets,
  planCrewRoster,
  type CrewCounts,
  type CrewMemberRow,
  type CrewPlace,
  type CrewRefs,
  type CrewRole,
} from './crew-roster-plan.js';

/**
 * 1.7.0-A. Keeps a player's crew members in step with their counts.
 *
 * The counts on the player stay authoritative and nothing here writes them. After an
 * action, and whenever the roster is read, the members are brought in line: the first time,
 * that builds the roster from the counts (the migration, audited once per player); after
 * that, members move between places, join or are released only to match what the counts
 * say. Always under the player's lock, so a retry or a race cannot add anyone twice.
 */

const COUNT_FIELDS = {
  thugs: true, woundedThugs: true, busyThugs: true, postedThugs: true, businessThugs: true, dealerThugs: true,
  whores: true, businessWhores: true,
} as const;

const MEMBER_FIELDS = {
  id: true, role: true, serial: true, status: true, assignmentKind: true, assignmentRef: true, experiencePoints: true, dealerStaffId: true,
} as const;

/** Rows per statement, well inside Postgres' bind-parameter limit. */
const CHUNK = 1_000;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += CHUNK) out.push(rows.slice(index, index + CHUNK));
  return out;
}

export interface CrewRosterSync {
  /** The roster was built for the first time. */
  migrated: boolean;
  created: number;
  moved: number;
  released: number;
}

async function loadRefs(tx: Db, roundPlayerId: string, ruleset: Ruleset): Promise<CrewRefs> {
  const [dealers, businesses, turf] = await Promise.all([
    tx.dealerStaff.findMany({
      where: { roundPlayerId, dealerCrewId: { not: null }, releasedAt: null },
      select: { id: true, dealerCrewId: true, experiencePoints: true },
      orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
    }),
    tx.business.findMany({ where: { staffOwnerId: roundPlayerId, staff: { gt: 0 } }, select: { id: true, kind: true, staff: true } }),
    tx.turf.findMany({ where: { holderId: roundPlayerId, cornerThugs: { gt: 0 } }, select: { id: true, cornerThugs: true } }),
  ]);
  return {
    dealers: dealers.map((row) => ({ staffId: row.id, crewId: row.dealerCrewId!, experiencePoints: row.experiencePoints })),
    businesses: businesses.map((row) => ({
      id: row.id,
      role: ruleset.business?.catalog[row.kind as BusinessKey]?.staff === 'WHORES' ? 'WORKER' as const : 'THUG' as const,
      staff: row.staff,
    })),
    turf: turf.map((row) => ({ id: row.id, thugs: row.cornerThugs })),
  };
}

/** True when every place holds what the counts call for and every career sits with its member. */
async function inStep(tx: Db, roundPlayerId: string, counts: CrewCounts, refs: CrewRefs): Promise<boolean> {
  const want = crewPlaceCounts(crewTargets(counts, refs));
  const groups = await tx.crewMember.groupBy({
    by: ['role', 'status', 'assignmentKind', 'assignmentRef'],
    where: { roundPlayerId, status: { not: 'RELEASED' } },
    _count: { _all: true },
  });
  if (groups.length !== want.size) return false;
  for (const group of groups) {
    const place = { status: group.status, assignmentKind: group.assignmentKind, assignmentRef: group.assignmentRef } as CrewPlace;
    if (want.get(crewPlaceKey(group.role, place)) !== group._count._all) return false;
  }
  const careers = refs.dealers.slice(0, Math.max(0, counts.dealerThugs));
  if (!careers.length) return true;
  const carriers = await tx.crewMember.findMany({
    where: { roundPlayerId, dealerStaffId: { in: careers.map((career) => career.staffId) } },
    select: { dealerStaffId: true, status: true, assignmentKind: true, assignmentRef: true, experiencePoints: true },
  });
  const byCareer = new Map(carriers.map((row) => [row.dealerStaffId, row]));
  return careers.every((career) => {
    const member = byCareer.get(career.staffId);
    return member?.status === 'ASSIGNED' && member.assignmentKind === 'DEALER' && member.assignmentRef === career.crewId
      && member.experiencePoints === career.experiencePoints;
  });
}

function rosterTotals(rows: ReadonlyArray<{ role: CrewRole; status: CrewMemberStatusDto; assignmentKind: CrewAssignmentKindDto | null; _count: { _all: number } }>): CrewRosterDto['totals'] {
  return (['THUG', 'WORKER'] as const).map((role) => {
    const total: CrewRosterDto['totals'][number] = {
      role,
      members: 0,
      byStatus: { AVAILABLE: 0, ASSIGNED: 0, IN_TRANSIT: 0, RECOVERING: 0 },
      byAssignment: { BUSINESS: 0, DEALER: 0, TURF: 0 },
      released: 0,
    };
    for (const row of rows.filter((entry) => entry.role === role)) {
      if (row.status === 'RELEASED') {
        total.released += row._count._all;
        continue;
      }
      total.members += row._count._all;
      total.byStatus[row.status] += row._count._all;
      if (row.assignmentKind) total.byAssignment[row.assignmentKind] += row._count._all;
    }
    return total;
  });
}

async function totalsFor(db: Db | PrismaClient, roundPlayerId: string) {
  const rows = await db.crewMember.groupBy({
    by: ['role', 'status', 'assignmentKind'],
    where: { roundPlayerId },
    _count: { _all: true },
  });
  return rosterTotals(rows);
}

function memberDto(row: {
  id: string; role: CrewRole; serial: number; status: CrewMemberStatusDto; assignmentKind: CrewAssignmentKindDto | null; assignmentRef: string | null;
  experiencePoints: number; dealerStaffId: string | null; joinedAt: Date; statusSince: Date;
}): CrewMemberDto {
  return {
    id: row.id,
    role: row.role,
    serial: row.serial,
    status: row.status,
    assignment: row.assignmentKind ? { kind: row.assignmentKind, ref: row.assignmentRef } : null,
    experiencePoints: row.experiencePoints,
    dealerStaffId: row.dealerStaffId,
    joinedAt: row.joinedAt.toISOString(),
    statusSince: row.statusSince.toISOString(),
  };
}

export const CrewRosterService = {
  /**
   * Bring the player's members in line with their counts. `counts` may be passed when the
   * caller has just written them; otherwise they are read. A no-op on rounds without the roster.
   */
  async sync(tx: Db, roundPlayerId: string, ruleset: Ruleset, now: Date, counts?: CrewCounts): Promise<CrewRosterSync | null> {
    if (!ruleset.crewRoster?.enabled) return null;
    await lockRoundPlayer(tx, roundPlayerId);
    const [player, refs, migration] = await Promise.all([
      counts ?? tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: COUNT_FIELDS }),
      loadRefs(tx, roundPlayerId, ruleset),
      tx.crewRosterMigration.findUnique({ where: { roundPlayerId }, select: { id: true } }),
    ]);
    const firstBuild = !migration;
    if (!firstBuild && await inStep(tx, roundPlayerId, player, refs)) {
      return { migrated: false, created: 0, moved: 0, released: 0 };
    }

    const careerIds = refs.dealers.map((career) => career.staffId);
    const [members, last, releasedCareers] = await Promise.all([
      tx.crewMember.findMany({
        where: { roundPlayerId, OR: [{ status: { not: 'RELEASED' } }, ...(careerIds.length ? [{ dealerStaffId: { in: careerIds } }] : [])] },
        select: MEMBER_FIELDS,
      }),
      tx.crewMember.aggregate({ where: { roundPlayerId }, _max: { serial: true } }),
      firstBuild
        ? tx.dealerStaff.findMany({ where: { roundPlayerId, OR: [{ dealerCrewId: null }, { releasedAt: { not: null } }] }, select: { id: true, experiencePoints: true } })
        : Promise.resolve([]),
    ]);
    const plan = planCrewRoster({
      counts: player,
      refs: { ...refs, releasedCareers: releasedCareers.map((row) => ({ staffId: row.id, experiencePoints: row.experiencePoints })) },
      members: members as CrewMemberRow[],
      nextSerial: (last._max.serial ?? 0) + 1,
      firstBuild,
      newId: randomUUID,
    });

    for (const batch of chunks(plan.creates)) {
      await tx.crewMember.createMany({
        data: batch.map((row) => ({
          id: row.id, roundPlayerId, role: row.role, serial: row.serial, status: row.status,
          assignmentKind: row.assignmentKind, assignmentRef: row.assignmentRef,
          experiencePoints: row.experiencePoints, dealerStaffId: row.dealerStaffId,
          joinedAt: now, statusSince: now, releasedAt: row.status === 'RELEASED' ? now : null,
        })),
      });
    }

    // Moves to the same place go in one statement.
    const byPlace = new Map<string, { to: CrewPlace | null; ids: string[] }>();
    for (const move of plan.moves) {
      const placeKey = move.to ? `${move.to.status}|${move.to.assignmentKind ?? ''}|${move.to.assignmentRef ?? ''}` : 'RELEASED';
      const entry = byPlace.get(placeKey) ?? { to: move.to, ids: [] };
      entry.ids.push(move.id);
      byPlace.set(placeKey, entry);
    }
    for (const { to, ids } of byPlace.values()) {
      const data: Prisma.CrewMemberUpdateManyMutationInput = to
        ? { status: to.status, assignmentKind: to.assignmentKind, assignmentRef: to.assignmentRef, statusSince: now, releasedAt: null }
        : { status: 'RELEASED', assignmentKind: null, assignmentRef: null, statusSince: now, releasedAt: now };
      for (const batch of chunks(ids)) await tx.crewMember.updateMany({ where: { roundPlayerId, id: { in: batch } }, data });
    }
    for (const link of plan.links) {
      await tx.crewMember.update({ where: { id: link.id }, data: { dealerStaffId: link.dealerStaffId, experiencePoints: link.experiencePoints } });
    }
    for (const batch of chunks(plan.events)) {
      await tx.crewMemberEvent.createMany({
        data: batch.map((event) => ({ ...event, roundPlayerId, at: now })),
      });
    }

    if (firstBuild) {
      const totals = await totalsFor(tx, roundPlayerId);
      await tx.crewRosterMigration.create({
        data: {
          roundPlayerId,
          rulesetId: ruleset.meta.id,
          before: Object.fromEntries(Object.keys(COUNT_FIELDS).map((field) => [field, player[field as keyof CrewCounts]])),
          after: totals as unknown as Prisma.InputJsonValue,
          membersCreated: plan.creates.length,
          dealerCareers: plan.creates.filter((row) => row.dealerStaffId).length,
          createdAt: now,
        },
      });
    }
    return {
      migrated: firstBuild,
      created: plan.creates.length,
      moved: plan.moves.filter((move) => move.to).length,
      released: plan.moves.filter((move) => !move.to).length,
    };
  },

  /** 1.6 dealer sales: the experience a career earns is the experience its member has. */
  async addDealerExperience(tx: Db, ruleset: Ruleset, dealerStaffId: string, points: number): Promise<void> {
    if (!ruleset.crewRoster?.enabled || points <= 0) return;
    await tx.crewMember.updateMany({ where: { dealerStaffId }, data: { experiencePoints: { increment: points } } });
  },

  /** The roster as it stands, brought in line with the counts first. */
  async view(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, query: CrewRosterQuery, now = new Date()): Promise<CrewRosterDto> {
    if (!ruleset.crewRoster?.enabled) {
      return { enabled: false, migratedAt: null, totals: [], members: [], total: 0 };
    }
    return prisma.$transaction(async (tx) => {
      await CrewRosterService.sync(tx, roundPlayerId, ruleset, now);
      const where: Prisma.CrewMemberWhereInput = {
        roundPlayerId,
        ...(query.role ? { role: query.role } : {}),
        status: query.status ?? { not: 'RELEASED' },
      };
      const [migration, totals, total, members] = await Promise.all([
        tx.crewRosterMigration.findUnique({ where: { roundPlayerId }, select: { createdAt: true } }),
        totalsFor(tx, roundPlayerId),
        tx.crewMember.count({ where }),
        tx.crewMember.findMany({
          where,
          orderBy: [{ experiencePoints: 'desc' }, { serial: 'asc' }],
          skip: query.offset,
          take: query.limit,
          select: { ...MEMBER_FIELDS, joinedAt: true, statusSince: true },
        }),
      ]);
      return { enabled: true, migratedAt: migration?.createdAt.toISOString() ?? null, totals, members: members.map(memberDto), total };
    });
  },

  /**
   * Build or re-sync every player's roster in a round. Each player is its own transaction
   * under their lock, so the run can stop and start again at any point.
   */
  async syncRound(prisma: PrismaClient, roundId: string, ruleset: Ruleset, now = new Date()): Promise<{ players: number; migrated: number; created: number; released: number }> {
    const summary = { players: 0, migrated: 0, created: 0, released: 0 };
    if (!ruleset.crewRoster?.enabled) return summary;
    const players = await prisma.roundPlayer.findMany({ where: { roundId }, select: { id: true }, orderBy: { id: 'asc' } });
    for (const { id } of players) {
      const result = await prisma.$transaction((tx) => CrewRosterService.sync(tx, id, ruleset, now), { timeout: 60_000 });
      summary.players += 1;
      if (result?.migrated) summary.migrated += 1;
      summary.created += result?.created ?? 0;
      summary.released += result?.released ?? 0;
    }
    return summary;
  },
};
