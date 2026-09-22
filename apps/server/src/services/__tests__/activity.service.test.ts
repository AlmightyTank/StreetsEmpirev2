import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../../utils/db.js';
import { ActivityService } from '../activity.service.js';
import { QuestProgressService } from '../quest-progress.service.js';

describe('ActivityService quest hook', () => {
  it('feeds the committed activity row into quest progress in the same transaction client', async () => {
    const activity = {
      id: 'activity-1',
      roundPlayerId: 'player-1',
      type: 'SCOUT' as const,
      payload: { turns: 5 },
      createdAt: new Date('2026-09-22T03:00:00Z'),
      updatedAt: new Date('2026-09-22T03:00:00Z'),
    };
    const db = {
      playerActivity: {
        create: vi.fn(async () => activity),
      },
    } as unknown as Db;
    const progress = vi.spyOn(QuestProgressService, 'recordActivity').mockResolvedValue({
      considered: 0,
      matched: 0,
      advanced: 0,
      readied: 0,
      reopened: 0,
      expired: 0,
      duplicate: 0,
    });

    const result = await ActivityService.log(db, 'player-1', 'SCOUT', { turns: 5 });

    expect(result).toBe(activity);
    expect(progress).toHaveBeenCalledWith(db, activity);
    vi.restoreAllMocks();
  });
});
