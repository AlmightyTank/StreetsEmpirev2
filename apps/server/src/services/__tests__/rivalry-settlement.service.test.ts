import { describe, expect, it, vi } from 'vitest';
import { RivalrySettlementService } from '../rivalry-settlement.service.js';

function dbFor(relationship: Record<string, unknown>, settlements: Array<Record<string, unknown>> = []) {
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    rivalryRelationship: {
      findUnique: vi.fn().mockResolvedValue(relationship),
      update: vi.fn().mockResolvedValue(relationship),
    },
    rivalrySettlement: {
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { status?: string } }) =>
        settlements.find((row) => row.status === where.status) ?? null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'settlement-1', ...data })),
    },
    rivalryStateTransition: { create: vi.fn().mockResolvedValue({ id: 'transition-1' }) },
    rivalryFeudContract: { update: vi.fn().mockResolvedValue({ id: 'contract-1' }) },
  };
  return db as any;
}

const relationship = (overrides: Record<string, unknown> = {}) => ({
  id: 'relationship-1',
  participantAId: 'player-a',
  participantBId: 'player-b',
  status: 'ACTIVE',
  suppressedAt: null,
  contracts: [],
  ...overrides,
});

describe('RivalrySettlementService', () => {
  it('records a nonviolent ceasefire and archives the relationship', async () => {
    const db = dbFor(relationship());
    const result = await RivalrySettlementService.settle(db, 'player-a', {
      relationshipId: 'relationship-1', status: 'CEASEFIRE', reason: 'both parties agreed',
    }, new Date('2026-01-01T00:00:00.000Z'));

    expect(result.status).toBe('CEASEFIRE');
    expect(db.rivalryStateTransition.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fromStatus: 'ACTIVE', toStatus: 'CEASEFIRE' }),
    }));
    expect(db.rivalryRelationship.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CEASEFIRE', archivedAt: expect.any(Date) }),
    }));
  });

  it('expires a feud into a timeout without applying a player penalty', async () => {
    const db = dbFor(relationship({ contracts: [{ id: 'contract-1', status: 'ACCEPTED', expiresAt: new Date('2025-12-31T00:00:00.000Z') }] }));
    const result = await RivalrySettlementService.settleExpired(db, 'relationship-1', new Date('2026-01-01T00:00:00.000Z'));

    expect(result?.status).toBe('TIMEOUT');
    expect(db.rivalryFeudContract.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'EXPIRED' }),
    }));
    expect(db.rivalryRelationship.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'TIMEOUT' }),
    }));
  });

  it('replays an existing terminal settlement idempotently', async () => {
    const existing = { id: 'settlement-1', status: 'CLOSED' };
    const db = dbFor(relationship({ status: 'CLOSED' }), [existing]);
    const result = await RivalrySettlementService.settle(db, 'player-a', {
      relationshipId: 'relationship-1', status: 'CLOSED', reason: 'story closure',
    });

    expect(result).toEqual(existing);
    expect(db.rivalrySettlement.create).not.toHaveBeenCalled();
  });

  it('keeps a declined proposal bounded and owned by the target', async () => {
    const db = dbFor(relationship());
    db.rivalryFeudContract = {
      findUnique: vi.fn().mockResolvedValue({ id: 'contract-1', targetId: 'player-b', status: 'PROPOSED', relationship: relationship() }),
      update: vi.fn().mockResolvedValue({ id: 'contract-1', status: 'DECLINED' }),
    };

    await expect(RivalrySettlementService.decline(db, 'player-a', 'contract-1')).rejects.toMatchObject({ code: 'RIVALRY_FEUD_NOT_FOUND' });
    await expect(RivalrySettlementService.decline(db, 'player-b', 'contract-1')).resolves.toMatchObject({ status: 'DECLINED' });
  });
});
