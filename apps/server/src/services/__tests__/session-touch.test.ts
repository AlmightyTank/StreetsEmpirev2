import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SESSION_TOUCH_INTERVAL_MS, touchSession } from '../../auth/sessions.js';

function fakePrisma() {
  const update = vi.fn(() => Promise.resolve({}));
  return { prisma: { session: { update } } as unknown as PrismaClient, update };
}

const base = { id: 's1', absoluteExpiresAt: new Date(Date.now() + 90 * 86_400_000), createdAt: new Date(), remember: true };

describe('session last-seen writes', () => {
  it('skips the write when the session was seen within the last minute', async () => {
    const { prisma, update } = fakePrisma();
    await touchSession(prisma, { ...base, lastSeenAt: new Date(Date.now() - 10_000) });
    expect(update).not.toHaveBeenCalled();
  });

  it('records the visit and slides the expiry once the minute has passed', async () => {
    const { prisma, update } = fakePrisma();
    await touchSession(prisma, { ...base, lastSeenAt: new Date(Date.now() - SESSION_TOUCH_INTERVAL_MS - 1000) });
    expect(update).toHaveBeenCalledTimes(1);
    const [{ data }] = update.mock.calls[0] as unknown as [{ data: { lastSeenAt: Date; expiresAt: Date } }];
    expect(Date.now() - data.lastSeenAt.getTime()).toBeLessThan(1000);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });
});
