import { describe, expect, it } from 'vitest';
import type { CriminalCaseFileDto } from '@streets/shared';
import { caseFileHref, caseProgress, caseTimeline, nextCaseLead } from '../caseFiles.js';

const sample: CriminalCaseFileDto = {
  id: 'case 42', cityId: 'detroit', caseKey: 'CASE_MISSING_LEDGER',
  storyKey: 'STORY_MISSING_LEDGER', title: 'Missing Ledger', status: 'ACTIVE',
  clues: [
    { key: 'a', label: 'Scout', sourceKind: 'SCOUT', found: true, observedAt: '2026-10-16T10:00:00Z', hint: 'Scout' },
    { key: 'b', label: 'Contact', sourceKind: 'CONTACT', found: false, observedAt: null, hint: 'Contact' },
  ],
  cluesFound: 1, cluesRequired: 2, confidence: 'likely', nextClueKey: 'b',
  nextAction: 'CONTACT', choices: [], chosenBranch: null, choiceDetails: [],
  outcome: null, rewardCents: 0, rewardClaimedAt: null,
  createdAt: '2026-10-16T08:00:00Z', acceptedAt: '2026-10-16T09:00:00Z',
  solvedAt: null, closedAt: null, expiresAtActive: '2026-10-17T12:00:00Z',
};
describe('Criminal Case Files UI navigation', () => {
  it('uses safely encoded deep links and stable source timelines', () => {
    expect(caseFileHref('case 42')).toBe('/game/black-book?tab=cases&focus=case%2042#case-case%2042');
    expect(caseProgress(sample)).toBe(50);
    expect(caseTimeline(sample).map((item) => item.key)).toEqual(['opened', 'accepted', 'clue:a']);
  });
  it('prefers a case awaiting a decision over an in-progress or fresh lead', () => {
    expect(nextCaseLead([sample, { ...sample, status: 'SOLVED', id: 'done' }])?.id).toBe('done');
    expect(nextCaseLead([{ ...sample, status: 'CLOSED' }])).toBeNull();
  });
});
