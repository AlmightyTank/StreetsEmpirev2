import { describe, expect, it, vi } from 'vitest';
import { classicOgV17E, classicOgV21B, classicOgV21C } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  CrewLoyaltyService, crewLoyaltyEnabled, crewLoyaltyTier, crewLoyaltyWindow,
} from '../crew-loyalty.service.js';

const at = new Date('2026-10-21T14:30:00.000Z');

function mockDb(options: {
  points?: number; daily?: number; weekly?: number;
  status?: 'AVAILABLE' | 'RELEASED'; existing?: boolean;
} = {}) {
  const create = vi.fn().mockResolvedValue({ id: 'receipt-1' });
  const update = vi.fn();
  const findUnique = vi.fn().mockResolvedValue(options.existing ? { id: 'already' } : null);
  const aggregate = vi.fn()
    .mockResolvedValueOnce({ _sum: { points: options.daily ?? 0 } })
    .mockResolvedValueOnce({ _sum: { points: options.weekly ?? 0 } });
  const locked = vi.fn().mockResolvedValue([{
    id: 'member-1', status: options.status ?? 'AVAILABLE', loyaltyPoints: options.points ?? 0,
  }]);
  return {
    db: { $queryRaw: locked, crewLoyaltyEntry: { findUnique, aggregate, create }, crewMember: { update }, crewMentorBond: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as Db,
    create, update, findUnique, aggregate, locked,
  };
}
const award = (db: Db, sourceKey = 'SCOUT:unique-action') => CrewLoyaltyService.award(db, {
  ruleset: classicOgV21C,
  roundPlayerId: 'player-1',
  memberId: 'member-1',
  source: 'JOB_COMPLETED',
  sourceKey,
  summary: 'Scouting completed',
  at,
});

describe('2.1.0-B earned Crew Loyalty', () => {
  it('is explicitly pinned and leaves existing rounds disabled', async () => {
    expect(crewLoyaltyEnabled(classicOgV17E)).toBe(false);
    expect(crewLoyaltyEnabled(classicOgV21B)).toBe(false);
    expect(crewLoyaltyEnabled(classicOgV21C)).toBe(true);
    const { db, locked } = mockDb();
    await expect(CrewLoyaltyService.award(db, {
      ruleset: classicOgV21B, roundPlayerId: 'player-1', memberId: 'member-1',
      source: 'JOB_COMPLETED', sourceKey: 'scout-1', summary: 'Work', at,
    })).resolves.toBe(0);
    expect(locked).not.toHaveBeenCalled();
  });

  it('awards one verified source, and never replays it twice', async () => {
    const { db, create, update, findUnique } = mockDb();
    expect(await award(db)).toBe(2);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      memberId: 'member-1', roundPlayerId: 'player-1',
      source: 'JOB_COMPLETED', sourceKey: 'SCOUT:unique-action', points: 2,
    }) });
    expect(update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { loyaltyPoints: { increment: 2 } } });
    findUnique.mockResolvedValueOnce({ id: 'receipt-1' });
    expect(await award(db)).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('respects daily, weekly, and round caps and consumes a capped source', async () => {
    for (const [options, expected] of [
      [{ daily: 7 }, 1],
      [{ weekly: 31 }, 1],
      [{ points: 99 }, 1],
      [{ daily: 8 }, 0],
      [{ weekly: 32 }, 0],
      [{ points: 100 }, 0],
    ] as const) {
      const { db, create, update } = mockDb(options);
      expect(await award(db)).toBe(expected);
      expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ points: expected }) });
      expect(update).toHaveBeenCalledTimes(expected ? 1 : 0);
    }
  });

  it('ignores released members and rejects invalid source receipts', async () => {
    const { db, create } = mockDb({ status: 'RELEASED' });
    expect(await award(db)).toBe(0);
    expect(create).not.toHaveBeenCalled();
    await expect(award(db, '')).rejects.toThrow(/Invalid crew loyalty source/);
    await expect(award(db, 'x'.repeat(161))).rejects.toThrow(/Invalid crew loyalty source/);
  });

  it('uses UTC days and Monday-start weeks, including month/year boundaries', () => {
    const windows = crewLoyaltyWindow(new Date('2027-01-01T23:59:59Z'));
    expect(windows.dayStart.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(windows.nextDay.toISOString()).toBe('2027-01-02T00:00:00.000Z');
    expect(windows.weekStart.toISOString()).toBe('2026-12-28T00:00:00.000Z');
    expect(windows.nextWeek.toISOString()).toBe('2027-01-04T00:00:00.000Z');
  });

  it('returns transparent story tiers without adding gameplay bonuses', () => {
    expect([0, 25, 50, 75, 100].map(n => crewLoyaltyTier(n))).toEqual([
      { tier: 'New Face', nextMilestone: 25 },
      { tier: 'Proven', nextMilestone: 50 },
      { tier: 'Trusted', nextMilestone: 75 },
      { tier: 'Veteran', nextMilestone: 100 },
      { tier: 'Legend', nextMilestone: null },
    ]);
  });

  it('exposes a readable reason history from immutable receipts', () => {
    expect(CrewLoyaltyService.history([{
      source: 'JOB_COMPLETED', points: 2, summary: 'Scouting completed · +2 loyalty.', at,
    }])).toEqual([{ source: 'JOB_COMPLETED', points: 2, label: 'Scouting completed · +2 loyalty.', at: at.toISOString() }]);
  });
});
