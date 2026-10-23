import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { EventLifecycleService } from '../event-lifecycle.service.js';

describe('EventLifecycleService', () => {
  it('restores in-progress events and activates events that began during downtime', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const createMany = vi.fn(async () => ({ count: 1 }));
    const now = new Date('2026-10-16T12:00:00.000Z');
    const prisma = {
      gameEventOccurrence: {
        findMany: vi.fn(async () => [
          {
            id: 'already-active', status: 'ACTIVE',
            startsAt: new Date('2026-10-16T10:00:00.000Z'), endsAt: new Date('2026-10-16T14:00:00.000Z'),
            definition: { type: 'COMMUNITY', isEnabled: true }, round: { pausedAt: null },
          },
          {
            id: 'started-offline', status: 'SCHEDULED',
            startsAt: new Date('2026-10-16T11:00:00.000Z'), endsAt: new Date('2026-10-16T15:00:00.000Z'),
            definition: { type: 'SEASONAL', isEnabled: true }, round: null,
          },
        ]),
        updateMany,
      },
      gameEventHistory: { createMany },
    } as unknown as PrismaClient;

    await expect(EventLifecycleService.sweep(prisma, now)).resolves.toEqual({ activated: 1, expired: 0, resumed: 1 });
    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'started-offline', status: 'SCHEDULED' },
      data: { status: 'ACTIVE', activatedAt: now },
    });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ dedupeKey: 'seasonal:started-offline:activated' })],
      skipDuplicates: true,
    }));
  });

  it('expires elapsed events but leaves paused-round and disabled future events alone', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const createMany = vi.fn(async () => ({ count: 1 }));
    const now = new Date('2026-10-16T12:00:00.000Z');
    const prisma = {
      gameEventOccurrence: {
        findMany: vi.fn(async () => [
          {
            id: 'elapsed', status: 'ACTIVE',
            startsAt: new Date('2026-10-16T09:00:00.000Z'), endsAt: new Date('2026-10-16T11:00:00.000Z'),
            definition: { type: 'CITY_CONDITION', isEnabled: true }, round: { pausedAt: null },
          },
          {
            id: 'paused', status: 'SCHEDULED',
            startsAt: new Date('2026-10-16T10:00:00.000Z'), endsAt: new Date('2026-10-16T14:00:00.000Z'),
            definition: { type: 'COMMUNITY', isEnabled: true }, round: { pausedAt: new Date('2026-10-16T09:30:00.000Z') },
          },
          {
            id: 'disabled', status: 'SCHEDULED',
            startsAt: new Date('2026-10-16T10:00:00.000Z'), endsAt: new Date('2026-10-16T14:00:00.000Z'),
            definition: { type: 'SEASONAL', isEnabled: false }, round: null,
          },
        ]),
        updateMany,
      },
      gameEventHistory: { createMany },
    } as unknown as PrismaClient;

    await expect(EventLifecycleService.sweep(prisma, now)).resolves.toEqual({ activated: 0, expired: 1, resumed: 0 });
    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'elapsed', status: { in: ['SCHEDULED', 'ACTIVE'] } },
      data: { status: 'EXPIRED', expiredAt: now },
    });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ dedupeKey: 'city-condition:elapsed:expired' })],
    }));
  });

  it('counts a transition only when this server wins the status update', async () => {
    const createMany = vi.fn();
    const prisma = {
      gameEventOccurrence: {
        findMany: vi.fn(async () => [{
          id: 'raced', status: 'SCHEDULED', startsAt: new Date('2026-10-16T10:00:00.000Z'), endsAt: null,
          definition: { type: 'COMMUNITY', isEnabled: true }, round: { pausedAt: null },
        }]),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      gameEventHistory: { createMany },
    } as unknown as PrismaClient;

    await expect(EventLifecycleService.sweep(prisma, new Date('2026-10-16T12:00:00.000Z')))
      .resolves.toEqual({ activated: 0, expired: 0, resumed: 0 });
    expect(createMany).not.toHaveBeenCalled();
  });
});
