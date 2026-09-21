import type { PrismaClient } from '@prisma/client';
import type { AdminDiscordStatusDto } from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { wakeDiscordBot } from './discord-bot-push.service.js';

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

/**
 * What the Discord bot still has to pick up. A queue whose oldest item keeps
 * getting older means push or polling is not clearing it.
 */
export const AdminDiscordService = {
  async status(prisma: PrismaClient, now = new Date()): Promise<AdminDiscordStatusDto> {
    const [news, oldestNews, battles, oldestBattle, dms, oldestDm, roundEndings, resyncs, recentResyncs, linkedAccounts] = await Promise.all([
      prisma.gameNews.count({ where: { discordPostedAt: null, publishedAt: { lte: now } } }),
      prisma.gameNews.findFirst({ where: { discordPostedAt: null, publishedAt: { lte: now } }, orderBy: { publishedAt: 'asc' }, select: { publishedAt: true } }),
      prisma.raidBattle.count({ where: { discordPostedAt: null, voidedAt: null } }),
      prisma.raidBattle.findFirst({ where: { discordPostedAt: null, voidedAt: null }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      prisma.notificationOutbox.count({ where: { channel: 'DISCORD', claimedAt: null } }),
      prisma.notificationOutbox.findFirst({ where: { channel: 'DISCORD', claimedAt: null }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      prisma.round.count({ where: { discordEndedAt: null, status: { in: ['ENDED', 'ARCHIVED'] } } }),
      prisma.discordResyncRequest.count({ where: { claimedAt: null } }),
      prisma.discordResyncRequest.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 }),
      prisma.account.count({ where: { discordId: { not: null }, isActive: true } }),
    ]);

    return {
      botApiEnabled: env.discordBot.enabled,
      linkedAccounts,
      queues: {
        news: { pending: news, oldestAt: iso(oldestNews?.publishedAt) },
        battles: { pending: battles, oldestAt: iso(oldestBattle?.createdAt) },
        dms: { pending: dms, oldestAt: iso(oldestDm?.createdAt) },
        roundEndings,
        resyncs,
      },
      recentResyncs: recentResyncs.map((row) => ({
        id: row.id,
        everyone: row.discordId === null,
        requestedByUsername: row.requestedByUsername,
        createdAt: row.createdAt.toISOString(),
        claimedAt: iso(row.claimedAt),
      })),
    };
  },

  /** Queue a role resync for one linked account, or for every member when no account is given. */
  async requestResync(prisma: PrismaClient, actor: AuditActor, accountId?: string, reason?: string): Promise<AdminDiscordStatusDto> {
    if (!env.discordBot.enabled) {
      throw AppError.badRequest('DISCORD_BOT_DISABLED', 'The Discord bot API is not configured on this server, so nothing would pick the request up.');
    }
    await prisma.$transaction(async (tx) => {
      let discordId: string | null = null;
      if (accountId) {
        const account = await tx.account.findUnique({ where: { id: accountId }, select: { username: true, discordId: true } });
        if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');
        if (!account.discordId) throw AppError.conflict('DISCORD_NOT_LINKED', `${account.username} has not linked Discord.`);
        discordId = account.discordId;
      }
      const request = await tx.discordResyncRequest.create({
        data: { discordId, requestedByAccountId: actor.id, requestedByUsername: actor.username },
      });
      await AdminAuditService.record(tx, actor, {
        action: 'discord.resync',
        targetType: accountId ? 'account' : 'discord',
        targetId: accountId ?? null,
        reason: reason ?? null,
        after: { requestId: request.id, everyone: discordId === null },
      });
    });
    wakeDiscordBot('resync');
    return AdminDiscordService.status(prisma);
  },
};
