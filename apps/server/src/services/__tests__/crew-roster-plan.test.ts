import { describe, expect, it } from 'vitest';
import {
  crewPlaceCounts,
  crewPlaceKey,
  crewTargets,
  planCrewRoster,
  type CrewCounts,
  type CrewMemberRow,
  type CrewPlan,
  type CrewRefs,
} from '../crew-roster-plan.js';

/**
 * 1.7.0-A gate, pure: the roster always holds exactly the members the counts call for, in
 * the places they call for; planning again against the same counts changes nothing; and
 * dealer careers keep their ids and experience.
 */

const none: CrewCounts = { thugs: 0, woundedThugs: 0, busyThugs: 0, postedThugs: 0, businessThugs: 0, dealerThugs: 0, whores: 0, businessWhores: 0 };
const noRefs: CrewRefs = { dealers: [], businesses: [], turf: [] };

/** A roster that applies plans the way the service writes them. */
class Roster {
  members = new Map<string, CrewMemberRow>();
  serial = 1;
  built = false;
  private ids = 0;

  /** Plan from the whole crew, or (incremental) only what the service would load. */
  plan(counts: CrewCounts, refs: CrewRefs, incremental = false): CrewPlan {
    const careers = new Set(refs.dealers.map((career) => career.staffId));
    const all = [...this.members.values()];
    const carriers = all.filter((row) => (row.status === 'ASSIGNED' && row.assignmentKind === 'DEALER') || (row.dealerStaffId && careers.has(row.dealerStaffId)));
    let members = all.filter((row) => row.status !== 'RELEASED' || (row.dealerStaffId && careers.has(row.dealerStaffId)));
    let placed: Map<string, number> | undefined;
    if (incremental && this.built) {
      // As CrewRosterService loads it: carriers, plus each over-full place's least senior surplus.
      const want = crewPlaceCounts(crewTargets(counts, refs));
      const groups = new Map<string, CrewMemberRow[]>();
      for (const row of all.filter((entry) => entry.status !== 'RELEASED')) {
        const key = crewPlaceKey(row.role, row as never);
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      const loaded = new Map(carriers.map((row) => [row.id, row]));
      for (const [key, rows] of groups) {
        if (rows[0]!.assignmentKind === 'DEALER') continue;
        const surplus = rows.length - (want.get(key) ?? 0);
        const least = [...rows].sort((a, b) => a.experiencePoints - b.experiencePoints || b.serial - a.serial).slice(0, Math.max(0, surplus));
        for (const row of least) loaded.set(row.id, row);
      }
      members = [...loaded.values()];
      placed = new Map([...groups].map(([key, rows]) => [key, rows.filter((row) => !loaded.has(row.id)).length]));
    }
    return planCrewRoster({
      counts,
      refs,
      members,
      placed,
      nextSerial: this.serial,
      firstBuild: !this.built,
      newId: () => `m${++this.ids}`,
    });
  }

  sync(counts: CrewCounts, refs: CrewRefs = noRefs, incremental = false): CrewPlan {
    const plan = this.plan(counts, refs, incremental);
    for (const row of plan.creates) {
      expect(this.members.has(row.id), `duplicate member ${row.id}`).toBe(false);
      this.members.set(row.id, { ...row });
      this.serial = Math.max(this.serial, row.serial + 1);
    }
    for (const move of plan.moves) {
      const row = this.members.get(move.id)!;
      Object.assign(row, move.to ?? { status: 'RELEASED', assignmentKind: null, assignmentRef: null });
    }
    for (const id of plan.drops) {
      const row = this.members.get(id)!;
      expect(row.experiencePoints === 0 && !row.dealerStaffId, `dropped ${id} had something earned`).toBe(true);
      this.members.delete(id);
    }
    for (const link of plan.links) Object.assign(this.members.get(link.id)!, { dealerStaffId: link.dealerStaffId, experiencePoints: link.experiencePoints });
    this.built = true;
    return plan;
  }

  active(role?: 'THUG' | 'WORKER') {
    return [...this.members.values()].filter((row) => row.status !== 'RELEASED' && (!role || row.role === role));
  }

  /** Every place holds exactly what the counts call for. */
  expectInStep(counts: CrewCounts, refs: CrewRefs = noRefs, incremental = false) {
    const want = crewPlaceCounts(crewTargets(counts, refs));
    const have = new Map<string, number>();
    for (const row of this.active()) {
      const key = crewPlaceKey(row.role, { status: row.status as 'AVAILABLE', assignmentKind: row.assignmentKind, assignmentRef: row.assignmentRef });
      have.set(key, (have.get(key) ?? 0) + 1);
    }
    expect(have).toEqual(want);
    expect(this.active('THUG')).toHaveLength(counts.thugs);
    expect(this.active('WORKER')).toHaveLength(counts.whores);
    const empty = this.plan(counts, refs, incremental);
    expect(empty).toEqual({ creates: [], moves: [], drops: [], links: [], events: [] });
  }
}

describe('1.7.0-A crew targets', () => {
  it('puts every counted thug and worker in exactly one place', () => {
    const counts: CrewCounts = { thugs: 40, woundedThugs: 3, busyThugs: 4, postedThugs: 6, businessThugs: 5, dealerThugs: 2, whores: 30, businessWhores: 7 };
    const refs: CrewRefs = {
      dealers: [{ staffId: 's1', crewId: 'c1', experiencePoints: 1_200 }, { staffId: 's2', crewId: 'c1', experiencePoints: 0 }],
      businesses: [{ id: 'b1', role: 'THUG', staff: 5 }, { id: 'b2', role: 'WORKER', staff: 7 }],
      turf: [{ id: 't1', thugs: 4 }, { id: 't2', thugs: 2 }],
    };
    const targets = crewTargets(counts, refs);
    const sum = (role: string, status?: string, kind?: string) => targets
      .filter((row) => row.role === role && (!status || row.status === status) && (!kind || row.assignmentKind === kind))
      .reduce((total, row) => total + row.count, 0);
    expect(sum('THUG')).toBe(40);
    expect(sum('THUG', 'ASSIGNED', 'DEALER')).toBe(2);
    expect(sum('THUG', 'ASSIGNED', 'BUSINESS')).toBe(5);
    expect(sum('THUG', 'ASSIGNED', 'TURF')).toBe(6);
    expect(sum('THUG', 'IN_TRANSIT')).toBe(4);
    expect(sum('THUG', 'RECOVERING')).toBe(3);
    expect(sum('THUG', 'AVAILABLE')).toBe(40 - 2 - 5 - 6 - 4 - 3);
    expect(sum('WORKER')).toBe(30);
    expect(sum('WORKER', 'ASSIGNED', 'BUSINESS')).toBe(7);
    expect(targets.filter((row) => row.staffId).map((row) => [row.staffId, row.assignmentRef])).toEqual([['s1', 'c1'], ['s2', 'c1']]);
  });

  it('never calls for more members than the count, even when the columns disagree', () => {
    const counts: CrewCounts = { ...none, thugs: 5, woundedThugs: 4, busyThugs: 4, businessThugs: 1, whores: 2, businessWhores: 9 };
    const targets = crewTargets(counts, { ...noRefs, businesses: [{ id: 'b1', role: 'THUG', staff: 3 }] });
    expect(targets.filter((row) => row.role === 'THUG').reduce((sum, row) => sum + row.count, 0)).toBe(5);
    expect(targets.filter((row) => row.role === 'WORKER').reduce((sum, row) => sum + row.count, 0)).toBe(2);
  });

  it('keeps counts the game does not tie to a business or corner, without a ref', () => {
    const targets = crewTargets({ ...none, thugs: 10, businessThugs: 4, postedThugs: 3 }, { ...noRefs, businesses: [{ id: 'b1', role: 'THUG', staff: 1 }], turf: [] });
    expect(targets.filter((row) => row.assignmentKind === 'BUSINESS')).toEqual([
      expect.objectContaining({ assignmentRef: 'b1', count: 1 }),
      expect.objectContaining({ assignmentRef: null, count: 3 }),
    ]);
    expect(targets.find((row) => row.assignmentKind === 'TURF')).toMatchObject({ assignmentRef: null, count: 3 });
  });
});

describe('1.7.0-A roster migration', () => {
  const counts: CrewCounts = { thugs: 30, woundedThugs: 2, busyThugs: 3, postedThugs: 4, businessThugs: 5, dealerThugs: 3, whores: 25, businessWhores: 6 };
  const refs: CrewRefs = {
    dealers: [
      { staffId: 'staff-a', crewId: 'crew-1', experiencePoints: 4_500 },
      { staffId: 'staff-b', crewId: 'crew-1', experiencePoints: 900 },
      { staffId: 'staff-c', crewId: 'crew-2', experiencePoints: 0 },
    ],
    releasedCareers: [{ staffId: 'staff-r1', experiencePoints: 1_300 }, { staffId: 'staff-r2', experiencePoints: 50 }],
    businesses: [{ id: 'biz-1', role: 'THUG', staff: 5 }, { id: 'club-1', role: 'WORKER', staff: 6 }],
    turf: [{ id: 'turf-1', thugs: 4 }],
  };

  it('builds one member per counted thug and worker, in their places', () => {
    const roster = new Roster();
    const plan = roster.sync(counts, refs);
    roster.expectInStep(counts, refs);
    expect(plan.moves).toEqual([]);
    expect(new Set(plan.creates.map((row) => row.serial)).size).toBe(plan.creates.length);
    // The migration audit covers the first build: no history line per member.
    expect(plan.events).toEqual([]);
  });

  it('keeps 1.6 dealer careers under their own ids with their experience', () => {
    const roster = new Roster();
    roster.sync(counts, refs);
    for (const career of refs.dealers) {
      expect(roster.members.get(career.staffId)).toMatchObject({
        dealerStaffId: career.staffId, experiencePoints: career.experiencePoints, status: 'ASSIGNED', assignmentKind: 'DEALER', assignmentRef: career.crewId,
      });
    }
    // Released careers went back to the thugs at home, the most experienced first.
    expect(roster.members.get('staff-r1')).toMatchObject({ status: 'AVAILABLE', experiencePoints: 1_300, dealerStaffId: 'staff-r1' });
    expect(roster.members.get('staff-r2')).toMatchObject({ status: 'AVAILABLE', experiencePoints: 50 });
  });

  it('keeps released careers beyond the crew as released members, without counting them', () => {
    const roster = new Roster();
    const small: CrewCounts = { ...none, thugs: 1, dealerThugs: 1 };
    roster.sync(small, { ...noRefs, dealers: [refs.dealers[0]!], releasedCareers: refs.releasedCareers });
    roster.expectInStep(small, { ...noRefs, dealers: [refs.dealers[0]!] });
    expect(roster.members.get('staff-r1')).toMatchObject({ status: 'RELEASED', experiencePoints: 1_300 });
    expect(roster.members.get('staff-r2')).toMatchObject({ status: 'RELEASED', experiencePoints: 50 });
  });

  it('creates nobody when run again', () => {
    const roster = new Roster();
    roster.sync(counts, refs);
    const size = roster.members.size;
    const again = roster.sync(counts, refs);
    expect(again).toEqual({ creates: [], moves: [], drops: [], links: [], events: [] });
    expect(roster.members.size).toBe(size);
  });

  it('builds an empty roster for an empty crew', () => {
    const roster = new Roster();
    expect(roster.sync(none).creates).toEqual([]);
    roster.expectInStep(none);
  });
});

describe('1.7.0-A roster upkeep', () => {
  it('lets the newest, least experienced members go when the crew shrinks', () => {
    const roster = new Roster();
    roster.sync({ ...none, thugs: 5 });
    const [veteran] = roster.active('THUG').sort((a, b) => a.serial - b.serial);
    veteran!.experiencePoints = 500;
    const plan = roster.sync({ ...none, thugs: 2 });
    // They had nothing earned, so they are deleted rather than kept as released.
    expect(plan.drops).toHaveLength(3);
    expect(plan.events).toEqual([]);
    expect(roster.active('THUG').map((row) => row.serial).sort()).toEqual([1, 2]);
    expect(roster.members.size).toBe(2);
    roster.expectInStep({ ...none, thugs: 2 });
    // A member with experience who leaves is kept, released, with a history line.
    roster.members.get(roster.active('THUG').find((row) => row.serial === 1)!.id)!.experiencePoints = 0;
    roster.members.get(roster.active('THUG').find((row) => row.serial === 2)!.id)!.experiencePoints = 40;
    const second = roster.sync({ ...none, thugs: 0 });
    expect(second.drops).toHaveLength(1);
    expect(second.events).toEqual([expect.objectContaining({ kind: 'RELEASED' })]);
    expect([...roster.members.values()]).toEqual([expect.objectContaining({ serial: 2, status: 'RELEASED', experiencePoints: 40 })]);
    roster.expectInStep(none);
  });

  it('moves the same people between places: wounded heal, staff go to work and come home', () => {
    const roster = new Roster();
    roster.sync({ ...none, thugs: 10, whores: 4 });
    const ids = new Set(roster.members.keys());
    const steps: Array<[CrewCounts, CrewRefs]> = [
      [{ ...none, thugs: 10, woundedThugs: 3, whores: 4 }, noRefs],
      [{ ...none, thugs: 10, woundedThugs: 1, businessThugs: 2, whores: 4, businessWhores: 4 }, { ...noRefs, businesses: [{ id: 'b', role: 'THUG', staff: 2 }, { id: 'c', role: 'WORKER', staff: 4 }] }],
      [{ ...none, thugs: 10, postedThugs: 6, busyThugs: 2, whores: 4 }, { ...noRefs, turf: [{ id: 't', thugs: 6 }] }],
      [{ ...none, thugs: 10, whores: 4 }, noRefs],
    ];
    for (const [counts, refs] of steps) {
      const plan = roster.sync(counts, refs);
      expect(plan.creates).toEqual([]);
      expect(plan.drops).toEqual([]);
      expect(plan.events.some((event) => event.kind === 'RELEASED')).toBe(false);
      roster.expectInStep(counts, refs);
    }
    expect(new Set(roster.members.keys())).toEqual(ids);
    const history = roster.sync({ ...none, thugs: 10, businessThugs: 1, whores: 4 }, { ...noRefs, businesses: [{ id: 'b', role: 'THUG', staff: 1 }] });
    expect(history.events).toEqual([expect.objectContaining({ kind: 'ASSIGNED', assignmentKind: 'BUSINESS', assignmentRef: 'b' })]);
  });

  it('gives a new dealer career to a thug from home, and keeps it with him through release and rehire', () => {
    const roster = new Roster();
    roster.sync({ ...none, thugs: 6 });
    // 1.6 assign: a fit thug becomes a dealer; the count of thugs does not move.
    const hired = roster.sync({ ...none, thugs: 6, dealerThugs: 1 }, { ...noRefs, dealers: [{ staffId: 'new-career', crewId: 'crew', experiencePoints: 0 }] });
    expect(hired.creates).toEqual([]);
    const dealer = [...roster.members.values()].find((row) => row.dealerStaffId === 'new-career')!;
    expect(dealer).toMatchObject({ status: 'ASSIGNED', assignmentKind: 'DEALER', assignmentRef: 'crew' });

    // He sells and earns: the member's experience follows the career's.
    roster.sync({ ...none, thugs: 6, dealerThugs: 1 }, { ...noRefs, dealers: [{ staffId: 'new-career', crewId: 'crew', experiencePoints: 1_100 }] });
    expect(roster.members.get(dealer.id)!.experiencePoints).toBe(1_100);

    // Released: back home with his experience.
    roster.sync({ ...none, thugs: 6 });
    expect(roster.members.get(dealer.id)).toMatchObject({ status: 'AVAILABLE', experiencePoints: 1_100, dealerStaffId: 'new-career' });

    // He is lost in a fight while the crew shrinks: kept as released, career intact.
    roster.members.get(dealer.id)!.experiencePoints = 0; // as if the newest recruit: released first
    roster.sync({ ...none, thugs: 5 });
    expect(roster.members.get(dealer.id)!.status).toBe('RELEASED');
    roster.members.get(dealer.id)!.experiencePoints = 1_100;

    // Rehired by career: the same member comes back.
    const rehired = roster.sync({ ...none, thugs: 5, dealerThugs: 1 }, { ...noRefs, dealers: [{ staffId: 'new-career', crewId: 'crew-2', experiencePoints: 1_100 }] });
    expect(roster.members.get(dealer.id)).toMatchObject({ status: 'ASSIGNED', assignmentKind: 'DEALER', assignmentRef: 'crew-2', experiencePoints: 1_100 });
    expect(rehired.events).toContainEqual(expect.objectContaining({ memberId: dealer.id, kind: 'REHIRED' }));
    roster.expectInStep({ ...none, thugs: 5, dealerThugs: 1 }, { ...noRefs, dealers: [{ staffId: 'new-career', crewId: 'crew-2', experiencePoints: 1_100 }] });
  });

  it('stays in step through a long run of random count changes, loading only what moves', () => {
    let seed = 17;
    const rand = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % (max + 1);
    };
    const roster = new Roster();
    let careers = 0;
    for (let step = 0; step < 300; step += 1) {
      const thugs = rand(40);
      const dealerThugs = Math.min(thugs, rand(4));
      const businessThugs = Math.min(thugs - dealerThugs, rand(5));
      const postedThugs = Math.min(thugs - dealerThugs - businessThugs, rand(6));
      const busyThugs = Math.min(thugs - dealerThugs - businessThugs - postedThugs, rand(3));
      const woundedThugs = Math.min(thugs - dealerThugs - businessThugs - postedThugs - busyThugs, rand(5));
      const whores = rand(30);
      const businessWhores = Math.min(whores, rand(8));
      if (rand(3) === 0) careers += 1;
      const counts: CrewCounts = { thugs, woundedThugs, busyThugs, postedThugs, businessThugs, dealerThugs, whores, businessWhores };
      const refs: CrewRefs = {
        dealers: Array.from({ length: dealerThugs }, (_, index) => ({ staffId: `career-${(careers + index) % 7}`, crewId: `crew-${index % 2}`, experiencePoints: step * 3 })),
        businesses: [{ id: 'biz', role: 'THUG', staff: rand(businessThugs) }, { id: 'club', role: 'WORKER', staff: businessWhores }],
        turf: [{ id: 'corner', thugs: rand(postedThugs) }],
      };
      // Some members earn a little along the way, so leaving keeps some and deletes others.
      const earners = roster.active().filter((row) => !row.dealerStaffId);
      if (earners.length && rand(2) === 0) earners[rand(earners.length - 1)]!.experiencePoints += 1 + rand(9);
      roster.sync(counts, refs, true);
      roster.expectInStep(counts, refs, true);
      roster.expectInStep(counts, refs);
      const carried = [...roster.members.values()].map((row) => row.dealerStaffId).filter(Boolean);
      expect(new Set(carried).size).toBe(carried.length);
      // Released members are only ever those with something to come back to.
      for (const row of roster.members.values()) if (row.status === 'RELEASED') expect(row.experiencePoints > 0 || row.dealerStaffId).toBeTruthy();
    }
    expect([...roster.members.values()].some((row) => row.status === 'RELEASED')).toBe(true);
  });
});
