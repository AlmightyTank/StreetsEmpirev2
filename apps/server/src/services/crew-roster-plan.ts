/**
 * 1.7.0-A. Which crew members fill which places, worked out from the player's counts.
 *
 * The counts on the player (thugs, wounded, busy, posted, business and dealer thugs; whores
 * and business whores) stay the source of truth. The roster follows them: members already in
 * the right place stay there, members whose place shrank fill places that grew, new members
 * join only for places nobody can fill, and whoever is left over is released. Nothing here
 * ever changes a count, so planning twice against the same counts changes nothing the
 * second time. Pure so it can be tested without a database.
 */

export type CrewRole = 'THUG' | 'WORKER';
export type CrewStatus = 'AVAILABLE' | 'ASSIGNED' | 'IN_TRANSIT' | 'RECOVERING' | 'RELEASED';
export type CrewAssignment = 'BUSINESS' | 'DEALER' | 'TURF';
export type CrewEventKind = 'MIGRATED' | 'JOINED' | 'ASSIGNED' | 'UNASSIGNED' | 'RELEASED' | 'REHIRED';

/** The player's columns the roster mirrors. */
export interface CrewCounts {
  thugs: number;
  woundedThugs: number;
  busyThugs: number;
  postedThugs: number;
  businessThugs: number;
  dealerThugs: number;
  whores: number;
  businessWhores: number;
}

/** What the counts are made of, where the game records it. */
export interface CrewRefs {
  /** Dealer careers on a crew now, oldest assignment first. */
  dealers: ReadonlyArray<{ staffId: string; crewId: string; experiencePoints: number }>;
  /** Released dealer careers. Only read on the first build, to give each one a member. */
  releasedCareers?: ReadonlyArray<{ staffId: string; experiencePoints: number }>;
  /** Businesses this player staffs, and with whom. */
  businesses: ReadonlyArray<{ id: string; role: CrewRole; staff: number }>;
  /** Corners this player holds, and the thugs posted on each. */
  turf: ReadonlyArray<{ id: string; thugs: number }>;
}

export interface CrewPlace {
  status: Exclude<CrewStatus, 'RELEASED'>;
  assignmentKind: CrewAssignment | null;
  assignmentRef: string | null;
}

export interface CrewMemberRow {
  id: string;
  role: CrewRole;
  serial: number;
  status: CrewStatus;
  assignmentKind: CrewAssignment | null;
  assignmentRef: string | null;
  experiencePoints: number;
  dealerStaffId: string | null;
}

export interface CrewTarget extends CrewPlace {
  role: CrewRole;
  count: number;
  /** A dealer career that must be in this place: always a count of one. */
  staffId?: string;
  staffExperience?: number;
}

export interface CrewCreate {
  id: string;
  role: CrewRole;
  serial: number;
  status: CrewStatus;
  assignmentKind: CrewAssignment | null;
  assignmentRef: string | null;
  experiencePoints: number;
  dealerStaffId: string | null;
}

export interface CrewMove {
  id: string;
  from: CrewPlace | null;
  /** Null: released. */
  to: CrewPlace | null;
}

export interface CrewLink {
  id: string;
  dealerStaffId: string;
  experiencePoints: number;
}

export interface CrewEvent {
  memberId: string;
  kind: CrewEventKind;
  assignmentKind: CrewAssignment | null;
  assignmentRef: string | null;
}

export interface CrewPlan {
  creates: CrewCreate[];
  moves: CrewMove[];
  /** Members who take up a dealer career, or whose career experience moved. */
  links: CrewLink[];
  events: CrewEvent[];
}

const key = (role: CrewRole, place: CrewPlace) => `${role}|${place.status}|${place.assignmentKind ?? ''}|${place.assignmentRef ?? ''}`;
const placeOf = (row: Pick<CrewMemberRow, 'status' | 'assignmentKind' | 'assignmentRef'>): CrewPlace | null => (row.status === 'RELEASED'
  ? null
  : { status: row.status, assignmentKind: row.assignmentKind, assignmentRef: row.assignmentRef });
const samePlace = (a: CrewPlace | null, b: CrewPlace | null) => (a === null || b === null
  ? a === b
  : a.status === b.status && a.assignmentKind === b.assignmentKind && a.assignmentRef === b.assignmentRef);
const whole = (value: number) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
/** Veterans first, then whoever has been here longest. */
const seniority = (a: CrewMemberRow, b: CrewMemberRow) => b.experiencePoints - a.experiencePoints || a.serial - b.serial;

/** Share `total` out over `rows` in their order; whatever they do not account for has no ref. */
function allocate(rows: ReadonlyArray<{ id: string; count: number }>, total: number): Array<{ ref: string | null; count: number }> {
  const out: Array<{ ref: string | null; count: number }> = [];
  let left = total;
  for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    const take = Math.min(whole(row.count), left);
    if (take > 0) out.push({ ref: row.id, count: take });
    left -= take;
  }
  if (left > 0) out.push({ ref: null, count: left });
  return out;
}

/**
 * Every place the counts call for, by role. Places are filled in a fixed order and each is
 * held to what is left of the role's total, so a roster never has more members than the
 * count, even if the columns disagree with each other.
 */
export function crewTargets(counts: CrewCounts, refs: CrewRefs): CrewTarget[] {
  const targets: CrewTarget[] = [];
  const build = (role: CrewRole, total: number, places: Array<CrewPlace & { count: number; staffId?: string; staffExperience?: number }>) => {
    let left = whole(total);
    for (const place of places) {
      const count = Math.min(whole(place.count), left);
      if (count <= 0) continue;
      left -= count;
      targets.push({ ...place, role, count });
    }
    if (left > 0) targets.push({ role, status: 'AVAILABLE', assignmentKind: null, assignmentRef: null, count: left });
  };

  const dealerCount = whole(counts.dealerThugs);
  const careers = refs.dealers.slice(0, dealerCount);
  build('THUG', counts.thugs, [
    ...careers.map((career) => ({
      status: 'ASSIGNED' as const, assignmentKind: 'DEALER' as const, assignmentRef: career.crewId, count: 1,
      staffId: career.staffId, staffExperience: career.experiencePoints,
    })),
    { status: 'ASSIGNED', assignmentKind: 'DEALER', assignmentRef: null, count: dealerCount - careers.length },
    ...allocate(refs.businesses.filter((row) => row.role === 'THUG').map((row) => ({ id: row.id, count: row.staff })), whole(counts.businessThugs))
      .map(({ ref, count }) => ({ status: 'ASSIGNED' as const, assignmentKind: 'BUSINESS' as const, assignmentRef: ref, count })),
    ...allocate(refs.turf.map((row) => ({ id: row.id, count: row.thugs })), whole(counts.postedThugs))
      .map(({ ref, count }) => ({ status: 'ASSIGNED' as const, assignmentKind: 'TURF' as const, assignmentRef: ref, count })),
    { status: 'IN_TRANSIT', assignmentKind: null, assignmentRef: null, count: counts.busyThugs },
    { status: 'RECOVERING', assignmentKind: null, assignmentRef: null, count: counts.woundedThugs },
  ]);
  build('WORKER', counts.whores, allocate(
    refs.businesses.filter((row) => row.role === 'WORKER').map((row) => ({ id: row.id, count: row.staff })),
    whole(counts.businessWhores),
  ).map(({ ref, count }) => ({ status: 'ASSIGNED' as const, assignmentKind: 'BUSINESS' as const, assignmentRef: ref, count })));
  return targets;
}

/** Members in each place, keyed like `crewTargets`: what a roster in step should hold. */
export function crewPlaceCounts(targets: readonly CrewTarget[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const target of targets) out.set(key(target.role, target), (out.get(key(target.role, target)) ?? 0) + target.count);
  return out;
}

export function crewPlaceKey(role: CrewRole, place: CrewPlace): string {
  return key(role, place);
}

export interface CrewPlanInput {
  counts: CrewCounts;
  refs: CrewRefs;
  /** Every member still in the crew, and any released member who carries a career on a crew now. */
  members: readonly CrewMemberRow[];
  /** The serial the next new member takes. */
  nextSerial: number;
  /** The roster has never been built: new members were already here, and say so. */
  firstBuild: boolean;
  newId: () => string;
}

export function planCrewRoster(input: CrewPlanInput): CrewPlan {
  const targets = crewTargets(input.counts, input.refs);
  const plan: CrewPlan = { creates: [], moves: [], links: [], events: [] };
  const placed = new Map<string, CrewPlace | null>();
  const used = new Set<string>();
  let serial = input.nextSerial;

  const move = (member: CrewMemberRow, to: CrewPlace | null) => {
    used.add(member.id);
    placed.set(member.id, to);
  };

  // 1. A dealer career on a crew is carried by its own member, wherever that member was.
  const byCareer = new Map(input.members.filter((row) => row.dealerStaffId).map((row) => [row.dealerStaffId!, row]));
  const unfilledCareers: CrewTarget[] = [];
  for (const target of targets) {
    if (!target.staffId) continue;
    const member = byCareer.get(target.staffId);
    if (member) {
      move(member, target);
      if (member.experiencePoints !== target.staffExperience) {
        plan.links.push({ id: member.id, dealerStaffId: target.staffId, experiencePoints: target.staffExperience ?? 0 });
      }
    } else {
      unfilledCareers.push(target);
    }
  }

  // 2. Everyone else in the crew keeps their place while it has room: veterans first.
  const open = new Map<string, { target: CrewTarget; left: number }>();
  for (const target of targets) {
    if (target.staffId) continue;
    const slot = open.get(key(target.role, target));
    if (slot) slot.left += target.count;
    else open.set(key(target.role, target), { target, left: target.count });
  }
  const floating: CrewMemberRow[] = [];
  const active = input.members.filter((row) => row.status !== 'RELEASED' && !used.has(row.id)).sort(seniority);
  for (const member of active) {
    const slot = open.get(key(member.role, placeOf(member)!));
    if (slot && slot.left > 0) {
      slot.left -= 1;
      move(member, slot.target);
    } else {
      floating.push(member);
    }
  }

  // 3. A career new to the roster goes to a member who stepped out of their place, one who
  // carries no other career if anyone can.
  const take = (role: CrewRole, preferUnlinked: boolean): CrewMemberRow | undefined => {
    const index = preferUnlinked
      ? (() => {
          const free = floating.findIndex((row) => row.role === role && !row.dealerStaffId);
          return free >= 0 ? free : floating.findIndex((row) => row.role === role);
        })()
      : floating.findIndex((row) => row.role === role);
    return index >= 0 ? floating.splice(index, 1)[0] : undefined;
  };
  const toCreate: Array<{ target: CrewPlace & { role: CrewRole }; staffId?: string; experience: number }> = [];
  for (const target of unfilledCareers) {
    const member = take('THUG', true);
    if (member) {
      move(member, target);
      plan.links.push({ id: member.id, dealerStaffId: target.staffId!, experiencePoints: target.staffExperience ?? 0 });
    } else {
      toCreate.push({ target, staffId: target.staffId, experience: target.staffExperience ?? 0 });
    }
  }

  // 4. Places that grew take the members whose places shrank, then new members.
  for (const { target, left } of open.values()) {
    for (let index = 0; index < left; index += 1) {
      const member = take(target.role, false);
      if (member) move(member, target);
      else toCreate.push({ target, experience: 0 });
    }
  }

  // 5. Whoever is still without a place has left the crew.
  for (const member of floating) move(member, null);

  // On the first build, released 1.6 careers belong to thugs who went back to the pool:
  // the most experienced go to the thugs at home first, and any beyond the crew are kept
  // as released members so no career is lost.
  const released = input.firstBuild
    ? [...(input.refs.releasedCareers ?? [])].filter((career) => !byCareer.has(career.staffId)).sort((a, b) => b.experiencePoints - a.experiencePoints || a.staffId.localeCompare(b.staffId))
    : [];
  const order = (place: CrewPlace) => (place.status === 'AVAILABLE' ? 0 : place.status === 'ASSIGNED' && place.assignmentKind !== 'DEALER' ? 1 : 2);
  const careerless = toCreate.filter((entry) => !entry.staffId && entry.target.role === 'THUG' && !(entry.target.status === 'ASSIGNED' && entry.target.assignmentKind === 'DEALER'))
    .sort((a, b) => order(a.target) - order(b.target));
  for (const entry of careerless) {
    const career = released.shift();
    if (!career) break;
    entry.staffId = career.staffId;
    entry.experience = career.experiencePoints;
  }

  for (const entry of toCreate) {
    const id = entry.staffId && input.firstBuild ? entry.staffId : input.newId();
    const { role, ...place } = entry.target;
    plan.creates.push({
      id, role, serial: serial++, status: place.status, assignmentKind: place.assignmentKind, assignmentRef: place.assignmentRef,
      experiencePoints: entry.experience, dealerStaffId: entry.staffId ?? null,
    });
    plan.events.push({ memberId: id, kind: input.firstBuild ? 'MIGRATED' : 'JOINED', assignmentKind: place.assignmentKind, assignmentRef: place.assignmentRef });
  }
  for (const career of released) {
    plan.creates.push({
      id: career.staffId, role: 'THUG', serial: serial++, status: 'RELEASED', assignmentKind: null, assignmentRef: null,
      experiencePoints: career.experiencePoints, dealerStaffId: career.staffId,
    });
    plan.events.push({ memberId: career.staffId, kind: 'MIGRATED', assignmentKind: null, assignmentRef: null });
  }

  for (const member of input.members) {
    if (!placed.has(member.id)) continue;
    const from = placeOf(member);
    const to = placed.get(member.id)!;
    if (samePlace(from, to)) continue;
    plan.moves.push({ id: member.id, from, to });
    if (from === null) {
      plan.events.push({ memberId: member.id, kind: 'REHIRED', assignmentKind: to!.assignmentKind, assignmentRef: to!.assignmentRef });
      continue;
    }
    if (to === null) {
      plan.events.push({ memberId: member.id, kind: 'RELEASED', assignmentKind: from.assignmentKind, assignmentRef: from.assignmentRef });
      continue;
    }
    const changed = from.assignmentKind !== to.assignmentKind || from.assignmentRef !== to.assignmentRef;
    if (changed && from.assignmentKind) plan.events.push({ memberId: member.id, kind: 'UNASSIGNED', assignmentKind: from.assignmentKind, assignmentRef: from.assignmentRef });
    if (changed && to.assignmentKind) plan.events.push({ memberId: member.id, kind: 'ASSIGNED', assignmentKind: to.assignmentKind, assignmentRef: to.assignmentRef });
  }
  return plan;
}
