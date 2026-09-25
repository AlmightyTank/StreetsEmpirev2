import type { Prisma, PrismaClient } from '@prisma/client';
import {
  MESSAGE_PAGE_SIZE,
  type ArchiveDirectMessageInput,
  type BlockedPlayerDto,
  type ConsoleBlocksDto,
  type ConsoleFolder,
  type DirectMessageDto,
  type PimpConsoleDto,
  type ReportDirectMessageInput,
  type SendDirectMessageInput,
  type SendMessageResultDto,
} from '@streets/shared';
import { lockAccount } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { RoundService } from './round.service.js';

const SEND_MIN_INTERVAL_MS = 5_000;
const SEND_WINDOW_MS = 10 * 60_000;
const SEND_WINDOW_MAX = 20;
const DUPLICATE_WINDOW_MS = 60_000;

const messageSelect = {
  id: true,
  roundId: true,
  senderId: true,
  recipientId: true,
  actionId: true,
  subject: true,
  body: true,
  createdAt: true,
  readAt: true,
  senderArchivedAt: true,
  recipientArchivedAt: true,
  sender: {
    select: {
      accountId: true,
      publicPimpId: true,
      displayName: true,
    },
  },
  recipient: {
    select: {
      accountId: true,
      publicPimpId: true,
      displayName: true,
    },
  },
} satisfies Prisma.DirectMessageSelect;

type MessageRow = Prisma.DirectMessageGetPayload<{ select: typeof messageSelect }>;

async function currentPlayer(prisma: PrismaClient, accountId: string) {
  const round = await RoundService.requireCurrent(prisma);
  const player = await prisma.roundPlayer.findUnique({
    where: { roundId_accountId: { roundId: round.id, accountId } },
    select: {
      id: true,
      roundId: true,
      accountId: true,
      publicPimpId: true,
      displayName: true,
    },
  });
  if (!player) {
    throw AppError.notFound('NOT_IN_ROUND', `You have not entered ${round.name} yet.`);
  }
  return player;
}

async function currentTarget(
  prisma: PrismaClient,
  roundId: string,
  publicPimpId: number,
) {
  const target = await prisma.roundPlayer.findFirst({
    where: {
      roundId,
      publicPimpId,
      account: { isActive: true },
    },
    select: {
      id: true,
      roundId: true,
      accountId: true,
      publicPimpId: true,
      displayName: true,
    },
  });
  if (!target) {
    throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
  }
  return target;
}

async function lockAccountPair(
  tx: Prisma.TransactionClient,
  firstAccountId: string,
  secondAccountId: string,
): Promise<void> {
  const ids = [firstAccountId, secondAccountId].sort();
  await lockAccount(tx, ids[0]!);
  if (ids[1] !== ids[0]) await lockAccount(tx, ids[1]!);
}

function folderWhere(folder: ConsoleFolder, playerId: string): Prisma.DirectMessageWhereInput {
  if (folder === 'sent') {
    return { senderId: playerId, senderArchivedAt: null };
  }
  if (folder === 'archived') {
    return {
      OR: [
        { senderId: playerId, senderArchivedAt: { not: null } },
        { recipientId: playerId, recipientArchivedAt: { not: null } },
      ],
    };
  }
  return { recipientId: playerId, recipientArchivedAt: null };
}

function messageDto(
  row: MessageRow,
  ownerId: string,
  reported: boolean,
  blocked: boolean,
): DirectMessageDto {
  const incoming = row.recipientId === ownerId;
  const counterpart = incoming ? row.sender : row.recipient;
  return {
    id: row.id,
    direction: incoming ? 'in' : 'out',
    counterpart: {
      publicPimpId: counterpart.publicPimpId,
      displayName: counterpart.displayName,
    },
    subject: row.subject,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    archived: incoming ? row.recipientArchivedAt !== null : row.senderArchivedAt !== null,
    reported,
    blocked,
  };
}

async function decorateMessages(
  prisma: PrismaClient,
  owner: Awaited<ReturnType<typeof currentPlayer>>,
  rows: MessageRow[],
): Promise<DirectMessageDto[]> {
  if (!rows.length) return [];

  const messageIds = rows.map((row) => row.id);
  const counterpartAccountIds = [...new Set(rows.map((row) =>
    row.recipientId === owner.id ? row.sender.accountId : row.recipient.accountId))];

  const [reports, blocks] = await Promise.all([
    prisma.playerMessageReport.findMany({
      where: {
        reporterAccountId: owner.accountId,
        messageId: { in: messageIds },
      },
      select: { messageId: true },
    }),
    counterpartAccountIds.length
      ? prisma.playerBlock.findMany({
          where: {
            OR: [
              {
                blockerAccountId: owner.accountId,
                blockedAccountId: { in: counterpartAccountIds },
              },
              {
                blockedAccountId: owner.accountId,
                blockerAccountId: { in: counterpartAccountIds },
              },
            ],
          },
          select: {
            blockerAccountId: true,
            blockedAccountId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const reported = new Set(reports.map((row) => row.messageId));
  const blockedAccounts = new Set<string>();
  for (const block of blocks) {
    blockedAccounts.add(
      block.blockerAccountId === owner.accountId
        ? block.blockedAccountId
        : block.blockerAccountId,
    );
  }

  return rows.map((row) => {
    const counterpartAccountId =
      row.recipientId === owner.id ? row.sender.accountId : row.recipient.accountId;
    return messageDto(
      row,
      owner.id,
      reported.has(row.id),
      blockedAccounts.has(counterpartAccountId),
    );
  });
}

async function oneMessageDto(
  prisma: PrismaClient,
  owner: Awaited<ReturnType<typeof currentPlayer>>,
  row: MessageRow,
): Promise<DirectMessageDto> {
  return (await decorateMessages(prisma, owner, [row]))[0]!;
}

async function isCommunicationBlocked(
  tx: Prisma.TransactionClient,
  firstAccountId: string,
  secondAccountId: string,
): Promise<boolean> {
  return Boolean(await tx.playerBlock.findFirst({
    where: {
      OR: [
        { blockerAccountId: firstAccountId, blockedAccountId: secondAccountId },
        { blockerAccountId: secondAccountId, blockedAccountId: firstAccountId },
      ],
    },
    select: { id: true },
  }));
}

export const PimpConsoleService = {
  async page(
    prisma: PrismaClient,
    accountId: string,
    folder: ConsoleFolder,
    requestedPage = 1,
  ): Promise<PimpConsoleDto> {
    const owner = await currentPlayer(prisma, accountId);
    const archivedWhere = folderWhere('archived', owner.id);
    const currentWhere = folderWhere(folder, owner.id);

    const [inbox, unread, sent, archived, blocked, total] = await Promise.all([
      prisma.directMessage.count({
        where: { recipientId: owner.id, recipientArchivedAt: null },
      }),
      prisma.directMessage.count({
        where: { recipientId: owner.id, recipientArchivedAt: null, readAt: null },
      }),
      prisma.directMessage.count({
        where: { senderId: owner.id, senderArchivedAt: null },
      }),
      prisma.directMessage.count({ where: archivedWhere }),
      prisma.playerBlock.count({
        where: {
          blockerAccountId: owner.accountId,
          blocked: {
            isActive: true,
            roundPlayers: { some: { roundId: owner.roundId } },
          },
        },
      }),
      prisma.directMessage.count({ where: currentWhere }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / MESSAGE_PAGE_SIZE));
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    const rows = await prisma.directMessage.findMany({
      where: currentWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * MESSAGE_PAGE_SIZE,
      take: MESSAGE_PAGE_SIZE,
      select: messageSelect,
    });

    return {
      folder,
      counts: { inbox, unread, sent, archived, blocked },
      page,
      pageSize: MESSAGE_PAGE_SIZE,
      total,
      totalPages,
      messages: await decorateMessages(prisma, owner, rows),
    };
  },

  async send(
    prisma: PrismaClient,
    accountId: string,
    input: SendDirectMessageInput,
    now = new Date(),
  ): Promise<SendMessageResultDto> {
    const owner = await currentPlayer(prisma, accountId);

    const replay = await prisma.directMessage.findUnique({
      where: {
        senderId_actionId: {
          senderId: owner.id,
          actionId: input.actionId,
        },
      },
      select: messageSelect,
    });
    if (replay) {
      return {
        message: await oneMessageDto(prisma, owner, replay),
        replayed: true,
      };
    }

    const target = await currentTarget(
      prisma,
      owner.roundId,
      input.recipientPublicPimpId,
    );
    if (target.id === owner.id) {
      throw AppError.badRequest('MESSAGE_SELF', 'You cannot message yourself.');
    }

    const row = await prisma.$transaction(async (tx) => {
      await lockAccountPair(tx, owner.accountId, target.accountId);

      const existing = await tx.directMessage.findUnique({
        where: {
          senderId_actionId: {
            senderId: owner.id,
            actionId: input.actionId,
          },
        },
        select: messageSelect,
      });
      if (existing) return { row: existing, replayed: true as const };

      const targetAccount = await tx.account.findUnique({
        where: { id: target.accountId },
        select: { isActive: true },
      });
      if (!targetAccount?.isActive) {
        throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not available.');
      }

      if (await isCommunicationBlocked(tx, owner.accountId, target.accountId)) {
        throw AppError.forbidden('Messages are blocked between these accounts.');
      }

      const windowStart = new Date(now.getTime() - SEND_WINDOW_MS);
      const duplicateStart = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
      const [latest, recentCount, duplicate] = await Promise.all([
        tx.directMessage.findFirst({
          where: { senderId: owner.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        tx.directMessage.count({
          where: { senderId: owner.id, createdAt: { gte: windowStart } },
        }),
        tx.directMessage.findFirst({
          where: {
            senderId: owner.id,
            recipientId: target.id,
            subject: input.subject,
            body: input.body,
            createdAt: { gte: duplicateStart },
          },
          select: { id: true },
        }),
      ]);

      if (latest && now.getTime() - latest.createdAt.getTime() < SEND_MIN_INTERVAL_MS) {
        throw AppError.tooManyRequests(
          'MESSAGE_TOO_FAST',
          'Give it a few seconds before sending another message.',
        );
      }
      if (recentCount >= SEND_WINDOW_MAX) {
        throw AppError.tooManyRequests(
          'MESSAGE_RATE_LIMIT',
          'You have sent a lot of messages. Try again in a few minutes.',
        );
      }
      if (duplicate) {
        throw AppError.conflict(
          'MESSAGE_DUPLICATE',
          'That same message was already sent recently.',
        );
      }

      const created = await tx.directMessage.create({
        data: {
          roundId: owner.roundId,
          senderId: owner.id,
          recipientId: target.id,
          actionId: input.actionId,
          subject: input.subject,
          body: input.body,
          createdAt: now,
        },
        select: messageSelect,
      });
      return { row: created, replayed: false as const };
    });

    return {
      message: await oneMessageDto(prisma, owner, row.row),
      replayed: row.replayed,
    };
  },

  async read(
    prisma: PrismaClient,
    accountId: string,
    messageId: string,
    now = new Date(),
  ): Promise<{ ok: true }> {
    const owner = await currentPlayer(prisma, accountId);
    const message = await prisma.directMessage.findFirst({
      where: { id: messageId, roundId: owner.roundId },
      select: { recipientId: true },
    });
    if (!message || message.recipientId !== owner.id) {
      throw AppError.notFound('MESSAGE_NOT_FOUND', 'That message is not in your inbox.');
    }

    await prisma.directMessage.updateMany({
      where: { id: messageId, recipientId: owner.id, readAt: null },
      data: { readAt: now },
    });
    return { ok: true };
  },

  async archive(
    prisma: PrismaClient,
    accountId: string,
    messageId: string,
    input: ArchiveDirectMessageInput,
    now = new Date(),
  ): Promise<{ ok: true }> {
    const owner = await currentPlayer(prisma, accountId);
    const message = await prisma.directMessage.findFirst({
      where: {
        id: messageId,
        roundId: owner.roundId,
        OR: [{ senderId: owner.id }, { recipientId: owner.id }],
      },
      select: { senderId: true, recipientId: true },
    });
    if (!message) {
      throw AppError.notFound('MESSAGE_NOT_FOUND', 'That message is not yours.');
    }

    if (message.senderId === owner.id) {
      await prisma.directMessage.update({
        where: { id: messageId },
        data: { senderArchivedAt: input.archived ? now : null },
      });
    } else {
      await prisma.directMessage.update({
        where: { id: messageId },
        data: { recipientArchivedAt: input.archived ? now : null },
      });
    }
    return { ok: true };
  },

  async report(
    prisma: PrismaClient,
    accountId: string,
    messageId: string,
    input: ReportDirectMessageInput,
  ): Promise<{ ok: true }> {
    const owner = await currentPlayer(prisma, accountId);
    const message = await prisma.directMessage.findFirst({
      where: { id: messageId, roundId: owner.roundId },
      select: { recipientId: true },
    });
    if (!message || message.recipientId !== owner.id) {
      throw AppError.notFound('MESSAGE_NOT_FOUND', 'Only received messages can be reported.');
    }

    await prisma.playerMessageReport.upsert({
      where: {
        messageId_reporterAccountId: {
          messageId,
          reporterAccountId: owner.accountId,
        },
      },
      create: {
        messageId,
        reporterAccountId: owner.accountId,
        reason: input.reason,
      },
      update: {
        reason: input.reason,
        resolvedAt: null,
        resolvedByUsername: null,
        resolution: null,
      },
    });
    return { ok: true };
  },

  async blocks(
    prisma: PrismaClient,
    accountId: string,
  ): Promise<ConsoleBlocksDto> {
    const owner = await currentPlayer(prisma, accountId);
    const rows = await prisma.playerBlock.findMany({
      where: {
        blockerAccountId: owner.accountId,
        blocked: {
          isActive: true,
          roundPlayers: { some: { roundId: owner.roundId } },
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: {
          select: {
            roundPlayers: {
              where: { roundId: owner.roundId },
              take: 1,
              select: {
                publicPimpId: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    const blocked: BlockedPlayerDto[] = rows.flatMap((row) => {
      const player = row.blocked.roundPlayers[0];
      return player ? [{
        publicPimpId: player.publicPimpId,
        displayName: player.displayName,
        blockedAt: row.createdAt.toISOString(),
      }] : [];
    });
    return { blocked };
  },

  async block(
    prisma: PrismaClient,
    accountId: string,
    targetPublicPimpId: number,
  ): Promise<ConsoleBlocksDto> {
    const owner = await currentPlayer(prisma, accountId);
    const target = await currentTarget(prisma, owner.roundId, targetPublicPimpId);
    if (target.id === owner.id) {
      throw AppError.badRequest('BLOCK_SELF', 'You cannot block yourself.');
    }

    await prisma.$transaction(async (tx) => {
      await lockAccountPair(tx, owner.accountId, target.accountId);
      await tx.playerBlock.upsert({
        where: {
          blockerAccountId_blockedAccountId: {
            blockerAccountId: owner.accountId,
            blockedAccountId: target.accountId,
          },
        },
        create: {
          blockerAccountId: owner.accountId,
          blockedAccountId: target.accountId,
        },
        update: {},
      });
    });

    return PimpConsoleService.blocks(prisma, accountId);
  },

  async unblock(
    prisma: PrismaClient,
    accountId: string,
    targetPublicPimpId: number,
  ): Promise<ConsoleBlocksDto> {
    const owner = await currentPlayer(prisma, accountId);
    const target = await currentTarget(prisma, owner.roundId, targetPublicPimpId);

    await prisma.$transaction(async (tx) => {
      await lockAccountPair(tx, owner.accountId, target.accountId);
      await tx.playerBlock.deleteMany({
        where: {
          blockerAccountId: owner.accountId,
          blockedAccountId: target.accountId,
        },
      });
    });

    return PimpConsoleService.blocks(prisma, accountId);
  },
};
