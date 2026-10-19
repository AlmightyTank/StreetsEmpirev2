import { describe, expect, it } from 'vitest';
import { careerStoryChoiceSchema, careerStorySourceClaimSchema } from './career-storylines.js';

describe('career story schemas', () => {
  it('rejects unknown choice and source fields', () => {
    expect(careerStoryChoiceSchema.safeParse({ chapterKey: 'a', branchKey: 'b', accountId: 'private' }).success).toBe(false);
    expect(careerStorySourceClaimSchema.safeParse({ sourceKind: 'COMBAT', sourceId: 'x', objectiveKey: 'o', settledAt: new Date(), payload: { rival: 'hidden' } }).success).toBe(false);
  });

  it('requires non-empty branch and source identifiers', () => {
    expect(careerStoryChoiceSchema.safeParse({ chapterKey: '', branchKey: 'b' }).success).toBe(false);
    expect(careerStorySourceClaimSchema.safeParse({ sourceKind: 'COMBAT', sourceId: '', objectiveKey: 'o', settledAt: new Date() }).success).toBe(false);
  });
});
