import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type { BusinessKey } from '@streets/rulesets';
import type { CrewAssignmentKindDto, CrewMemberDto, CrewMemberHistoryDto, CrewMemberStatusDto, CrewRosterDto, CrewRosterQuery } from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { crewMemberName, crewMemberSpecialty, crewMemberTraits } from './crew-profile.js';
import { IdempotencyService } from './idempotency.service.js';
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
  id: true, role: true, serial: true, status: true, assignmentKind: true, assignmentRef: true, experiencePoints: true, specialty: true, specialtyExperiencePoints: true, dealerStaffId: true,
} as const;

/** Rows per statement, well inside Postgres' bind-parameter limit. */
const CHUNK = 1_000;

/** 1.7.0-E selected operation teams carry forward into later 1.7 rulesets built on it. */
const SELECTED_TEAM_RULESETS: ReadonlySet<string> = new Set(['classic-og-v1.7-e', 'classic-og-v1.7-g']);

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

/**
 * Everything the roster follows, in one string: the counts and where the game says they are.
 * While it matches what the roster was last synced to, there is nothing to check.
 */
function rosterKey(counts: CrewCounts, refs: CrewRefs): string {
  const fields = Object.keys(COUNT_FIELDS).map((field) => counts[field as keyof CrewCounts]);
  const business = [...refs.businesses].sort((x, y) => x.id.localeCompare(y.id)).map((row) => `${row.id}:${row.role}:${row.staff}`);
  const turf = [...refs.turf].sort((x, y) => x.id.localeCompare(y.id)).map((row) => `${row.id}:${row.thugs}`);
  const dealers = refs.dealers.map((row) => `${row.staffId}:${row.crewId}:${row.experiencePoints}`);
  return createHash('sha1').update(JSON.stringify([fields, business, turf, dealers])).digest('base64');
}

type PlaceGroup = { role: CrewRole; status: CrewMemberStatusDto; assignmentKind: CrewAssignmentKindDto | null; assignmentRef: string | null; _count: { _all: number } };
const groupKey = (group: Pick<PlaceGroup, 'role' | 'status' | 'assignmentKind' | 'assignmentRef'>) => crewPlaceKey(group.role, {
  status: group.status as CrewPlace['status'], assignmentKind: group.assignmentKind, assignmentRef: group.assignmentRef,
});

/**
 * What a sync needs to look at when the roster is not in step, without reading the whole
 * crew: every dealer and career carrier (a handful), and from each place holding more than
 * the counts allow, only the surplus, least senior first. Everyone else stays put and is
 * passed to the planner as a count. Null when the roster is already in step.
 */
async function loadChanges(tx: Db, roundPlayerId: string, counts: CrewCounts, refs: CrewRefs): Promise<{ members: CrewMemberRow[]; placed: Map<string, number> } | null> {
  const want = crewPlaceCounts(crewTargets(counts, refs));
  const careerIds = refs.dealers.map((career) => career.staffId);
  const [groups, carriers] = await Promise.all([
    tx.crewMember.groupBy({
      by: ['role', 'status', 'assignmentKind', 'assignmentRef'],
      where: { roundPlayerId, status: { not: 'RELEASED' } },
      _count: { _all: true },
    }).then((rows) => rows as PlaceGroup[]),
    tx.crewMember.findMany({
      where: { roundPlayerId, OR: [{ status: 'ASSIGNED', assignmentKind: 'DEALER' }, ...(careerIds.length ? [{ dealerStaffId: { in: careerIds } }] : [])] },
      select: MEMBER_FIELDS,
    }) as Promise<CrewMemberRow[]>,
  ]);

  const careers = refs.dealers.slice(0, Math.max(0, counts.dealerThugs));
  const byCareer = new Map(carriers.map((row) => [row.dealerStaffId, row]));
  const careersInStep = careers.every((career) => {
    const member = byCareer.get(career.staffId);
    return member?.status === 'ASSIGNED' && member.assignmentKind === 'DEALER' && member.assignmentRef === career.crewId
      && member.experiencePoints === career.experiencePoints;
  });
  const placesInStep = groups.length === want.size && groups.every((group) => want.get(groupKey(group)) === group._count._all);
  if (careersInStep && placesInStep) return null;

  const loaded = new Map(carriers.map((row) => [row.id, row]));
  const wantedByRole = new Map<CrewRole, number>();
  for (const [placeKey, count] of want) {
    const role = placeKey.slice(0, placeKey.indexOf('|')) as CrewRole;
    wantedByRole.set(role, (wantedByRole.get(role) ?? 0) + count);
  }
  const presentByRole = new Map<CrewRole, number>();
  for (const group of groups) presentByRole.set(group.role, (presentByRole.get(group.role) ?? 0) + group._count._all);
  for (const role of ['THUG', 'WORKER'] as const) {
    const vacancies = Math.max(0, (wantedByRole.get(role) ?? 0) - (presentByRole.get(role) ?? 0));
    if (!vacancies) continue;
    const veterans = await tx.crewMember.findMany({
      where: { roundPlayerId, role, status: 'RELEASED', dealerStaffId: null, experiencePoints: { gt: 0 } },
      orderBy: [{ experiencePoints: 'desc' }, { serial: 'asc' }], take: vacancies, select: MEMBER_FIELDS,
    }) as CrewMemberRow[];
    for (const row of veterans) loaded.set(row.id, row);
  }
  for (const group of groups) {
    if (group.assignmentKind === 'DEALER') continue; // already loaded above
    const surplus = group._count._all - (want.get(groupKey(group)) ?? 0);
    if (surplus <= 0) continue;
    const rows = await tx.crewMember.findMany({
      where: { roundPlayerId, role: group.role, status: group.status, assignmentKind: group.assignmentKind, assignmentRef: group.assignmentRef },
      orderBy: [{ experiencePoints: 'asc' }, { serial: 'desc' }],
      take: surplus,
      select: MEMBER_FIELDS,
    }) as CrewMemberRow[];
    for (const row of rows) loaded.set(row.id, row);
  }

  const placed = new Map(groups.map((group) => [groupKey(group), group._count._all]));
  for (const row of loaded.values()) {
    if (row.status === 'RELEASED') continue;
    const placeKey = groupKey(row);
    placed.set(placeKey, (placed.get(placeKey) ?? 0) - 1);
  }
  return { members: [...loaded.values()], placed };
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
  experiencePoints: number; specialty: CrewMemberDto['specialty']; specialtyExperiencePoints: number; dealerStaffId: string | null; joinedAt: Date; statusSince: Date;
}, assignmentLabel: string | null, history: CrewMemberHistoryDto[], ruleset: Ruleset): CrewMemberDto {
  const assignment = row.assignmentKind ? {
    kind: row.assignmentKind,
    ref: row.assignmentRef,
    label: assignmentLabel ?? (row.assignmentKind === 'BUSINESS' ? 'Business shift' : row.assignmentKind === 'DEALER' ? 'Dealer crew' : 'Turf post'),
  } : null;
  const unavailableReason = row.status === 'ASSIGNED' ? `Currently assigned to ${assignment?.label ?? 'a job'}.`
    : row.status === 'IN_TRANSIT' ? 'Away on a run.'
      : row.status === 'RECOVERING' ? 'Recovering from injuries.'
        : row.status === 'RELEASED' ? 'Released from the active crew.' : null;
  return {
    id: row.id,
    name: crewMemberName(row.role, row.serial),
    role: row.role,
    serial: row.serial,
    status: row.status,
    assignment,
    experiencePoints: row.experiencePoints,
    specialty: crewMemberSpecialty(row.dealerStaffId, row.specialty),
    specialtyExperiencePoints: row.specialtyExperiencePoints,
    specialtyLevel: row.specialty === 'GENERALIST' ? 0 : row.specialtyExperiencePoints >= (ruleset.crewRoster?.specialtyTierTwoExperience ?? Number.MAX_SAFE_INTEGER) ? 2 : 1,
    specialtyEffectPercent: row.specialty === 'GENERALIST' || row.specialty === 'DEALER' || row.specialty === 'SERVICE' ? 0 : row.specialtyExperiencePoints >= (ruleset.crewRoster?.specialtyTierTwoExperience ?? Number.MAX_SAFE_INTEGER)
      ? Math.min(ruleset.crewRoster?.specialtyBonusPercent?.tierTwo ?? 0, ruleset.crewRoster?.specialtyBonusPercent?.cap ?? 0)
      : Math.min(ruleset.crewRoster?.specialtyBonusPercent?.tierOne ?? 0, ruleset.crewRoster?.specialtyBonusPercent?.cap ?? 0),
    nextSpecialtyMilestone: row.specialty === 'GENERALIST' ? (ruleset.crewRoster?.specialtyUnlockExperience ?? null)
      : row.specialtyExperiencePoints < (ruleset.crewRoster?.specialtyTierTwoExperience ?? Number.MAX_SAFE_INTEGER) ? (ruleset.crewRoster?.specialtyTierTwoExperience ?? null) : null,
    traits: crewMemberTraits(row.role, row.serial),
    unavailableReason,
    history,
    dealerStaffId: row.dealerStaffId,
    joinedAt: row.joinedAt.toISOString(),
    statusSince: row.statusSince.toISOString(),
  };
}

function assignmentName(kind: CrewAssignmentKindDto | null, ref: string | null, labels: Map<string, string>): string | null {
  if (!kind) return null;
  const key = `${kind}:${ref ?? ''}`;
  return labels.get(key) ?? (kind === 'BUSINESS' ? 'Business shift' : kind === 'DEALER' ? 'Dealer crew' : 'Turf post');
}

function eventHistory(rows: Array<{ kind: 'JOINED' | 'ASSIGNED' | 'UNASSIGNED' | 'RELEASED' | 'REHIRED' | 'WORK_COMPLETED' | 'TRAINED' | 'ADMIN_CORRECTED'; assignmentKind: CrewAssignmentKindDto | null; assignmentRef: string | null; summary: string | null; at: Date }>, joinedAt: Date, labels: Map<string, string>): CrewMemberHistoryDto[] {
  const entries = rows.map((event): CrewMemberHistoryDto => {
    const place = assignmentName(event.assignmentKind, event.assignmentRef, labels);
    const label = event.summary ?? (event.kind === 'JOINED' ? 'Joined the crew'
      : event.kind === 'ASSIGNED' ? `Assigned to ${place ?? 'a job'}`
        : event.kind === 'UNASSIGNED' ? `Returned from ${place ?? 'an assignment'}`
          : event.kind === 'RELEASED' ? 'Released from the crew'
            : event.kind === 'REHIRED' ? 'Rejoined the crew'
              : event.kind === 'TRAINED' ? 'Completed training'
                : event.kind === 'ADMIN_CORRECTED' ? 'Staff corrected this career' : 'Completed a job');
    return { kind: event.kind, label, at: event.at.toISOString() };
  });
  if (!rows.some((event) => event.kind === 'JOINED')) entries.push({ kind: 'JOINED', label: 'Joined this round', at: joinedAt.toISOString() });
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
}

export const CrewRosterService = {
  /** Replace an occupant of an existing slot, or exchange an available member for a released veteran. */
  async exchange(prisma: PrismaClient, roundPlayerId: string, memberId: string, replaceMemberId: string, actionId: string, ruleset: Ruleset, now = new Date()) {
    if (memberId === replaceMemberId) throw AppError.badRequest('INVALID_CREW_EXCHANGE', 'Choose two different crew members.');
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const replay = await IdempotencyService.find<{ memberId: string; replacedMemberId: string }>(tx, actionId, roundPlayerId, 'CREW_EXCHANGE');
      if (replay) return replay;
      await CrewRosterService.sync(tx, roundPlayerId, ruleset, now);
      const [member, replacement] = await Promise.all([
        tx.crewMember.findFirst({ where: { id: memberId, roundPlayerId } }),
        tx.crewMember.findFirst({ where: { id: replaceMemberId, roundPlayerId } }),
      ]);
      if (!member || !replacement) throw AppError.notFound('CREW_MEMBER_NOT_FOUND', 'One of those members is not on your roster.');
      if (member.role !== replacement.role || member.dealerStaffId || replacement.dealerStaffId) throw AppError.conflict('CREW_EXCHANGE_UNSUPPORTED', 'Only members with the same role and no dealer career can be exchanged.');
      const exchangeable = (member.status === 'AVAILABLE' && ['ASSIGNED', 'RELEASED'].includes(replacement.status))
        || (replacement.status === 'AVAILABLE' && ['ASSIGNED', 'RELEASED'].includes(member.status))
        || (member.status === 'ASSIGNED' && replacement.status === 'RELEASED')
        || (member.status === 'ASSIGNED' && replacement.status === 'ASSIGNED' && member.assignmentKind === replacement.assignmentKind && member.assignmentRef === replacement.assignmentRef);
      if (!exchangeable) throw AppError.conflict('CREW_MEMBER_UNAVAILABLE', 'Only available members, current job occupants, and released veterans can be exchanged. Members on runs or recovering cannot move.');
      const toMember = { status: replacement.status, assignmentKind: replacement.assignmentKind, assignmentRef: replacement.assignmentRef, releasedAt: replacement.status === 'RELEASED' ? replacement.releasedAt ?? now : null };
      const toReplacement = { status: member.status, assignmentKind: member.assignmentKind, assignmentRef: member.assignmentRef, releasedAt: member.status === 'RELEASED' ? member.releasedAt ?? now : null };
      await tx.crewMember.update({ where: { id: member.id }, data: { ...toMember, statusSince: now } });
      await tx.crewMember.update({ where: { id: replacement.id }, data: { ...toReplacement, statusSince: now } });
      const event = async (id: string, kind: 'ASSIGNED' | 'UNASSIGNED' | 'RELEASED' | 'REHIRED', assignmentKind: CrewAssignmentKindDto | null, assignmentRef: string | null, summary: string | null) => tx.crewMemberEvent.create({ data: { memberId: id, roundPlayerId, kind, assignmentKind, assignmentRef, summary, at: now } });
      const logMove = async (row: typeof member, to: typeof member) => {
        if (row.status === 'RELEASED' && to.status !== 'RELEASED') return event(row.id, 'REHIRED', to.assignmentKind, to.assignmentRef, 'Rejoined the active crew with career intact.');
        if (to.status === 'RELEASED') return event(row.id, 'RELEASED', row.assignmentKind, row.assignmentRef, 'Released from the active crew.');
        if (row.status === 'ASSIGNED' && (row.assignmentKind !== to.assignmentKind || row.assignmentRef !== to.assignmentRef)) await event(row.id, 'UNASSIGNED', row.assignmentKind, row.assignmentRef, null);
        if (to.status === 'ASSIGNED' && (row.assignmentKind !== to.assignmentKind || row.assignmentRef !== to.assignmentRef || row.status !== 'ASSIGNED')) await event(row.id, 'ASSIGNED', to.assignmentKind, to.assignmentRef, 'Assigned to an existing job slot.');
      };
      await Promise.all([logMove(member, replacement), logMove(replacement, member)]);
      const result = { memberId: member.id, replacedMemberId: replacement.id };
      await IdempotencyService.record(tx, actionId, roundPlayerId, 'CREW_EXCHANGE', result, now);
      return result;
    });
  },
  /**
   * Bring the player's members in line with their counts. `counts` may be passed when the
   * caller has just written them; otherwise they are read. A no-op on rounds without the roster.
   * Anything else that writes members (a future admin correction) must clear `syncedKey`.
   */
  async sync(tx: Db, roundPlayerId: string, ruleset: Ruleset, now: Date, counts?: CrewCounts): Promise<CrewRosterSync | null> {
    if (!ruleset.crewRoster?.enabled) return null;
    await lockRoundPlayer(tx, roundPlayerId);
    const [stored, refs, migration] = await Promise.all([
      counts ?? tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: COUNT_FIELDS }),
      loadRefs(tx, roundPlayerId, ruleset),
      tx.crewRosterMigration.findUnique({ where: { roundPlayerId }, select: { id: true, syncedKey: true } }),
    ]);
    const player = Object.fromEntries(Object.keys(COUNT_FIELDS).map((field) => [field, stored[field as keyof CrewCounts]])) as unknown as CrewCounts;
    const syncedKey = rosterKey(player, refs);
    const firstBuild = !migration;
    const unchanged = { migrated: false, created: 0, moved: 0, released: 0 };
    // Nothing the roster follows has moved since it was last in step.
    if (migration?.syncedKey === syncedKey) return unchanged;

    let changes: { members: CrewMemberRow[]; placed: Map<string, number> } = { members: [], placed: new Map() };
    if (!firstBuild) {
      const found = await loadChanges(tx, roundPlayerId, player, refs);
      if (!found) {
        await tx.crewRosterMigration.update({ where: { roundPlayerId }, data: { syncedKey } });
        return unchanged;
      }
      changes = found;
    }

    const [last, releasedCareers] = await Promise.all([
      tx.crewMember.aggregate({ where: { roundPlayerId }, _max: { serial: true } }),
      firstBuild
        ? tx.dealerStaff.findMany({ where: { roundPlayerId, OR: [{ dealerCrewId: null }, { releasedAt: { not: null } }] }, select: { id: true, experiencePoints: true } })
        : Promise.resolve([]),
    ]);
    const plan = planCrewRoster({
      counts: player,
      refs: { ...refs, releasedCareers: releasedCareers.map((row) => ({ staffId: row.id, experiencePoints: row.experiencePoints })) },
      members: changes.members,
      placed: changes.placed,
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
          specialty: row.dealerStaffId ? 'DEALER' : 'GENERALIST', specialtyExperiencePoints: row.dealerStaffId ? row.experiencePoints : 0,
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
    // Members who left with nothing earned are deleted, their history with them.
    for (const batch of chunks(plan.drops)) await tx.crewMember.deleteMany({ where: { roundPlayerId, id: { in: batch } } });
    for (const link of plan.links) {
      await tx.crewMember.update({ where: { id: link.id }, data: { dealerStaffId: link.dealerStaffId, experiencePoints: link.experiencePoints, specialty: 'DEALER', specialtyExperiencePoints: link.experiencePoints } });
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
          syncedKey,
          createdAt: now,
        },
      });
    } else {
      await tx.crewRosterMigration.update({ where: { roundPlayerId }, data: { syncedKey } });
    }
    return {
      migrated: firstBuild,
      created: plan.creates.length,
      moved: plan.moves.filter((move) => move.to).length,
      released: plan.moves.filter((move) => !move.to).length + plan.drops.length,
    };
  },

  /** 1.6 dealer sales: the experience a career earns is the experience its member has. */
  async addDealerExperience(tx: Db, ruleset: Ruleset, dealerStaffId: string, points: number): Promise<void> {
    if (!ruleset.crewRoster?.enabled || points <= 0) return;
    await tx.crewMember.updateMany({ where: { dealerStaffId }, data: { experiencePoints: { increment: points }, specialtyExperiencePoints: { increment: points }, specialty: 'DEALER' } });
  },

  /** Award a bounded career point share after a server-resolved operation commits successfully. */
  async awardCompletedWork(tx: Db, input: { roundPlayerId: string; ruleset: Ruleset; role: 'THUG' | 'WORKER'; specialty: 'ENFORCER' | 'WHEELMAN' | 'SCOUT' | 'SERVICE'; memberIds?: string[]; assignmentKind?: CrewAssignmentKindDto; assignmentRef?: string | null; at: Date; label: string }): Promise<void> {
    const rules = input.ruleset.crewRoster;
    if (!rules?.enabled || !rules.experiencePerCompletedJob) return;
    const [member] = await tx.crewMember.findMany({
      where: { roundPlayerId: input.roundPlayerId, role: input.role, ...(input.memberIds ? { id: { in: input.memberIds } } : {}), status: input.specialty === 'WHEELMAN' ? { in: ['AVAILABLE', 'IN_TRANSIT'] } : 'AVAILABLE', dealerStaffId: null, OR: [{ specialty: 'GENERALIST' }, { specialty: input.specialty }] },
      orderBy: [{ specialtyExperiencePoints: 'desc' }, { serial: 'asc' }], take: 1,
      select: { id: true, specialty: true, specialtyExperiencePoints: true },
    });
    if (!member) return;
    const points = rules.experiencePerCompletedJob;
    const nextPoints = member.specialtyExperiencePoints + points;
    const specialty = member.specialty === 'GENERALIST' && nextPoints >= (rules.specialtyUnlockExperience ?? Number.MAX_SAFE_INTEGER) ? input.specialty : member.specialty;
    await tx.crewMember.update({ where: { id: member.id }, data: { experiencePoints: { increment: points }, specialtyExperiencePoints: { increment: points }, specialty } });
    await tx.crewMemberEvent.create({ data: { memberId: member.id, roundPlayerId: input.roundPlayerId, kind: 'WORK_COMPLETED', assignmentKind: input.assignmentKind, assignmentRef: input.assignmentRef, summary: `${input.label} · +${points} XP.`, at: input.at } });
  },

  /** Highest bounded effect already earned by a member who can take this job. */
  async specialtyBonusPercent(tx: Db, roundPlayerId: string, ruleset: Ruleset, role: 'THUG' | 'WORKER', specialty: 'ENFORCER' | 'WHEELMAN' | 'SCOUT' | 'SERVICE'): Promise<number> {
    const career = ruleset.crewRoster;
    if (!career?.enabled || specialty === 'SERVICE') return 0;
    const members = await tx.crewMember.findMany({
      where: { roundPlayerId, role, specialty, status: 'AVAILABLE', dealerStaffId: null },
      select: { specialtyExperiencePoints: true },
    });
    const points = Math.max(0, ...members.map((member) => member.specialtyExperiencePoints));
    if (!points) return 0;
    const percent = points >= (career.specialtyTierTwoExperience ?? Number.MAX_SAFE_INTEGER)
      ? career.specialtyBonusPercent?.tierTwo ?? 0
      : career.specialtyBonusPercent?.tierOne ?? 0;
    return Math.min(percent, career.specialtyBonusPercent?.cap ?? 0);
  },

  /** A chosen operation team must still be available and eligible under the player's lock. */
  async selectedSpecialtyBonusPercent(tx: Db, roundPlayerId: string, ruleset: Ruleset, role: 'THUG' | 'WORKER', specialty: 'ENFORCER' | 'WHEELMAN' | 'SCOUT' | 'SERVICE', memberIds: string[]): Promise<number> {
    if (!memberIds.length) return 0;
    if (!SELECTED_TEAM_RULESETS.has(ruleset.meta.id)) throw AppError.badRequest('TEAM_SELECTION_UNAVAILABLE', 'Selected operation teams are not available in this ruleset.');
    const career = ruleset.crewRoster;
    if (!career?.enabled || specialty === 'SERVICE') return 0;
    const members = await tx.crewMember.findMany({
      where: { roundPlayerId, id: { in: memberIds }, role, specialty, status: 'AVAILABLE', dealerStaffId: null },
      select: { id: true, specialtyExperiencePoints: true },
    });
    if (members.length !== memberIds.length) throw AppError.conflict('CREW_TEAM_UNAVAILABLE', 'One or more selected crew members are unavailable or not eligible for this operation. Refresh your roster and choose again.');
    const points = Math.max(0, ...members.map((member) => member.specialtyExperiencePoints));
    if (!points) return 0;
    const percent = points >= (career.specialtyTierTwoExperience ?? Number.MAX_SAFE_INTEGER)
      ? career.specialtyBonusPercent?.tierTwo ?? 0
      : career.specialtyBonusPercent?.tierOne ?? 0;
    return Math.min(percent, career.specialtyBonusPercent?.cap ?? 0);
  },

  /** One history entry per member for a settled dealer shift, never one per interval. */
  async recordDealerShift(tx: Db, roundPlayerId: string, ruleset: Ruleset, crewId: string, dealerStaffIds: string[], sold: number, product: string, at: Date): Promise<void> {
    if (!ruleset.crewRoster?.enabled || sold <= 0 || !dealerStaffIds.length) return;
    const members = await tx.crewMember.findMany({ where: { roundPlayerId, dealerStaffId: { in: dealerStaffIds } }, select: { id: true } });
    if (!members.length) return;
    const productLabel = product === 'CRACK'
      ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack'
      : ruleset.products?.[product]?.name ?? product;
    await tx.crewMemberEvent.createMany({
      data: members.map((member) => ({
        memberId: member.id,
        roundPlayerId,
        kind: 'WORK_COMPLETED',
        assignmentKind: 'DEALER',
        assignmentRef: crewId,
        summary: `Dealer shift complete · ${sold.toLocaleString('en-US')} ${productLabel} sold.`,
        at,
      })),
    });
  },

  /** The roster as it stands, brought in line with the counts first. */
  async view(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, query: CrewRosterQuery, now = new Date()): Promise<CrewRosterDto> {
    if (!ruleset.crewRoster?.enabled) {
      return { enabled: false, supportsSelectedTeams: false, migratedAt: null, totals: [], members: [], total: 0 };
    }
    return prisma.$transaction(async (tx) => {
      await CrewRosterService.sync(tx, roundPlayerId, ruleset, now);
      const where: Prisma.CrewMemberWhereInput = {
        roundPlayerId,
        ...(query.role ? { role: query.role } : {}),
        ...(query.assignment ? { assignmentKind: query.assignment } : {}),
        ...(query.specialty ? { specialty: query.specialty } : {}),
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
      const ids = members.map((member) => member.id);
      const refs = [...new Set(members.flatMap((member) => member.assignmentRef ? [[member.assignmentKind, member.assignmentRef] as const] : []))];
      const [businesses, dealerCrews, turf, events] = await Promise.all([
        tx.business.findMany({ where: { id: { in: refs.filter(([kind]) => kind === 'BUSINESS').map(([, ref]) => ref) } }, select: { id: true, kind: true } }),
        tx.dealerCrew.findMany({ where: { id: { in: refs.filter(([kind]) => kind === 'DEALER').map(([, ref]) => ref) } }, select: { id: true, citySlug: true, districtKey: true } }),
        tx.turf.findMany({ where: { id: { in: refs.filter(([kind]) => kind === 'TURF').map(([, ref]) => ref) } }, select: { id: true, district: true, city: { select: { name: true } } } }),
        ids.length ? tx.crewMemberEvent.findMany({ where: { memberId: { in: ids } }, orderBy: [{ at: 'desc' }, { id: 'desc' }], select: { memberId: true, kind: true, assignmentKind: true, assignmentRef: true, summary: true, at: true } }) : Promise.resolve([]),
      ]);
      const labels = new Map<string, string>();
      for (const business of businesses) {
        const catalog = ruleset.business?.catalog[business.kind as BusinessKey];
        labels.set(`BUSINESS:${business.id}`, catalog?.name ?? business.kind.replaceAll('_', ' ').toLowerCase());
      }
      for (const crew of dealerCrews) {
        const city = ruleset.cities?.[crew.citySlug]?.name ?? crew.citySlug;
        const district = ruleset.cities?.[crew.citySlug]?.districts?.[crew.districtKey as keyof NonNullable<NonNullable<Ruleset['cities']>[string]['districts']>]?.name
          ?? ruleset.districts[crew.districtKey as keyof Ruleset['districts']]?.name ?? crew.districtKey;
        labels.set(`DEALER:${crew.id}`, `${district} · ${city}`);
      }
      for (const block of turf) {
        const district = ruleset.districts[block.district as keyof Ruleset['districts']]?.name ?? block.district;
        labels.set(`TURF:${block.id}`, `${district} · ${block.city.name}`);
      }
      const eventsByMember = new Map<string, typeof events>();
      for (const event of events) {
        const bucket = eventsByMember.get(event.memberId) ?? [];
        if (bucket.length < 4) bucket.push(event);
        eventsByMember.set(event.memberId, bucket);
      }
      return {
        enabled: true,
        supportsSelectedTeams: SELECTED_TEAM_RULESETS.has(ruleset.meta.id),
        migratedAt: migration?.createdAt.toISOString() ?? null,
        totals,
        members: members.map((member) => memberDto(
          member,
          assignmentName(member.assignmentKind, member.assignmentRef, labels),
          eventHistory(eventsByMember.get(member.id) ?? [], member.joinedAt, labels),
          ruleset,
        )),
        total,
      };
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
