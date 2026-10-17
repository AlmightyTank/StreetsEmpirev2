/**
 * 2.1.0-A — fail-closed identity audit for a proposed roster reconciliation.
 *
 * Runs inside the player's existing transaction, before any mutation. Only the
 * changed members and the aggregate counts of untouched placements are needed,
 * so very large rosters do not need to be loaded into application memory.
 */
import {
  crewPlaceCounts,
  crewPlaceKey,
  crewTargets,
  type CrewMemberRow,
  type CrewPlace,
  type CrewPlan,
  type CrewPlanInput,
} from './crew-roster-plan.js';

type Member = CrewMemberRow;
type ActivePlace = CrewPlace | null;

function placeOf(row: Member): ActivePlace {
  if (row.status === 'RELEASED') return null;
  return { status: row.status, assignmentKind: row.assignmentKind, assignmentRef: row.assignmentRef };
}

function samePlace(a: ActivePlace, b: ActivePlace): boolean {
  return a === null || b === null
    ? a === b
    : a.status === b.status && a.assignmentKind === b.assignmentKind && a.assignmentRef === b.assignmentRef;
}

function invalid(reason: string): never {
  throw new Error(`CREW_ROSTER_IDENTITY_AUDIT_FAILED: ${reason}`);
}

export function assertCrewRosterPlan(input: CrewPlanInput, plan: CrewPlan): void {
  const projected = new Map<string, Member>();
  const serials = new Set<number>();
  for (const row of input.members) {
    if (projected.has(row.id)) invalid(`duplicate loaded member ${row.id}`);
    if (serials.has(row.serial)) invalid(`duplicate loaded serial ${row.serial}`);
    projected.set(row.id, { ...row });
    serials.add(row.serial);
  }

  const moved = new Set<string>();
  for (const change of plan.moves) {
    const row = projected.get(change.id);
    if (!row || moved.has(change.id)) invalid(`invalid or duplicate move ${change.id}`);
    if (!samePlace(placeOf(row), change.from)) invalid(`stale move for ${change.id}`);
    moved.add(change.id);
    Object.assign(row, change.to ?? { status: 'RELEASED', assignmentKind: null, assignmentRef: null });
  }

  const dropped = new Set<string>();
  for (const id of plan.drops) {
    const row = projected.get(id);
    if (!row || dropped.has(id) || moved.has(id)) invalid(`invalid or duplicate drop ${id}`);
    if (row.experiencePoints !== 0 || row.dealerStaffId || (row.loyaltyPoints ?? 0) > 0
      || row.nicknameKey || row.apprenticeship || row.mentoringBonds?.length) {
      invalid(`drop would erase a career for ${id}`);
    }
    dropped.add(id);
    projected.delete(id);
  }

  for (const row of plan.creates) {
    if (projected.has(row.id) || serials.has(row.serial) || row.serial < input.nextSerial) {
      invalid(`duplicate or reused member identity ${row.id}`);
    }
    serials.add(row.serial);
    projected.set(row.id, { ...row });
  }

  const linked = new Set<string>();
  for (const link of plan.links) {
    const row = projected.get(link.id);
    if (!row || linked.has(link.id)) invalid(`invalid career link ${link.id}`);
    if (row.dealerStaffId && row.dealerStaffId !== link.dealerStaffId) {
      invalid(`career overwrite for ${link.id}`);
    }
    row.dealerStaffId = link.dealerStaffId;
    row.experiencePoints = link.experiencePoints;
    linked.add(link.id);
  }

  const owners = new Set<string>();
  for (const row of projected.values()) {
    if (!row.dealerStaffId) continue;
    if (owners.has(row.dealerStaffId)) invalid(`duplicate dealer career ${row.dealerStaffId}`);
    owners.add(row.dealerStaffId);
  }

  const have = new Map<string, number>();
  for (const [key, count] of input.placed ?? []) {
    if (!Number.isSafeInteger(count) || count < 0) invalid(`invalid untouched placement ${key}`);
    if (count) have.set(key, (have.get(key) ?? 0) + count);
  }
  for (const row of projected.values()) {
    const place = placeOf(row);
    if (!place) continue;
    const key = crewPlaceKey(row.role, place);
    have.set(key, (have.get(key) ?? 0) + 1);
  }
  const want = crewPlaceCounts(crewTargets(input.counts, input.refs));
  const keys = new Set([...want.keys(), ...have.keys()]);
  for (const key of keys) {
    if ((want.get(key) ?? 0) !== (have.get(key) ?? 0)) {
      invalid(`placement ${key}: expected ${want.get(key) ?? 0}, projected ${have.get(key) ?? 0}`);
    }
  }

  // The selected, authoritative DealerStaff careers must each still have their
  // own active, correctly assigned member. No released history can fill a slot.
  const targets = crewTargets(input.counts, input.refs);
  for (const target of targets) {
    if (!target.staffId) continue;
    const matches = [...projected.values()].filter((row) => row.dealerStaffId === target.staffId);
    if (matches.length !== 1 || !samePlace(placeOf(matches[0]!), target)) {
      invalid(`missing or misplaced dealer career ${target.staffId}`);
    }
  }

  for (const event of plan.events) {
    if (!projected.has(event.memberId)) invalid(`orphaned event ${event.memberId}`);
  }
}
