import { describe, expect, it } from 'vitest';
import { assertCrewRosterPlan } from '../crew-roster-identity-audit.js';
import { crewPlaceKey, planCrewRoster, type CrewCounts, type CrewMemberRow, type CrewPlanInput, type CrewRefs } from '../crew-roster-plan.js';

const empty: CrewCounts = {
  thugs: 0, woundedThugs: 0, busyThugs: 0, postedThugs: 0,
  businessThugs: 0, dealerThugs: 0, whores: 0, businessWhores: 0,
};
const refs: CrewRefs = { dealers: [], businesses: [], turf: [] };
const member = (id: string, serial: number, extras: Partial<CrewMemberRow> = {}): CrewMemberRow => ({
  id, serial, role: 'THUG', status: 'AVAILABLE', assignmentKind: null,
  assignmentRef: null, experiencePoints: 0, dealerStaffId: null, ...extras,
});
function input(overrides: Partial<CrewPlanInput> = {}): CrewPlanInput {
  return {
    counts: { ...empty, thugs: 1 }, refs, members: [], nextSerial: 1,
    firstBuild: true, newId: () => 'new-member', ...overrides,
  };
}

describe('2.1.0-A roster identity audit', () => {
  it('accepts a new roster and a second idempotent reconcile', () => {
    const fresh = input({ counts: { ...empty, thugs: 3, whores: 2 }, newId: (() => { let n = 0; return () => `new-${++n}`; })() });
    const first = planCrewRoster(fresh);
    expect(() => assertCrewRosterPlan(fresh, first)).not.toThrow();
    expect(first.creates).toHaveLength(5);
    const settled = input({
      counts: fresh.counts, firstBuild: false, members: first.creates, nextSerial: 6,
      newId: () => 'phantom',
    });
    const second = planCrewRoster(settled);
    expect(second.creates).toEqual([]);
    expect(() => assertCrewRosterPlan(settled, second)).not.toThrow();
  });

  it('preserves untouched slots, wounded crew, lookout duty and travel escorts', () => {
    const lookout = member('lookout', 1, { status: 'ASSIGNED', assignmentKind: 'CORNER_LOOKOUT', assignmentRef: 'block' });
    const recovering = member('recovering', 2, { status: 'RECOVERING', experiencePoints: 30 });
    const away = member('escort', 3, { status: 'ASSIGNED', assignmentKind: 'ESCORT', assignmentRef: 'run' });
    const scenario = input({
      firstBuild: false,
      counts: { ...empty, thugs: 3, woundedThugs: 1, postedThugs: 1 },
      refs: { ...refs, turf: [{ id: 'block', thugs: 1, lookouts: 1 }], escorts: [{ runId: 'run', count: 1 }] },
      members: [lookout, recovering, away], nextSerial: 4,
    });
    const plan = planCrewRoster(scenario);
    expect(plan.creates).toEqual([]);
    expect(() => assertCrewRosterPlan(scenario, plan)).not.toThrow();

    const untouched = input({
      firstBuild: false, counts: { ...empty, thugs: 3 },
      members: [member('movable', 3)], nextSerial: 4,
      placed: new Map([[crewPlaceKey('THUG', { status: 'AVAILABLE', assignmentKind: null, assignmentRef: null }), 2]]),
    });
    expect(() => assertCrewRosterPlan(untouched, planCrewRoster(untouched))).not.toThrow();
  });

  it('does not overwrite an existing dealer career to staff a new one', () => {
    const veteran = member('veteran', 1, { experiencePoints: 120, dealerStaffId: 'old-career' });
    const scenario = input({
      firstBuild: false, nextSerial: 2,
      counts: { ...empty, thugs: 1, dealerThugs: 1 },
      refs: { ...refs, dealers: [{ staffId: 'new-career', crewId: 'crew', experiencePoints: 3 }] },
      members: [veteran], newId: () => 'new-dealer',
    });
    const plan = planCrewRoster(scenario);
    expect(plan.links).toEqual([]);
    expect(plan.moves).toContainEqual(expect.objectContaining({ id: 'veteran', to: null }));
    expect(plan.creates).toContainEqual(expect.objectContaining({ id: 'new-dealer', dealerStaffId: 'new-career' }));
    expect(() => assertCrewRosterPlan(scenario, plan)).not.toThrow();
    expect(() => assertCrewRosterPlan(scenario, { ...plan, links: [{ id: 'veteran', dealerStaffId: 'new-career', experiencePoints: 3 }] }))
      .toThrow(/career overwrite/);
  });

  it('rejects duplicated recruits, phantom counts and deletions of experienced members', () => {
    const scenario = input();
    const plan = planCrewRoster(scenario);
    expect(() => assertCrewRosterPlan(scenario, { ...plan, creates: [...plan.creates, { ...plan.creates[0]!, id: 'ghost', serial: 2 }] }))
      .toThrow(/placement/);
    expect(() => assertCrewRosterPlan(scenario, { ...plan, creates: [...plan.creates, plan.creates[0]!] }))
      .toThrow(/duplicate/);
    const veteran = member('earned', 1, { experiencePoints: 9 });
    const loss = input({ firstBuild: false, counts: empty, members: [veteran], nextSerial: 2 });
    expect(() => assertCrewRosterPlan(loss, { ...planCrewRoster(loss), drops: ['earned'], moves: [] }))
      .toThrow(/erase a career/);
  });

  it('keeps released legacy dealer careers outside active totals', () => {
    const scenario = input({
      counts: empty, refs: { ...refs, releasedCareers: [{ staffId: 'legacy', experiencePoints: 5 }] },
    });
    const plan = planCrewRoster(scenario);
    expect(plan.creates).toEqual([expect.objectContaining({ id: 'legacy', status: 'RELEASED', dealerStaffId: 'legacy' })]);
    expect(() => assertCrewRosterPlan(scenario, plan)).not.toThrow();
  });
});
