import { describe, expect, it } from 'vitest';
import { awayThugGroups, thugsPostedOn, whereaboutsLabel, type CrewWhereaboutsMember } from './crewWhereabouts.js';

function thug(partial: Partial<CrewWhereaboutsMember> & Pick<CrewWhereaboutsMember, 'id' | 'status'>): CrewWhereaboutsMember {
  return { role: 'THUG', assignment: null, ...partial };
}

describe('crew whereabouts', () => {
  it('keeps a thug at home out of the away list', () => {
    expect(whereaboutsLabel(thug({ id: 'home', status: 'AVAILABLE' }))).toBeNull();
  });

  it('marks a hurt thug away even when a job is still attached', () => {
    const hurt = thug({
      id: 'hurt',
      status: 'RECOVERING',
      assignment: { kind: 'TURF', ref: 'les', label: 'Lower East Side Walkups · New York City' },
    });
    expect(whereaboutsLabel(hurt)).toBe('Away, hurt');
    expect(awayThugGroups([hurt]).map((group) => group.place)).toEqual(['Away, hurt']);
  });

  it('records the corner a posted thug left for', () => {
    const posted = thug({
      id: 'duke',
      status: 'ASSIGNED',
      assignment: { kind: 'TURF', ref: 'block-les', label: 'Lower East Side Walkups · New York City' },
    });
    expect(whereaboutsLabel(posted)).toBe('Lower East Side Walkups · New York City');
    expect(thugsPostedOn([posted], 'block-les').map((member) => member.id)).toEqual(['duke']);
    expect(thugsPostedOn([posted], 'block-meat')).toEqual([]);
  });

  it('groups everyone who left by the place they are at', () => {
    const groups = awayThugGroups([
      thug({ id: 'home', status: 'AVAILABLE' }),
      thug({ id: 'a', status: 'ASSIGNED', assignment: { kind: 'TURF', ref: 'les', label: 'Lower East Side Walkups · New York City' } }),
      thug({ id: 'b', status: 'ASSIGNED', assignment: { kind: 'TURF', ref: 'les', label: 'Lower East Side Walkups · New York City' } }),
      thug({ id: 'c', status: 'ASSIGNED', assignment: { kind: 'TURF', ref: null, label: '' } }),
      thug({ id: 'd', status: 'IN_TRANSIT' }),
      thug({ id: 'worker', role: 'WORKER', status: 'ASSIGNED', assignment: { kind: 'BUSINESS', ref: 'shop', label: 'Pawn shop' } }),
    ]);
    expect(groups.map((group) => [group.place, group.members.map((member) => member.id)])).toEqual([
      ['Lower East Side Walkups · New York City', ['a', 'b']],
      ['Away on a run', ['d']],
      ['Away, place not recorded', ['c']],
    ]);
  });
});
