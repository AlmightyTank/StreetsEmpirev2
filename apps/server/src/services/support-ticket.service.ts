import type { PrismaClient, SupportTicket } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { commsMuted } from './communication-guard.js';
import { RoundService } from './round.service.js';
import { gameUrl, playerUrl } from './standings.js';

export interface SupportTicketDto {
  id: string;
  discordId: string;
  discordName: string;
  subject: string;
  threadId: string | null;
  staffMessageId: string | null;
  createdAt: string;
  closedAt: string | null;
  closedByName: string | null;
}

/**
 * What staff see beside a new ticket, in the staff channel only: never in the
 * ticket thread, which the member can read.
 */
export interface SupportContextDto {
  account: {
    username: string;
    createdAt: string;
    lastLoginAt: string | null;
    emailVerified: boolean;
    isAdmin: boolean;
    /** Plain-words restrictions in force: closed, banned, suspended, muted. Empty when none. */
    restrictions: string[];
    url: string;
  } | null;
  player: { roundName: string; displayName: string; publicPimpId: number; url: string } | null;
  bugReports: { open: number; recent: Array<{ summary: string; resolution: string | null }> };
  /** Open private-message reports against their messages. */
  openReportsAgainst: number;
  pastTickets: number;
}

export type OpenTicketResult = { existing: SupportTicketDto } | { ticket: SupportTicketDto; context: SupportContextDto };

function toDto(row: SupportTicket): SupportTicketDto {
  return {
    id: row.id,
    discordId: row.discordId,
    discordName: row.discordName,
    subject: row.subject,
    threadId: row.threadId,
    staffMessageId: row.staffMessageId,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closedByName: row.closedByName,
  };
}

const day = (date: Date) => date.toISOString().slice(0, 10);

async function context(prisma: PrismaClient, discordId: string, ticketId: string, now: Date): Promise<SupportContextDto> {
  // Any account linked to them, closed or banned ones included: that is often the problem.
  const account = await prisma.account.findUnique({ where: { discordId } });
  const pastTickets = await prisma.supportTicket.count({ where: { discordId, id: { not: ticketId } } });
  if (!account) return { account: null, player: null, bugReports: { open: 0, recent: [] }, openReportsAgainst: 0, pastTickets };

  const round = await RoundService.getCurrent(prisma, now);
  const [player, openBugs, recentBugs, openReportsAgainst] = await Promise.all([
    round ? prisma.roundPlayer.findFirst({ where: { roundId: round.id, accountId: account.id }, select: { displayName: true, publicPimpId: true } }) : null,
    prisma.bugReport.count({ where: { accountId: account.id, resolvedAt: null } }),
    prisma.bugReport.findMany({ where: { accountId: account.id }, orderBy: { createdAt: 'desc' }, take: 3, select: { summary: true, resolution: true } }),
    prisma.playerMessageReport.count({ where: { resolvedAt: null, message: { sender: { accountId: account.id } } } }),
  ]);

  const restrictions: string[] = [];
  if (!account.isActive) restrictions.push(account.closedAt ? `Account closed ${day(account.closedAt)}` : 'Account deactivated');
  if (account.bannedAt) restrictions.push(`Banned ${day(account.bannedAt)}${account.bannedReason ? `: ${account.bannedReason}` : ''}`);
  if (account.suspendedUntil && account.suspendedUntil > now) {
    restrictions.push(`Suspended until ${day(account.suspendedUntil)}${account.suspendedReason ? `: ${account.suspendedReason}` : ''}`);
  }
  if (commsMuted(account, now)) restrictions.push(account.commsMutedPermanent ? 'Messaging muted for good' : `Messaging muted until ${day(account.commsMutedUntil!)}`);

  return {
    account: {
      username: account.username,
      createdAt: account.createdAt.toISOString(),
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      emailVerified: Boolean(account.emailVerifiedAt),
      isAdmin: account.isAdmin,
      restrictions,
      url: gameUrl(`/game/admin/accounts/${account.id}`),
    },
    player: round && player ? { roundName: round.name, displayName: player.displayName, publicPimpId: player.publicPimpId, url: playerUrl(player.publicPimpId) } : null,
    bugReports: { open: openBugs, recent: recentBugs },
    openReportsAgainst,
    pastTickets,
  };
}

/** /support: private Discord threads between one member and staff, kept here so each member has one open at a time. */
export const SupportTicketService = {
  /** Their open ticket if they have one; otherwise a new one, with what staff should know about them. */
  async open(prisma: PrismaClient, input: { discordId: string; discordName: string; subject: string }, now = new Date()): Promise<OpenTicketResult> {
    const open = await prisma.supportTicket.findFirst({ where: { discordId: input.discordId, closedAt: null }, orderBy: { createdAt: 'desc' } });
    if (open?.threadId) return { existing: toDto(open) };
    // Opened but never got a thread (the bot failed part way): start again.
    if (open) await prisma.supportTicket.delete({ where: { id: open.id } });
    const account = await prisma.account.findUnique({ where: { discordId: input.discordId }, select: { id: true } });
    const row = await prisma.supportTicket.create({
      data: { discordId: input.discordId, discordName: input.discordName, subject: input.subject, accountId: account?.id ?? null, createdAt: now },
    });
    return { ticket: toDto(row), context: await context(prisma, input.discordId, row.id, now) };
  },

  /** The bot made the thread (and maybe the staff post): the ticket is real now. */
  async attach(prisma: PrismaClient, ticketId: string, input: { threadId: string; staffMessageId: string | null }): Promise<void> {
    const { count } = await prisma.supportTicket.updateMany({ where: { id: ticketId, threadId: null }, data: input });
    if (count !== 1) throw AppError.conflict('TICKET_ATTACHED', 'That ticket already has a thread.');
  },

  /** The bot could not make the thread: forget the ticket so the member can try again. */
  async abandon(prisma: PrismaClient, ticketId: string): Promise<void> {
    await prisma.supportTicket.deleteMany({ where: { id: ticketId, threadId: null } });
  },

  /** The member who opened it, or a linked game admin, closes it. */
  async close(prisma: PrismaClient, ticketId: string, input: { discordId: string; name: string }, now = new Date()): Promise<SupportTicketDto> {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw AppError.notFound('TICKET_NOT_FOUND', 'That ticket does not exist.');
    if (ticket.closedAt) throw AppError.conflict('TICKET_CLOSED', 'That ticket is already closed.');
    if (ticket.discordId !== input.discordId && !(await SupportTicketService.isStaff(prisma, input.discordId))) {
      throw AppError.forbidden('Only the member who opened it or a game admin can close this ticket.');
    }
    const row = await prisma.supportTicket.update({ where: { id: ticketId }, data: { closedAt: now, closedByName: input.name.slice(0, 100) } });
    return toDto(row);
  },

  /** Staff, for the bot: a linked, active game admin. */
  async isStaff(prisma: PrismaClient, discordId: string): Promise<boolean> {
    const account = await prisma.account.findFirst({ where: { discordId, isActive: true }, select: { isAdmin: true } });
    return Boolean(account?.isAdmin);
  },
};
