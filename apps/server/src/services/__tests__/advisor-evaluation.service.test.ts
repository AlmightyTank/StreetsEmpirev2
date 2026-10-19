import { describe, expect, it, vi } from 'vitest';
import { AdvisorEvaluationService } from '../advisor-evaluation.service.js';

function input(event: 'shown' | 'clicked' | 'dismissed' | 'silenced' | 'completed', extra: Record<string, unknown> = {}) {
  return { event, ruleId: 'supply-shortfall', suggestionKey: 'stock:CRACK', slot: 0, focus: 'balanced' as const, rulesetVersion: '2.3.0', ...extra };
}

describe('AdvisorEvaluationService', () => {
  it('deduplicates shown events for the same source fingerprint', async () => {
    const prisma = {
      advisorEvaluationEvent: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing' }),
        create: vi.fn(),
      },
    } as any;

    await AdvisorEvaluationService.record(prisma, 'account-1', 'round-1', input('shown', { sourceFingerprint: 'source-1' }));
    expect(prisma.advisorEvaluationEvent.create).not.toHaveBeenCalled();
  });

  it('appends safe evaluation fields and does not accept gameplay details', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = { advisorEvaluationEvent: { create, findFirst: vi.fn().mockResolvedValue(null) } } as any;

    await AdvisorEvaluationService.record(prisma, 'account-1', 'round-1', input('dismissed', { outcome: 'not_useful' }));
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ accountId: 'account-1', roundId: 'round-1', outcome: 'not_useful' }) });
    const data = create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty('cashCents');
    expect(data).not.toHaveProperty('stockQuantity');
    expect(data).not.toHaveProperty('reason');
    expect(data).not.toHaveProperty('enemyId');
  });

  it('does not record completion unless the advisor click exists', async () => {
    const create = vi.fn().mockResolvedValue({});
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { advisorEvaluationEvent: { create, findFirst } } as any;
    await AdvisorEvaluationService.record(prisma, 'account-1', 'round-1', input('completed', { outcome: 'settled' }));
    expect(create).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ event: 'clicked' }) }));
  });
});
