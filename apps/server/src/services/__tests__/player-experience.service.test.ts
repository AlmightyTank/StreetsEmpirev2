import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../../utils/db.js';
import { PlayerExperienceService } from '../player-experience.service.js';

describe('PlayerExperienceService.recentEvents', () => {
  it('returns recent awards in display shape and clamps the requested page size', async () => {
    const awardedAt = new Date('2026-10-04T12:30:00.000Z');
    const findMany = vi.fn().mockResolvedValue([
      { id: 'xp-event-1', source: 'Quest completion', amount: 100, awardedAt },
    ]);
    const db = {
      playerExperienceEvent: { findMany },
    } as unknown as Db;

    const events = await PlayerExperienceService.recentEvents(db, 'account-1', 500);

    expect(findMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
      orderBy: [{ awardedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true, source: true, amount: true, awardedAt: true },
    });
    expect(events).toEqual([{
      id: 'xp-event-1',
      source: 'Quest completion',
      amount: 100,
      awardedAt: '2026-10-04T12:30:00.000Z',
    }]);
  });
});
