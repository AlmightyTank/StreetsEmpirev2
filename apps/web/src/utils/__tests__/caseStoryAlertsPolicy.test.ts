import { describe, expect, it } from 'vitest';
import type { CriminalCaseFileDto } from '@streets/shared';
import { caseStorySignals } from '../caseStoryAlertsPolicy.js';
const file = (status: CriminalCaseFileDto['status'], clues: number): CriminalCaseFileDto =>
  ({ id: 'case-1', status, cluesFound: clues, cluesRequired: 3 } as CriminalCaseFileDto);
describe('New story popup policy', () => {
  it('never replays on hydration (no comparison) and ignores archived offers', () => {
    expect(caseStorySignals(new Map(), [file('CLOSED', 3)])).toEqual([]);
    expect(caseStorySignals(new Map(), [file('AVAILABLE', 0)]).toMatchObject([{ kind: 'offer' }]);
  });
  it('reports new evidence and solved cases without repeating unchanged rows', () => {
    expect(caseStorySignals(new Map([['case-1', file('ACTIVE', 1)]]), [file('ACTIVE', 2)])).toMatchObject([{ kind: 'clue' }]);
    expect(caseStorySignals(new Map([['case-1', file('ACTIVE', 2)]]), [file('SOLVED', 3)])).toMatchObject([{ kind: 'solved' }]);
    expect(caseStorySignals(new Map([['case-1', file('SOLVED', 3)]]), [file('SOLVED', 3)])).toEqual([]);
  });
});
