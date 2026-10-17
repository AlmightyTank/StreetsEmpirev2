import type { CrewMemberDto, CrewMentorBondDto } from '@streets/shared';

export const CREW_LOYALTY_MILESTONES = [25, 50, 75, 100] as const;
export const CREW_BOND_MILESTONES = [1, 3, 5] as const;

export interface CrewProgressSnapshot {
  loyalty: number;
  earnedNames: readonly string[];
  bondLessons: number;
}
export interface CrewCelebration {
  key: string;
  heading: string;
  message: string;
  memberId: string | null;
}

/** Fixed per-member keys. No client-produced rewards or random events. */
export function crewProgressSnapshot(
  members: readonly CrewMemberDto[],
  bonds: readonly CrewMentorBondDto[],
): Map<string, CrewProgressSnapshot> {
  const result = new Map<string, CrewProgressSnapshot>();
  for (const member of members) {
    result.set(`member:${member.id}`, {
      loyalty: member.loyalty.enabled ? member.loyalty.points : 0,
      earnedNames: member.legend?.moderated ? [] : (member.legend?.options ?? []).map((item) => item.key),
      bondLessons: 0,
    });
  }
  for (const bond of bonds) {
    if (bond.endedAt) continue;
    result.set(`bond:${bond.id}`, {
      loyalty: 0,
      earnedNames: [],
      bondLessons: bond.lessons,
    });
  }
  return result;
}

/** Only transitions within a mounted roster qualify. Initial loads, returning
 * after navigation, filtered-out members, source retries, and paid training
 * cannot retroactively produce a new celebration. At most ONE event per read.
 */
export function nextCrewCelebration(
  previous: ReadonlyMap<string, CrewProgressSnapshot>,
  current: ReadonlyMap<string, CrewProgressSnapshot>,
  members: readonly CrewMemberDto[],
  bonds: readonly CrewMentorBondDto[],
): CrewCelebration | null {
  for (const member of members) {
    const key = `member:${member.id}`;
    const before = previous.get(key);
    const after = current.get(key);
    if (!before || !after || !member.loyalty.enabled) continue;
    const threshold = [...CREW_LOYALTY_MILESTONES].reverse().find((value) => before.loyalty < value && after.loyalty >= value);
    if (threshold !== undefined) return {
      key: `${key}:loyalty:${threshold}`,
      heading: `${member.name} earned ${member.loyalty.tier}`,
      message: `${threshold} verified loyalty points reached. The crew remembers actual completed work.`,
      memberId: member.id,
    };
    const awarded = after.earnedNames.find((name) => !before.earnedNames.includes(name));
    if (awarded) {
      const title = member.legend?.options.find((name) => name.key === awarded)?.label;
      if (title) return {
        key: `${key}:nickname:${awarded}`,
        heading: `${member.name} earned a nickname`,
        message: `${title} — unlocked through proven crew accomplishments.`,
        memberId: member.id,
      };
    }
  }
  for (const bond of bonds) {
    if (bond.endedAt) continue;
    const key = `bond:${bond.id}`;
    const before = previous.get(key);
    const after = current.get(key);
    if (!before || !after) continue;
    const threshold = CREW_BOND_MILESTONES.find((value) => before.bondLessons < value && after.bondLessons >= value);
    if (threshold !== undefined) return {
      key: `${key}:lessons:${threshold}`,
      heading: 'A crew bond grew stronger',
      message: `${bond.mentorName} and ${bond.apprenticeName}: ${bond.milestone} — ${threshold} verified shared memories.`,
      memberId: bond.apprenticeId,
    };
  }
  return null;
}
