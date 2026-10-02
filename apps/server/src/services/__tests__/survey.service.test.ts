import { describe, expect, it } from 'vitest';
import { surveyAvailableNow } from '../survey.service.js';

const now = new Date('2026-10-01T20:00:00.000Z');

function survey(overrides: Partial<{
  status: 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'CLOSED';
  startsAt: Date | null;
  endsAt: Date | null;
  roundId: string | null;
}> = {}) {
  return {
    status: 'LIVE' as const,
    startsAt: null,
    endsAt: null,
    roundId: null,
    ...overrides,
  };
}

describe('Survey Phase B eligibility', () => {
  it('shows a live global survey inside its window', () => {
    expect(surveyAvailableNow(survey(), 'round-a', now)).toBe(true);
    expect(surveyAvailableNow(survey({ startsAt: new Date('2026-10-01T19:00:00Z') }), 'round-a', now)).toBe(true);
  });

  it('hides drafts, scheduled surveys and closed surveys', () => {
    expect(surveyAvailableNow(survey({ status: 'DRAFT' }), 'round-a', now)).toBe(false);
    expect(surveyAvailableNow(survey({ status: 'SCHEDULED' }), 'round-a', now)).toBe(false);
    expect(surveyAvailableNow(survey({ status: 'CLOSED' }), 'round-a', now)).toBe(false);
  });

  it('hides future and expired windows', () => {
    expect(surveyAvailableNow(survey({ startsAt: new Date('2026-10-01T21:00:00Z') }), 'round-a', now)).toBe(false);
    expect(surveyAvailableNow(survey({ endsAt: now }), 'round-a', now)).toBe(false);
    expect(surveyAvailableNow(survey({ endsAt: new Date('2026-10-01T19:59:59Z') }), 'round-a', now)).toBe(false);
  });

  it('shows a round survey only in its own round', () => {
    expect(surveyAvailableNow(survey({ roundId: 'round-a' }), 'round-a', now)).toBe(true);
    expect(surveyAvailableNow(survey({ roundId: 'round-b' }), 'round-a', now)).toBe(false);
  });
});
