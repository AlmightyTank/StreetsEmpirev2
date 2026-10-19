import { describe, expect, it } from 'vitest';
import { CAREER_STORY_CATALOG, validateCareerStoryCatalog } from '../career-story-catalog.service.js';

describe('career story catalog', () => {
  it('contains three ordered chapters for every career', () => {
    expect(CAREER_STORY_CATALOG).toHaveLength(5);
    for (const arc of CAREER_STORY_CATALOG) {
      expect(arc.chapters).toHaveLength(3);
      expect(arc.chapters.map((chapter) => chapter.order)).toEqual([1, 2, 3]);
    }
  });

  it('rejects missing careers and invalid chapter order', () => {
    expect(() => validateCareerStoryCatalog(CAREER_STORY_CATALOG.slice(1))).toThrow();
    const broken = CAREER_STORY_CATALOG.map((arc) => arc.career === 'ENFORCER' ? { ...arc, chapters: arc.chapters.map((chapter, index) => index === 1 ? { ...chapter, order: 3 } : chapter) } : arc);
    expect(() => validateCareerStoryCatalog(broken)).toThrow();
  });

  it('keeps branch budgets equivalent and cosmetic-only', () => {
    for (const arc of CAREER_STORY_CATALOG) {
      expect(arc.rewardBudget.temporaryGrantCents).toBe(0);
      for (const chapter of arc.chapters) {
        expect(new Set(chapter.branches.map((branch) => branch.reward.kind)).size).toBe(1);
        expect(chapter.branches.map((branch) => branch.reward.key)).not.toContain('permanent-stat');
      }
    }
  });
});
