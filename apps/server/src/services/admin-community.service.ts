import type { PrismaClient } from '@prisma/client';
import type { AdminCommunityDto } from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { DiscordModerationService } from './discord-moderation.service.js';
import { forumProfileUrl } from './forum-link.service.js';
import { ForumModerationService } from './forum-moderation.service.js';

/** How many of a player's support tickets the account page lists. */
export const COMMUNITY_TICKETS = 10;

/**
 * The player across the forum and Discord, for the admin account page. Loaded apart
 * from the account itself, since it asks the forum and the bot and either can be slow.
 */
export const AdminCommunityService = {
  async load(prisma: PrismaClient, accountId: string, deps: { fetch?: typeof fetch } = {}): Promise<AdminCommunityDto> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { discordId: true, forumLink: { select: { forumOrigin: true, forumUserId: true, forumUsername: true } } },
    });
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');
    const link = account.forumLink?.forumOrigin === env.forum.origin ? account.forumLink : null;
    const fetcher = deps.fetch ?? fetch;

    const [forum, discord, tickets] = await Promise.all([
      link ? ForumModerationService.status(link.forumUserId, fetcher) : null,
      account.discordId ? DiscordModerationService.member(account.discordId, fetcher) : null,
      prisma.supportTicket.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, take: COMMUNITY_TICKETS }),
    ]);

    return {
      forum: link
        ? {
          linked: true,
          username: link.forumUsername,
          profileUrl: forumProfileUrl(link),
          moderationEnabled: env.forum.moderation.enabled,
          problem: forum && !forum.ok ? forum.problem : null,
          suspendedUntil: forum?.ok ? forum.suspendedUntil : null,
        }
        : { linked: false },
      discord: account.discordId
        ? {
          linked: true,
          discordId: account.discordId,
          moderationEnabled: env.discordBot.push.enabled,
          problem: discord && !discord.ok ? discord.problem : discord?.ok ? discord.member.problem : null,
          inServer: Boolean(discord?.ok && discord.member.inServer),
          displayName: discord?.ok ? discord.member.displayName : null,
          timedOutUntil: discord?.ok ? discord.member.timedOutUntil : null,
          canModerate: Boolean(discord?.ok && discord.member.canModerate),
        }
        : { linked: false },
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        createdAt: ticket.createdAt.toISOString(),
        closedAt: ticket.closedAt?.toISOString() ?? null,
        closedByName: ticket.closedByName,
        threadUrl: ticket.threadId && env.discordBot.guildId ? `https://discord.com/channels/${env.discordBot.guildId}/${ticket.threadId}` : null,
      })),
    };
  },
};
