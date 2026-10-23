import type { CriminalCaseFileDto } from '@streets/shared';

export type CaseAction = NonNullable<CriminalCaseFileDto['nextAction']>;
export const CASE_ACTION_LINKS: Record<CaseAction, { to: string; label: string; detail: string }> = {
  SCOUT: { to: '/game/scout', label: 'Scout streets', detail: 'Complete a scouting action for the next lead' },
  CONTACT: { to: '/game/combat#intel', label: 'Find intelligence', detail: 'Purchase an informant tip or complete combat reconnaissance' },
  TRAVEL: { to: '/game/travel', label: 'Complete a run', detail: 'A returned run may reveal the next piece of evidence' },
  ENCOUNTER: { to: '/game/events', label: 'Explore encounters', detail: 'Resolve an authentic street encounter when one occurs' },
};
export const CASE_STATUS_LABEL: Record<CriminalCaseFileDto['status'], string> = {
  LOCKED: 'Locked', AVAILABLE: 'New lead', ACTIVE: 'Investigating',
  SOLVED: 'Conclusion ready', CLOSED: 'Closed', EXPIRED: 'Trail cold',
};
export function caseFileHref(id: string): string {
  return `/game/black-book?tab=cases&focus=${encodeURIComponent(id)}#case-${encodeURIComponent(id)}`;
}
export function nextCaseLead(cases: CriminalCaseFileDto[]): CriminalCaseFileDto | null {
  return cases.find((file) => file.status === 'SOLVED')
    ?? cases.find((file) => file.status === 'ACTIVE')
    ?? cases.find((file) => file.status === 'AVAILABLE')
    ?? null;
}
export function caseProgress(caseFile: CriminalCaseFileDto): number {
  return caseFile.cluesRequired ? Math.round(100 * caseFile.cluesFound / caseFile.cluesRequired) : 0;
}
export function caseTimeline(caseFile: CriminalCaseFileDto) {
  return [
    { key: 'opened', title: 'Story surfaced', at: caseFile.createdAt, kind: 'EVENT' },
    ...(caseFile.acceptedAt ? [{ key: 'accepted', title: 'Investigation started', at: caseFile.acceptedAt, kind: 'EVENT' }] : []),
    ...caseFile.clues.filter((clue) => clue.found && clue.observedAt).map((clue) =>
      ({ key: `clue:${clue.key}`, title: clue.label, at: clue.observedAt!, kind: 'EVIDENCE' })),
    ...(caseFile.solvedAt ? [{ key: 'solved', title: 'All evidence verified', at: caseFile.solvedAt, kind: 'EVENT' }] : []),
    ...(caseFile.closedAt ? [{ key: 'closed', title: caseFile.outcome?.title ?? 'Case concluded', at: caseFile.closedAt, kind: 'OUTCOME' }] : []),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
