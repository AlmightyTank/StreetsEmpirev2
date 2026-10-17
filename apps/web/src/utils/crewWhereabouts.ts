import type { CrewMemberDto } from '@streets/shared';

/** Enough of a roster row to say whether a thug is home and, if not, where they went. */
export interface CrewWhereaboutsMember {
  id: string;
  role: 'THUG' | 'WORKER';
  status: CrewMemberDto['status'];
  assignment: { kind: string; ref: string | null; label: string } | null;
}

const CORNER_KINDS = new Set(['TURF', 'CORNER_ENFORCER', 'CORNER_LOOKOUT', 'STASH_GUARD']);

/** Where an away thug is. Home and released members have no whereabouts. */
export function whereaboutsLabel(member: CrewWhereaboutsMember): string | null {
  if (member.role !== 'THUG' || member.status === 'AVAILABLE' || member.status === 'RELEASED') return null;
  if (member.assignment?.label) return member.assignment.label;
  if (member.status === 'IN_TRANSIT') return 'Away on a run';
  if (member.status === 'RECOVERING') return 'Recovering';
  return 'Away, place not recorded';
}

export function awayThugGroups<T extends CrewWhereaboutsMember>(members: readonly T[]): Array<{ place: string; members: T[] }> {
  const groups = new Map<string, T[]>();
  for (const member of members) {
    const place = whereaboutsLabel(member);
    if (!place) continue;
    const bucket = groups.get(place) ?? [];
    bucket.push(member);
    groups.set(place, bucket);
  }
  return [...groups.entries()]
    .map(([place, people]) => ({ place, members: people }))
    .sort((a, b) => b.members.length - a.members.length || a.place.localeCompare(b.place));
}

/** Named thugs the roster has on this corner, including lookouts and stash guards. */
export function thugsPostedOn<T extends CrewWhereaboutsMember>(members: readonly T[], blockId: string): T[] {
  return members.filter((member) => member.role === 'THUG' && member.assignment?.ref === blockId && CORNER_KINDS.has(member.assignment.kind));
}
