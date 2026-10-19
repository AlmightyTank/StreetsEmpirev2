import { describe, expect, it } from 'vitest';
import { AdminCareerStoryService } from '../admin-career-story.service.js';

describe('admin career story catalog diagnostics', () => {
  it('exposes read-only five-career budget and branch metadata', () => {
    const report = AdminCareerStoryService.catalog();
    expect(report.careers).toHaveLength(5);
    expect(report.careers.every((arc) => arc.chapters.length === 3)).toBe(true);
    expect(report.careers.flatMap((arc) => arc.chapters).flatMap((chapter) => chapter.branches).every((branch) => branch.reward.kind !== 'TEMPORARY_GRANT')).toBe(true);
  });
});
