import { describe, expect, it, vi } from 'vitest';
import { AdvisorContextService } from '../advisor-context.service.js';

describe('AdvisorContextService suppression policy', () => {
  it('persists focus and silence separately from gameplay state', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      accountProfile: {
        findUnique: vi.fn().mockResolvedValue({ advisorPreferences: { focus: 'balanced', silenced: false } }),
        upsert,
      },
    } as any;
    const next = await AdvisorContextService.updatePreferences(prisma, 'a', { focus: 'money', silenced: true });
    expect(next).toEqual({ focus: 'money', silenced: true });
    expect(upsert.mock.calls[0]![0].update.advisorPreferences).toEqual(next);
    expect(upsert.mock.calls[0]![0].update).not.toHaveProperty('cashCents');
    expect(upsert.mock.calls[0]![0].update).not.toHaveProperty('turns');
  });

  it('uses a 24-hour expiry for snooze and no expiry for round dismissals', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = { advisorSuppression: { upsert } } as any;
    const now = new Date('2026-10-19T12:00:00.000Z');

    await AdvisorContextService.suppress(prisma, 'a', 'r', 'stock:BEER', 'snooze', now);
    await AdvisorContextService.suppress(prisma, 'a', 'r', 'stock:BEER', 'dismiss', now);

    expect(upsert.mock.calls[0]![0].create.until).toEqual(new Date('2026-10-20T12:00:00.000Z'));
    expect(upsert.mock.calls[1]![0].create.until).toBeNull();
    expect(upsert.mock.calls[1]![0].update.until).toBeNull();
  });

  it('returns only active suppression keys, preserving stable keys across copy changes', async () => {
    const findMany = vi.fn().mockResolvedValue([{ suggestionKey: 'stock:BEER' }, { suggestionKey: 'heat-high' }]);
    const prisma = { advisorSuppression: { findMany } } as any;
    const result = await AdvisorContextService.suppressions(prisma, 'a', 'r', new Date('2026-10-19T12:00:00.000Z'));
    expect(result).toEqual(new Set(['stock:BEER', 'heat-high']));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ accountId: 'a', roundId: 'r' }) }));
  });
});
