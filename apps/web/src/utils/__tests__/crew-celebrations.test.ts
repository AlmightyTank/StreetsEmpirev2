import { describe, expect, it } from 'vitest';
import type { CrewMemberDto, CrewMentorBondDto } from '@streets/shared';
import { crewProgressSnapshot, nextCrewCelebration } from '../crew-celebrations.js';

function member(id: string, points: number, nicknames: string[] = [], enabled = true): CrewMemberDto {
  return {
    id, name: `Crew ${id}`, loyalty: {
      enabled, points,
      tier: points >= 100 ? 'Legend' : points >= 75 ? 'Veteran' : points >= 50 ? 'Trusted' : points >= 25 ? 'Proven' : 'New Face',
      nextMilestone: null, history: [],
    },
    legend: { moderated: false, nickname: null, options: nicknames.map((key) => ({ key, label: `Title ${key}`, proof: 'Verified work' })) },
  } as CrewMemberDto;
}
function bond(lessons: number, endedAt: string | null = null): CrewMentorBondDto {
  return {
    id: 'bond-1', mentorId: 'a', apprenticeId: 'b', mentorName: 'Mentor', apprenticeName: 'Apprentice',
    lessons, maxLessons: 5, milestone: lessons >= 5 ? 'Trusted Partners' : lessons >= 3 ? 'Finding Their Rhythm' : 'First Lesson',
    startedAt: '2026-10-17T00:00:00.000Z', endedAt, memories: [],
  };
}
function changed(
  before: CrewMemberDto[], after: CrewMemberDto[], prevBonds: CrewMentorBondDto[] = [], nextBonds: CrewMentorBondDto[] = [],
) {
  return nextCrewCelebration(
    crewProgressSnapshot(before, prevBonds),
    crewProgressSnapshot(after, nextBonds),
    after, nextBonds,
  );
}
describe('2.1.0-F earned crew milestone celebrations', () => {
  it('uses server-earned loyalty thresholds, not assignments or paid training', () => {
    const toast = changed([member('a', 24)], [member('a', 25)]);
    expect(toast).toMatchObject({ key: 'member:a:loyalty:25', memberId: 'a' });
    expect(toast?.message).toContain('25 verified loyalty');
    expect(changed([member('a', 25)], [member('a', 25)])).toBeNull();
    expect(changed([member('a', 24, [], false)], [member('a', 25, [], false)])).toBeNull();
  });
  it('celebrates the highest threshold after a large authenticated refresh', () => {
    expect(changed([member('a', 20)], [member('a', 82)])?.key).toBe('member:a:loyalty:75');
    expect(changed([member('a', 74)], [member('a', 100)])?.key).toBe('member:a:loyalty:100');
  });
  it('recognizes newly earned catalog nicknames without replaying old titles', () => {
    expect(changed([member('a', 10)], [member('a', 10, ['ROAD_VETERAN'])])?.message).toContain('Title ROAD_VETERAN');
    expect(changed([member('a', 10, ['ROAD_VETERAN'])], [member('a', 10, ['ROAD_VETERAN'])])).toBeNull();
    const moderated = member('a', 10, ['ROAD_VETERAN']);
    moderated.legend!.moderated = true;
    expect(changed([member('a', 10)], [moderated])).toBeNull();
  });
  it('recognizes true shared-memory bond milestones, never created or ended bonds', () => {
    expect(changed([], [], [bond(0)], [bond(1)])?.key).toBe('bond:bond-1:lessons:1');
    expect(changed([], [], [bond(2)], [bond(3)])?.key).toBe('bond:bond-1:lessons:3');
    expect(changed([], [], [bond(4)], [bond(5)])?.key).toBe('bond:bond-1:lessons:5');
    expect(changed([], [], [], [bond(5)])).toBeNull();
    expect(changed([], [], [bond(2)], [bond(3, '2026-10-18T00:00:00Z')])).toBeNull();
  });
  it('ignores unknown members on filtered or newly paged roster snapshots', () => {
    expect(changed([member('a', 24)], [member('b', 100)])).toBeNull();
    expect(changed([], [member('a', 100)])).toBeNull();
    expect(changed([member('a', 50)], [member('a', 49)])).toBeNull();
  });
  it('returns a single celebration even if several authentic milestones land together', () => {
    const result = changed([member('a', 24), member('b', 49)], [member('a', 25), member('b', 50)], [bond(2)], [bond(3)]);
    expect(result?.key).toBe('member:a:loyalty:25');
  });
});