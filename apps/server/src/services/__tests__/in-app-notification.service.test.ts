import { describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { InAppNotificationService, shouldCreateInAppNotification } from '../in-app-notification.service.js';

const payload = (value: unknown) => value as Prisma.InputJsonValue;

describe('shouldCreateInAppNotification', () => {
  it('keeps toast-worthy defense and quest events', () => {
    expect(shouldCreateInAppNotification('RAID_DEFENSE', payload({ won: false }))).toBe(true);
    expect(shouldCreateInAppNotification('QUEST_READY', payload({ questKey: 'FIRST_NIGHT_OUT' }))).toBe(true);
  });

  it('only keeps quest claims that actually unlock new work', () => {
    expect(shouldCreateInAppNotification('QUEST_CLAIMED', payload({ newlyAvailable: ['NEXT_JOB'] }))).toBe(true);
    expect(shouldCreateInAppNotification('QUEST_CLAIMED', payload({ newlyAvailable: [] }))).toBe(false);
  });

  it('only keeps scout/produce police busts', () => {
    expect(shouldCreateInAppNotification('SCOUT', payload({ busted: true }))).toBe(true);
    expect(shouldCreateInAppNotification('SCOUT', payload({ busted: false }))).toBe(false);
    expect(shouldCreateInAppNotification('PRODUCE_CRACK', payload({ busted: true }))).toBe(true);
  });

  it('ignores ordinary activity that never becomes a toast', () => {
    expect(shouldCreateInAppNotification('STORE_BUY', payload({ item: 'beer' }))).toBe(false);
    expect(shouldCreateInAppNotification('WORK_STREETS', payload({ turns: 5 }))).toBe(false);
  });


  it('reads the bell from the current round player only', async () => {
    const createdAt = new Date('2026-09-25T03:00:00Z');
    const findMany = vi.fn().mockResolvedValue([{
      id: 'notification-current',
      readAt: null,
      activity: {
        id: 'notification-current',
        type: 'QUEST_READY',
        payload: { title: 'Fresh work' },
        createdAt,
      },
    }]);
    const count = vi.fn().mockResolvedValue(1);
    const prisma = {
      roundPlayer: {
        findFirst: vi.fn().mockResolvedValueOnce({ id: 'current-player' }),
      },
      inAppNotification: { findMany, count },
      notificationSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const feed = await InAppNotificationService.inbox(prisma, 'account-1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { roundPlayerId: 'current-player' },
    }));
    expect(count).toHaveBeenCalledWith({
      where: { roundPlayerId: 'current-player', readAt: null },
    });
    expect(feed.notifications.map((notification) => notification.id)).toEqual(['notification-current']);
    expect(feed.unreadCount).toBe(1);
  });

  it('0.9.0-G: leaves muted categories out of the bell and its unread count', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = {
      roundPlayer: { findFirst: vi.fn().mockResolvedValueOnce({ id: 'current-player' }) },
      inAppNotification: { findMany, count },
      notificationSettings: { findUnique: vi.fn().mockResolvedValue({ bellMuted: ['runs', 'revenge', 'not-a-category'] }) },
    } as unknown as PrismaClient;

    await InAppNotificationService.inbox(prisma, 'account-1');

    const where = { roundPlayerId: 'current-player', activity: { type: { notIn: ['RUN_RETURNED', 'RUN_INCIDENT', 'REVENGE_EXPIRING'] } } };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(count).toHaveBeenCalledWith({ where: { ...where, readAt: null } });
  });

  it('marks the 0.9.0-G clock events as bell items', () => {
    for (const type of ['CONVOY_TAILED', 'TURF_PUSH_INCOMING', 'ALLIANCE_CALL', 'REVENGE_EXPIRING', 'SPECIAL_ORDER_READY'] as const) {
      expect(shouldCreateInAppNotification(type, {})).toBe(true);
    }
  });

  it('returns an empty bell before the account has joined the current round', async () => {
    const findMany = vi.fn();
    const count = vi.fn();
    const prisma = {
      roundPlayer: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
      },
      inAppNotification: { findMany, count },
    } as unknown as PrismaClient;

    await expect(InAppNotificationService.inbox(prisma, 'account-1')).resolves.toEqual({
      unreadCount: 0,
      notifications: [],
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
