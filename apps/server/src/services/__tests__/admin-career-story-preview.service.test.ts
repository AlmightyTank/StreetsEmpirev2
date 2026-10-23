import { describe, expect, it } from 'vitest';
import { AdminCareerStoryService } from '../admin-career-story.service.js';

describe('career story admin preview', () => {
  it('is explicitly dry-run and has no reward mutation', () => {
    const preview = AdminCareerStoryService.testTrigger({ career: 'ENFORCER', chapterKey: 'enforcer-1', branchKey: 'enforcer-1-steady' });
    expect(preview.dryRun).toBe(true);
    expect(preview.mutation).toBe('NONE');
    expect(preview.rewardGrant).toBe('NONE');
  });
});
