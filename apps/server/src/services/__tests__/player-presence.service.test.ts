import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PRESENCE_WRITE_INTERVAL_MS, recordPlayerPresence } from '../player-presence.service.js';

function fakePrisma() {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  return { prisma: { roundPlayer: { updateMany } } as unknown as PrismaClient, updateMany };
}

describe('player online check-in', () => {
  it('records presence only when the existing timestamp is at least a minute old', async () => {
    const { prisma, updateMany } = fakePrisma();
    const now = new Date('2026-10-13T12:00:00.000Z');

    await recordPlayerPresence(prisma, 'player-42', now);

    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: 'player-42',
        lastActiveAt: { lt: new Date(now.getTime() - PRESENCE_WRITE_INTERVAL_MS) },
      },
      data: { lastActiveAt: now },
    });
  });

  it('never settles game state or touches another table', async () => {
    const { prisma, updateMany } = fakePrisma();
    await recordPlayerPresence(prisma, 'player-42');
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(Object.keys(updateMany.mock.calls[0]![0].data)).toEqual(['lastActiveAt']);
  });
});
