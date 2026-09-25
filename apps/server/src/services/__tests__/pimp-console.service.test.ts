import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PimpConsoleService } from '../pimp-console.service.js';
import { RoundService } from '../round.service.js';

const owner = {
  id: 'player-owner',
  roundId: 'round-1',
  accountId: 'account-owner',
  publicPimpId: 1001,
  displayName: 'Owner',
};

const target = {
  id: 'player-target',
  roundId: 'round-1',
  accountId: 'account-target',
  publicPimpId: 1002,
  displayName: 'Target',
};

const message = {
  id: 'message-1',
  roundId: 'round-1',
  senderId: owner.id,
  recipientId: target.id,
  actionId: 'action-12345678',
  subject: 'Street business',
  body: 'Meet me by the corner.',
  createdAt: new Date('2026-09-25T03:00:00Z'),
  readAt: new Date('2026-09-25T03:00:03Z'),
  senderArchivedAt: null,
  recipientArchivedAt: null,
  sender: {
    accountId: owner.accountId,
    publicPimpId: owner.publicPimpId,
    displayName: owner.displayName,
  },
  recipient: {
    accountId: target.accountId,
    publicPimpId: target.publicPimpId,
    displayName: target.displayName,
  },
};

const input = {
  recipientPublicPimpId: target.publicPimpId,
  subject: message.subject,
  body: message.body,
  actionId: message.actionId,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PimpConsoleService.send', () => {
  it('replays an existing action id without entering a second write transaction', async () => {
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue({
      id: 'round-1',
      name: 'Test Round',
    } as never);

    const transaction = vi.fn();
    const prisma = {
      roundPlayer: {
        findUnique: vi.fn().mockResolvedValue(owner),
      },
      directMessage: {
        findUnique: vi.fn().mockResolvedValue(message),
      },
      playerMessageReport: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      playerBlock: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: transaction,
    } as unknown as PrismaClient;

    const result = await PimpConsoleService.send(
      prisma,
      owner.accountId,
      input,
      new Date('2026-09-25T03:00:05Z'),
    );

    expect(result.replayed).toBe(true);
    expect(result.message.id).toBe(message.id);
    expect(result.message.counterpart.publicPimpId).toBe(target.publicPimpId);
    expect(result.message.readAt).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a send when either account has blocked the other', async () => {
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue({
      id: 'round-1',
      name: 'Test Round',
    } as never);

    const create = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      directMessage: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
      },
      account: {
        findUnique: vi.fn().mockResolvedValue({ isActive: true }),
      },
      playerBlock: {
        findFirst: vi.fn().mockResolvedValue({ id: 'block-1' }),
      },
    };
    const transaction = vi.fn(async (
      callback: (client: typeof tx) => Promise<unknown>,
    ) => callback(tx));

    const prisma = {
      roundPlayer: {
        findUnique: vi.fn().mockResolvedValue(owner),
        findFirst: vi.fn().mockResolvedValue(target),
      },
      directMessage: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: transaction,
    } as unknown as PrismaClient;

    await expect(PimpConsoleService.send(
      prisma,
      owner.accountId,
      input,
      new Date('2026-09-25T03:00:05Z'),
    )).rejects.toMatchObject({
      statusCode: 404,
      code: 'PLAYER_NOT_FOUND',
    });

    expect(create).not.toHaveBeenCalled();
  });
});
