import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Db } from '../../utils/db.js';
import { EasterEggService } from '../easter-egg.service.js';

function fakeDb(alreadyHeld: boolean) {
  const createMany = vi.fn(async () => ({ count: alreadyHeld ? 0 : 1 }));
  const activityCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'activity-1', createdAt: new Date(), ...data }));
  const notificationCreate = vi.fn(async () => ({}));
  const db = {
    accountCosmeticUnlock: { createMany },
    playerActivity: { create: activityCreate },
    inAppNotification: { create: notificationCreate },
    roundPlayer: {
      findUnique: vi.fn(async () => ({ accountId: 'account-1' })),
      findFirst: vi.fn(async () => ({ id: 'player-1' })),
    },
  };
  return { db, createMany, activityCreate, notificationCreate };
}

describe('EasterEggService', () => {
  it('grants the title once and rings the bell for a first find', async () => {
    const { db, createMany, activityCreate, notificationCreate } = fakeDb(false);
    const found = await EasterEggService.discoverForPlayer(db as unknown as Db, 'player-1', 'HEISENBERG', new Date('2026-10-12T00:00:00Z'));

    expect(found).toMatchObject({ isNew: true, egg: { key: 'egg-heisenberg', title: 'Heisenberg' } });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({ accountId: 'account-1', key: 'egg-heisenberg', kind: 'TITLE_BADGE', sourceQuestKey: 'EASTER_EGG:HEISENBERG' })],
    }));
    expect(activityCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ roundPlayerId: 'player-1', type: 'EASTER_EGG_FOUND' }) });
    expect(notificationCreate).toHaveBeenCalledOnce();
  });

  it('writes nothing more when the account already holds the egg', async () => {
    const { db, activityCreate } = fakeDb(true);
    const found = await EasterEggService.discoverForPlayer(db as unknown as Db, 'player-1', 'LEET');

    expect(found?.isNew).toBe(false);
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it('refuses a joke-day egg on any other day', async () => {
    const { db } = fakeDb(false);
    const prisma = { ...db, $transaction: (run: (tx: unknown) => unknown) => run(db) } as unknown as PrismaClient;

    await expect(EasterEggService.discoverFromClient(prisma, 'account-1', 'APRIL_FOOL', new Date('2026-10-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'EASTER_EGG_NOT_TODAY' });
    await expect(EasterEggService.discoverFromClient(prisma, 'account-1', 'APRIL_FOOL', new Date('2027-04-01T12:00:00Z')))
      .resolves.toMatchObject({ isNew: true, egg: { key: 'egg-april-fool' } });
    await expect(EasterEggService.discoverFromClient(prisma, 'account-1', 'KONAMI', new Date('2026-10-12T12:00:00Z')))
      .resolves.toMatchObject({ isNew: true });
  });
});
