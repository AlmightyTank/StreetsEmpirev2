import type { CriminalCaseFileDto } from '@streets/shared';

export type CaseStorySignalKind = 'offer' | 'clue' | 'solved';
export interface CaseStorySignal { kind: CaseStorySignalKind; file: CriminalCaseFileDto; }
export function caseStorySignals(
  before: ReadonlyMap<string, CriminalCaseFileDto>, after: readonly CriminalCaseFileDto[],
): CaseStorySignal[] {
  const signals: CaseStorySignal[] = [];
  for (const file of after) {
    const previous = before.get(file.id);
    if (!previous) {
      if (file.status === 'AVAILABLE' || file.status === 'ACTIVE') signals.push({ kind: 'offer', file });
    } else if (file.status === 'SOLVED' && previous.status !== 'SOLVED' && previous.status !== 'CLOSED') {
      signals.push({ kind: 'solved', file });
    } else if (file.status === 'ACTIVE' && file.cluesFound > previous.cluesFound) {
      signals.push({ kind: 'clue', file });
    }
  }
  return signals;
}
