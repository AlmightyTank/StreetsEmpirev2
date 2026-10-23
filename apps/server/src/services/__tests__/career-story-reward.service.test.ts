import { describe, expect, it, vi } from 'vitest';
import { grantCareerStoryRecognition } from '../career-story-reward.service.js';

describe('career story recognition grants', () => {
  it('uses the existing cosmetic ledger with stable provenance and is idempotent', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const db = { accountCosmeticUnlock: { upsert } } as never;
    const branch = { key: 'steady', title: 'Steady', body: 'Recognition', reward: { kind: 'PROFILE_MOMENT' as const, key: 'moment', label: 'Steady hand' } };
    const ruleset = { meta: { id: 'test', version: '1' } } as never;
    await grantCareerStoryRecognition(db, { accountId: 'a', career: 'ENFORCER', chapterKey: 'enforcer-1', branch, ruleset, sourceId: 'activity:x' });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId_key: { accountId: 'a', key: 'career-story:ENFORCER:moment' } } }));
    expect(upsert.mock.calls[0]?.[0]?.create.sourceQuestKey).toContain('activity:x');
  });
});
