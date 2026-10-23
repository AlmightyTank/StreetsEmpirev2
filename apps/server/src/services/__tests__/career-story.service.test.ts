import { describe, expect, it } from 'vitest';
import { careerStoryChoiceEligibility, careerStoryEligibility } from '../career-story.service.js';

describe('career story eligibility', () => {
  const base = { owner: true, roundStatus: 'ACTIVE', pausedAt: null, endsAt: new Date('2030-01-02'), now: new Date('2030-01-01') };
  it.each([
    ['foreign player', { owner: false }, 'FOREIGN_PLAYER'],
    ['ended round', { roundStatus: 'ENDED' }, 'ROUND_ENDED'],
    ['paused round', { pausedAt: new Date('2030-01-01') }, 'ROUND_PAUSED'],
    ['expired story', { instanceStatus: 'EXPIRED' }, 'STORY_ARCHIVED'],
  ])('rejects %s without mutation', (_label, patch, code) => expect(careerStoryEligibility({ ...base, ...patch })).toEqual({ ok: false, code }));
  it('allows an owned active story', () => expect(careerStoryEligibility(base)).toEqual({ ok: true }));
  it('rejects a story past its round-pinned deadline', () => expect(careerStoryEligibility({ ...base, expiresAt: new Date('2029-12-31') })).toEqual({ ok: false, code: 'STORY_EXPIRED' }));
  it.each([
    [{ chapterExists: false, branchExists: true, chapterCompleted: true, alreadyChosen: false }, 'CAREER_STORY_BRANCH_INVALID'],
    [{ chapterExists: true, branchExists: true, chapterCompleted: false, alreadyChosen: false }, 'CAREER_STORY_CHAPTER_INCOMPLETE'],
    [{ chapterExists: true, branchExists: true, chapterCompleted: true, alreadyChosen: true }, 'CAREER_STORY_CHOICE_REPLAY'],
  ])('rejects invalid choice state', (input, code) => expect(careerStoryChoiceEligibility(input)).toEqual({ ok: false, code }));
});
