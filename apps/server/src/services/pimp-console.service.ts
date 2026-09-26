import type { ActivityType, PlayerActivity, Prisma, PrismaClient } from '@prisma/client';
import {
  CONSOLE_ACTIVITY_PAGE_SIZE,
  MESSAGE_PAGE_SIZE,
  type ArchiveDirectMessageInput,
  type BlockedPlayerDto,
  type CommsRestrictionDto,
  type MutedPlayerDto,
  type ConsoleActivityDto,
  type ConsoleActivityEntryDto,
  type ConsoleActivityFilter,
  type ConsoleBlocksDto,
  type ConsoleCountsDto,
  type ConsoleFolder,
  type DirectMessageDto,
  type PimpConsoleDto,
  type ReportDirectMessageInput,
  type SendDirectMessageInput,
  type SendMessageResultDto,
} from '@streets/shared';
import { lockAccount } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { toActivityDto } from '../game/dto.js';
import { RoundService } from './round.service.js';
import { bellWhere } from './in-app-notification.service.js';
import { assertCanCommunicate, checkDirectMessage, commsMuted, flagMessage } from './communication-guard.js';

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
type ConsoleActivityGroup = Exclude<ConsoleActivityFilter, 'all'>;

const ACTIVITY_GROUPS: ConsoleActivityGroup[] = [
  'combat',
  'turf',
  'travel',
  'market',
  'progress',
  'street',
  'system',
];

const ACTIVITY_GROUP_TYPES: Record<ConsoleActivityGroup, ActivityType[]> = {
  combat: ['RAID_ATTACK', 'RAID_DEFENSE', 'DRIVE_BY_ATTACK', 'DRIVE_BY_DEFENSE', 'COMBAT_TREATMENT', 'COMBAT_RECON', 'BATTLE_VOIDED', 'REVENGE_EXPIRING'],
  turf: ['TURF_CLAIM', 'TURF_POST', 'TURF_PULL', 'TURF_PUSH', 'TURF_PUSH_BACKUP', 'TURF_PUSH_ATTACK', 'TURF_PUSH_DEFENSE', 'TURF_OUTPOST_ESTABLISH', 'TURF_OUTPOST_TRANSFER', 'TURF_PUSH_INCOMING', 'ALLIANCE_CALL'],
  travel: ['RUN_LAUNCHED', 'RUN_RETURNED', 'RUN_INCIDENT', 'RELOCATION_STARTED', 'RELOCATED', 'CONVOY_TAIL', 'CONVOY_ATTACK', 'CONVOY_DEFENSE', 'CONVOY_BACKUP', 'CONVOY_TAILED'],
  market: ['STORE_BUY', 'STORE_SELL', 'SPECIAL_ORDER_READY'],
  progress: ['QUEST_OBJECTIVE_COMPLETE', 'QUEST_READY', 'QUEST_CLAIMED', 'FAVOR_ACTIVATED', 'FAVOR_ARMED', 'FAVOR_DISARMED', 'HIDEOUT_UPGRADE', 'WEAPON_UNLOCK'],
  street: ['SCOUT', 'WORK_STREETS', 'PRODUCE_CRACK', 'HEAT_BRIBE', 'PAYOUT_CHANGE'],
  system: ['ROUND_JOINED', 'AWAY_BONUS', 'ADMIN_GRANT'],
};

const ACTIVITY_GROUP_BY_TYPE = new Map<ActivityType, ConsoleActivityGroup>(
  ACTIVITY_GROUPS.flatMap((group) => ACTIVITY_GROUP_TYPES[group].map((type) => [type, group] as const)),
);

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
  // 0.9.0-H: a conversation deleted on this side is gone from every folder.
  if (folder === 'sent') {
    return { senderId: playerId, senderArchivedAt: null, senderHiddenAt: null };
  }
  if (folder === 'archived') {
    return {
      OR: [
        { senderId: playerId, senderArchivedAt: { not: null }, senderHiddenAt: null },
        { recipientId: playerId, recipientArchivedAt: { not: null }, recipientHiddenAt: null },
      ],
    };
  }
  return { recipientId: playerId, recipientArchivedAt: null, recipientHiddenAt: null };
}

function messageDto(
  row: MessageRow,
  ownerId: string,
  reported: boolean,
  blocked: boolean,
  muted: boolean,
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
    // Read state is private to the recipient; do not expose recipient activity timing to senders.
    readAt: incoming ? row.readAt?.toISOString() ?? null : null,
    archived: incoming ? row.recipientArchivedAt !== null : row.senderArchivedAt !== null,
    reported,
    blocked,
    muted,
  };
}

function activityGroup(type: ActivityType): ConsoleActivityGroup {
  return ACTIVITY_GROUP_BY_TYPE.get(type) ?? 'system';
}

function activityHref(row: { type: ActivityType; payload: Prisma.JsonValue }): string {
  const group = activityGroup(row.type);
  const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload as Record<string, unknown>
    : {};

  if (row.type === 'COMBAT_TREATMENT') return '/game/combat#recovery';
  if (row.type === 'COMBAT_RECON') return '/game/combat#intel';
  if (row.type === 'HIDEOUT_UPGRADE') return '/game/hideout';
  if (row.type === 'WEAPON_UNLOCK') return '/game/stores/tommy';
  if (row.type === 'ALLIANCE_CALL' && payload.kind === 'convoy') return '/game/travel';
  if (row.type === 'SPECIAL_ORDER_READY') {
    const store = typeof payload.storeKey === 'string' ? payload.storeKey : null;
    return store ? `/game/stores/${encodeURIComponent(store)}` : '/game/stores';
  }
  if (row.type.startsWith('QUEST_') || row.type.startsWith('FAVOR_')) return '/game/quests';
  if (row.type.startsWith('STORE_')) {
    const store = typeof payload.storeKey === 'string' ? payload.storeKey : null;
    return store ? `/game/stores/${encodeURIComponent(store)}` : '/game/stores';
  }
  if (group === 'combat') return '/game/combat';
  if (group === 'turf') {
    const city = typeof payload.city === 'string' ? payload.city : null;
    return city ? `/game/turf?city=${encodeURIComponent(city)}` : '/game/turf';
  }
  if (group === 'travel') return '/game/travel';
  if (group === 'market') return '/game/stores';
  if (group === 'progress') return '/game/quests';
  if (group === 'street') {
    if (row.type === 'PRODUCE_CRACK') return '/game/produce';
    if (row.type === 'HEAT_BRIBE') return '/game#heat';
    return '/game/scout';
  }
  return '/game/activity';
}

function activityEntry(row: PlayerActivity): ConsoleActivityEntryDto {
  return {
    activity: toActivityDto(row),
    group: activityGroup(row.type),
    href: activityHref(row),
  };
}

async function consoleCounts(
  prisma: PrismaClient,
  owner: Awaited<ReturnType<typeof currentPlayer>>,
): Promise<ConsoleCountsDto> {
  const [inbox, unread, sent, archived, blocked, notifications, activity, attacks, muted] = await Promise.all([
    prisma.directMessage.count({
      where: folderWhere('inbox', owner.id),
    }),
    prisma.directMessage.count({
      where: { ...folderWhere('inbox', owner.id), readAt: null },
    }),
    prisma.directMessage.count({
      where: folderWhere('sent', owner.id),
    }),
    prisma.directMessage.count({
      where: folderWhere('archived', owner.id),
    }),
    prisma.playerBlock.count({
      where: {
        blockerAccountId: owner.accountId,
        blocked: {
          isActive: true,
          roundPlayers: { some: { roundId: owner.roundId } },
        },
      },
    }),
    // 0.9.0-G: categories muted in the bell do not badge the Console either.
    bellWhere(prisma, owner.accountId, owner.id).then((where) => prisma.inAppNotification.count({
      where: { ...where, readAt: null },
    })),
    prisma.playerActivity.count({
      where: { roundPlayerId: owner.id },
    }),
    prisma.playerActivity.count({
      where: { roundPlayerId: owner.id, type: { in: ACTIVITY_GROUP_TYPES.combat } },
    }),
    prisma.playerMute.count({
      where: { muterAccountId: owner.accountId, muted: { isActive: true, roundPlayers: { some: { roundId: owner.roundId } } } },
    }),
  ]);

  return { inbox, unread, sent, archived, blocked, muted, notifications, activity, attacks };
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

  const [reports, blocks, mutes] = await Promise.all([
    prisma.playerMessageReport.findMany({
      where: {
        reporterAccountId: owner.accountId,
        messageId: { in: messageIds },
      },
      select: { messageId: true },
    }),
    counterpartAccountIds.length
      ? prisma.playerBlock.findMany({
          // Only expose blocks the viewer created. An incoming block is enforced
          // by send(), but never revealed as another player's private setting.
          where: {
            blockerAccountId: owner.accountId,
            blockedAccountId: { in: counterpartAccountIds },
          },
          select: {
            blockedAccountId: true,
          },
        })
      : Promise.resolve([]),
    counterpartAccountIds.length
      ? prisma.playerMute.findMany({
          where: { muterAccountId: owner.accountId, mutedAccountId: { in: counterpartAccountIds } },
          select: { mutedAccountId: true },
        })
      : Promise.resolve([]),
  ]);
  const mutedAccounts = new Set(mutes.map((row) => row.mutedAccountId));

  const reported = new Set(reports.map((row) => row.messageId));
  const blockedAccounts = new Set<string>();
  for (const block of blocks) {
    blockedAccounts.add(block.blockedAccountId);
  }

  return rows.map((row) => {
    const counterpartAccountId =
      row.recipientId === owner.id ? row.sender.accountId : row.recipient.accountId;
    return messageDto(
      row,
      owner.id,
      reported.has(row.id),
      blockedAccounts.has(counterpartAccountId),
      mutedAccounts.has(counterpartAccountId),
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

async function restrictionFor(prisma: PrismaClient, accountId: string, now = new Date()): Promise<CommsRestrictionDto | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { commsMutedUntil: true, commsMutedPermanent: true },
  });
  if (!account || !commsMuted(account, now)) return null;
  return {
    permanent: account.commsMutedPermanent,
    until: account.commsMutedPermanent ? null : account.commsMutedUntil?.toISOString() ?? null,
  };
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
    const currentWhere = folderWhere(folder, owner.id);

    const [counts, total] = await Promise.all([
      consoleCounts(prisma, owner),
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
      counts,
      page,
      pageSize: MESSAGE_PAGE_SIZE,
      total,
      totalPages,
      messages: await decorateMessages(prisma, owner, rows),
      restriction: await restrictionFor(prisma, owner.accountId),
    };
  },

  async summary(
    prisma: PrismaClient,
    accountId: string,
  ): Promise<ConsoleCountsDto> {
    const owner = await currentPlayer(prisma, accountId);
    return consoleCounts(prisma, owner);
  },

  async activity(
    prisma: PrismaClient,
    accountId: string,
    filter: ConsoleActivityFilter,
    requestedPage = 1,
  ): Promise<ConsoleActivityDto> {
    const owner = await currentPlayer(prisma, accountId);
    const typeFilter = filter === 'all' ? undefined : ACTIVITY_GROUP_TYPES[filter];
    const where: Prisma.PlayerActivityWhereInput = {
      roundPlayerId: owner.id,
      ...(typeFilter ? { type: { in: typeFilter } } : {}),
    };

    const [total, grouped] = await Promise.all([
      prisma.playerActivity.count({ where }),
      prisma.playerActivity.groupBy({
        by: ['type'],
        where: { roundPlayerId: owner.id },
        _count: { _all: true },
      }),
    ]);

    const counts = Object.fromEntries([
      ['all', 0],
      ...ACTIVITY_GROUPS.map((group) => [group, 0]),
    ]) as Record<ConsoleActivityFilter, number>;
    for (const row of grouped) {
      const size = row._count._all;
      counts.all += size;
      counts[activityGroup(row.type)] += size;
    }

    const totalPages = Math.max(1, Math.ceil(total / CONSOLE_ACTIVITY_PAGE_SIZE));
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    const rows = await prisma.playerActivity.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * CONSOLE_ACTIVITY_PAGE_SIZE,
      take: CONSOLE_ACTIVITY_PAGE_SIZE,
    });

    return {
      filter,
      counts,
      page,
      pageSize: CONSOLE_ACTIVITY_PAGE_SIZE,
      total,
      totalPages,
      events: rows.map(activityEntry),
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

      // 0.9.0-H: a moderator's restriction comes first, and says so plainly.
      const sender = await assertCanCommunicate(tx, owner.accountId, now);

      if (await isCommunicationBlocked(tx, owner.accountId, target.accountId)) {
        throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not available.');
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

      const flags = await checkDirectMessage(tx, {
        senderPlayerId: owner.id,
        recipientPlayerId: target.id,
        senderCreatedAt: sender.createdAt,
        subject: input.subject,
        body: input.body,
        recentCount,
      }, now);
      // A recipient's mute is private: the message is delivered straight to their
      // Archived folder, with no unread count and no alert, and the sender is not told.
      const mutedByRecipient = await tx.playerMute.findUnique({
        where: { muterAccountId_mutedAccountId: { muterAccountId: target.accountId, mutedAccountId: owner.accountId } },
        select: { id: true },
      });

      const created = await tx.directMessage.create({
        data: {
          roundId: owner.roundId,
          senderId: owner.id,
          recipientId: target.id,
          actionId: input.actionId,
          subject: input.subject,
          body: input.body,
          createdAt: now,
          ...(mutedByRecipient ? { recipientArchivedAt: now } : {}),
        },
        select: messageSelect,
      });
      await flagMessage(tx, created.id, flags, now);
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
      where: { id: messageId, roundId: owner.roundId, recipientHiddenAt: null },
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
        OR: [{ senderId: owner.id, senderHiddenAt: null }, { recipientId: owner.id, recipientHiddenAt: null }],
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
      where: { id: messageId, roundId: owner.roundId, recipientHiddenAt: null },
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
      // A submitted report is immutable evidence. Retrying is a no-op.
      update: {},
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
    const muteRows = await prisma.playerMute.findMany({
      where: { muterAccountId: owner.accountId, muted: { isActive: true, roundPlayers: { some: { roundId: owner.roundId } } } },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        muted: { select: { roundPlayers: { where: { roundId: owner.roundId }, take: 1, select: { publicPimpId: true, displayName: true } } } },
      },
    });
    const muted: MutedPlayerDto[] = muteRows.flatMap((row) => {
      const player = row.muted.roundPlayers[0];
      return player ? [{ publicPimpId: player.publicPimpId, displayName: player.displayName, mutedAt: row.createdAt.toISOString() }] : [];
    });
    return { blocked, muted };
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

  /** 0.9.0-H. Quietly archive this player's future messages. Already-delivered mail is untouched. */
  async mute(prisma: PrismaClient, accountId: string, targetPublicPimpId: number): Promise<ConsoleBlocksDto> {
    const owner = await currentPlayer(prisma, accountId);
    const target = await currentTarget(prisma, owner.roundId, targetPublicPimpId);
    if (target.id === owner.id) throw AppError.badRequest('MUTE_SELF', 'You cannot mute yourself.');
    await prisma.playerMute.upsert({
      where: { muterAccountId_mutedAccountId: { muterAccountId: owner.accountId, mutedAccountId: target.accountId } },
      create: { muterAccountId: owner.accountId, mutedAccountId: target.accountId },
      update: {},
    });
    return PimpConsoleService.blocks(prisma, accountId);
  },

  async unmute(prisma: PrismaClient, accountId: string, targetPublicPimpId: number): Promise<ConsoleBlocksDto> {
    const owner = await currentPlayer(prisma, accountId);
    const target = await currentTarget(prisma, owner.roundId, targetPublicPimpId);
    await prisma.playerMute.deleteMany({ where: { muterAccountId: owner.accountId, mutedAccountId: target.accountId } });
    return PimpConsoleService.blocks(prisma, accountId);
  },

  /**
   * 0.9.0-H. "Delete conversation": every message between the two players this
   * round disappears from the viewer's folders for good. The other side keeps
   * their copy, and reports keep their evidence.
   */
  async hideConversation(
    prisma: PrismaClient,
    accountId: string,
    counterpartPublicPimpId: number,
    now = new Date(),
  ): Promise<{ hidden: number }> {
    const owner = await currentPlayer(prisma, accountId);
    const counterpart = await prisma.roundPlayer.findFirst({
      where: { roundId: owner.roundId, publicPimpId: counterpartPublicPimpId },
      select: { id: true },
    });
    if (!counterpart || counterpart.id === owner.id) {
      throw AppError.notFound('PLAYER_NOT_FOUND', 'That conversation does not exist.');
    }
    const [sent, received] = await prisma.$transaction([
      prisma.directMessage.updateMany({
        where: { senderId: owner.id, recipientId: counterpart.id, senderHiddenAt: null },
        data: { senderHiddenAt: now },
      }),
      prisma.directMessage.updateMany({
        where: { recipientId: owner.id, senderId: counterpart.id, recipientHiddenAt: null },
        data: { recipientHiddenAt: now },
      }),
    ]);
    return { hidden: sent.count + received.count };
  },
};
