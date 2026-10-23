import { describe, expect, it } from 'vitest';
import { CAREER_STORY_CATALOG } from '../career-story-catalog.service.js';
import { careerStoryBranchBudget, careerStoryBranchesAreEquivalent } from '../career-story-balance.service.js';

describe('career story branch economy', () => {
  it.each(CAREER_STORY_CATALOG)('%s has equivalent fresh/mid/late branch budgets', (arc) => {
    expect(careerStoryBranchesAreEquivalent(arc)).toBe(true);
    expect(careerStoryBranchBudget(arc).every((budget) => budget.competitiveCents === 0 && budget.permanentPower === 0)).toBe(true);
  });
});
