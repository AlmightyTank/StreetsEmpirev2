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
      playerMute: {
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
        // 0.9.0-H: the sender's own communication mute is checked first.
        findUniqueOrThrow: vi.fn().mockResolvedValue({ createdAt: new Date('2026-01-01'), commsMutedUntil: null, commsMutedPermanent: false }),
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

describe('PimpConsoleService.summary', () => {
  it('counts messages, alerts, activity and attacks for the current player', async () => {
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue({
      id: 'round-1',
      name: 'Test Round',
    } as never);

    const directMessageCount = vi.fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    const playerActivityCount = vi.fn()
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(5);
    const prisma = {
      roundPlayer: {
        findUnique: vi.fn().mockResolvedValue(owner),
      },
      directMessage: {
        count: directMessageCount,
      },
      playerBlock: {
        count: vi.fn().mockResolvedValue(6),
      },
      playerMute: {
        count: vi.fn().mockResolvedValue(2),
      },
      inAppNotification: {
        count: vi.fn().mockResolvedValue(7),
      },
      notificationSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      playerActivity: {
        count: playerActivityCount,
      },
    } as unknown as PrismaClient;

    await expect(PimpConsoleService.summary(prisma, owner.accountId)).resolves.toEqual({
      inbox: 4,
      unread: 2,
      sent: 3,
      archived: 1,
      blocked: 6,
      muted: 2,
      notifications: 7,
      activity: 9,
      attacks: 5,
    });
    expect(prisma.inAppNotification.count).toHaveBeenCalledWith({
      where: { roundPlayerId: owner.id, readAt: null },
    });
  });
});

describe('PimpConsoleService.activity', () => {
  it('groups current-round events and links them to authoritative pages', async () => {
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue({
      id: 'round-1',
      name: 'Test Round',
    } as never);

    const events = [
      {
        id: 'activity-raid',
        roundPlayerId: owner.id,
        type: 'RAID_DEFENSE',
        payload: { battleId: 'battle-1', opponent: 'Target', won: false },
        createdAt: new Date('2026-09-25T03:00:00Z'),
      },
      {
        id: 'activity-run',
        roundPlayerId: owner.id,
        type: 'RUN_RETURNED',
        payload: { runId: 'run-1', cities: ['Detroit'], cashCents: 150_000 },
        createdAt: new Date('2026-09-25T02:00:00Z'),
      },
    ];

    const prisma = {
      roundPlayer: {
        findUnique: vi.fn().mockResolvedValue(owner),
      },
      playerActivity: {
        count: vi.fn().mockResolvedValue(1),
        groupBy: vi.fn().mockResolvedValue([
          { type: 'RAID_DEFENSE', _count: { _all: 1 } },
          { type: 'RUN_RETURNED', _count: { _all: 1 } },
        ]),
        findMany: vi.fn().mockResolvedValue([events[0]]),
      },
    } as unknown as PrismaClient;

    const result = await PimpConsoleService.activity(prisma, owner.accountId, 'combat');

    expect(result.counts).toMatchObject({ all: 2, combat: 1, travel: 1 });
    expect(result.events).toEqual([expect.objectContaining({
      group: 'combat',
      href: '/game/combat',
      activity: expect.objectContaining({ id: 'activity-raid', type: 'RAID_DEFENSE' }),
    })]);
    expect(prisma.playerActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { roundPlayerId: owner.id, type: { in: expect.arrayContaining(['RAID_DEFENSE']) } },
    }));
  });
});
