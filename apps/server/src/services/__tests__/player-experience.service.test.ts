import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../../utils/db.js';
import { PlayerExperienceService } from '../player-experience.service.js';

function awardDb(inserted: number, totalXp: number) {
  return {
    roundPlayer: { findUnique: vi.fn().mockResolvedValue({ accountId: 'account-1' }) },
    playerExperienceEvent: { createMany: vi.fn().mockResolvedValue({ count: inserted }) },
    account: {
      findUnique: vi.fn().mockResolvedValue({ experiencePoints: totalXp }),
      update: vi.fn().mockResolvedValue({ experiencePoints: totalXp }),
    },
    accountCosmeticUnlock: { upsert: vi.fn().mockResolvedValue({}) },
  };
}

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

describe('PlayerExperienceService.award', () => {
  const input = {
    roundPlayerId: 'player-1',
    sourceKey: 'quest:1',
    source: 'QUEST_STORY',
    amount: 100,
  };

  it('stores the base amount on a weekday', async () => {
    const db = awardDb(1, 100);
    const result = await PlayerExperienceService.award(db as unknown as Db, {
      ...input,
      awardedAt: new Date('2026-10-14T15:00:00.000Z'),
    });

    expect(db.playerExperienceEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ amount: 100, source: 'QUEST_STORY' })],
    }));
    expect(result).toMatchObject({ awardedXp: 100, totalXp: 100, level: 2, unlocked: [] });
  });

  it('doubles the stored award on Saturday and Sunday UTC', async () => {
    const db = awardDb(1, 200);
    const result = await PlayerExperienceService.award(db as unknown as Db, {
      ...input,
      awardedAt: new Date('2026-10-18T18:00:00.000Z'),
    });

    expect(db.playerExperienceEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ amount: 200 })],
    }));
    expect(db.account.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { experiencePoints: { increment: 200 } },
    }));
    expect(result).toMatchObject({ awardedXp: 200, totalXp: 200, level: 2 });
  });

  it('does not grant the weekend bonus again when the same award is replayed', async () => {
    const db = awardDb(0, 200);
    const result = await PlayerExperienceService.award(db as unknown as Db, {
      ...input,
      awardedAt: new Date('2026-10-18T18:00:00.000Z'),
    });

    expect(db.account.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ awardedXp: 0, totalXp: 200, level: 2, unlocked: [] });
  });
});
