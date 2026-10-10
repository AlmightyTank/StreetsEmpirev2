import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { SupportTicketService } from '../support-ticket.service.js';

const now = new Date('2026-10-10T15:00:00.000Z');

type Ticket = {
  id: string; discordId: string; discordName: string; accountId: string | null; subject: string;
  threadId: string | null; staffMessageId: string | null; createdAt: Date; closedAt: Date | null; closedByName: string | null;
};

function fakePrisma(tickets: Ticket[], accounts: Array<{ discordId: string; isAdmin: boolean; isActive?: boolean }> = []) {
  return {
    supportTicket: {
      findFirst: async ({ where }: { where: { discordId: string; closedAt: null } }) => tickets.find((row) => row.discordId === where.discordId && !row.closedAt) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => tickets.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: { data: Omit<Ticket, 'id' | 'threadId' | 'staffMessageId' | 'closedAt' | 'closedByName'> }) => {
        const row = { ...data, id: `t${tickets.length + 1}`, threadId: null, staffMessageId: null, closedAt: null, closedByName: null };
        tickets.push(row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => tickets.splice(tickets.findIndex((row) => row.id === where.id), 1)[0],
      deleteMany: async ({ where }: { where: { id: string; threadId: null } }) => {
        const index = tickets.findIndex((row) => row.id === where.id && !row.threadId);
        if (index >= 0) tickets.splice(index, 1);
        return { count: index >= 0 ? 1 : 0 };
      },
      updateMany: async ({ where, data }: { where: { id: string; threadId: null }; data: Partial<Ticket> }) => {
        const row = tickets.find((ticket) => ticket.id === where.id && !ticket.threadId);
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Ticket> }) => Object.assign(tickets.find((row) => row.id === where.id)!, data),
      count: async ({ where }: { where: { discordId: string; id: { not: string } } }) => tickets.filter((row) => row.discordId === where.discordId && row.id !== where.id.not).length,
    },
    account: {
      // Unlinked members: there is no account behind their Discord id.
      findUnique: async () => null,
      findFirst: async ({ where }: { where: { discordId: string } }) => {
        const account = accounts.find((row) => row.discordId === where.discordId && row.isActive !== false);
        return account ? { isAdmin: account.isAdmin } : null;
      },
    },
  } as unknown as PrismaClient;
}

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 't1', discordId: 'member', discordName: 'Member', accountId: null, subject: 'Help please', threadId: '111', staffMessageId: null,
  createdAt: new Date(now.getTime() - 60_000), closedAt: null, closedByName: null, ...overrides,
});

describe('SupportTicketService.open', () => {
  it('opens a ticket for a member without a game account, with what staff need', async () => {
    const tickets: Ticket[] = [ticket({ id: 'old', closedAt: now })];
    const opened = await SupportTicketService.open(fakePrisma(tickets), { discordId: 'member', discordName: 'Member', subject: 'Cannot sign in' }, now);
    expect(opened).toMatchObject({
      ticket: { discordId: 'member', subject: 'Cannot sign in', threadId: null, closedAt: null },
      context: { account: null, player: null, openReportsAgainst: 0, pastTickets: 1 },
    });
  });

  it('points at their open ticket instead of opening a second', async () => {
    const tickets = [ticket()];
    expect(await SupportTicketService.open(fakePrisma(tickets), { discordId: 'member', discordName: 'Member', subject: 'Again' }, now)).toEqual({
      existing: expect.objectContaining({ id: 't1', threadId: '111' }),
    });
    expect(tickets).toHaveLength(1);
  });

  it('replaces a ticket the bot never finished making', async () => {
    const tickets = [ticket({ id: 'half', threadId: null })];
    const opened = await SupportTicketService.open(fakePrisma(tickets), { discordId: 'member', discordName: 'Member', subject: 'Try again' }, now);
    expect('ticket' in opened && opened.ticket.subject).toBe('Try again');
    expect(tickets.map((row) => row.id)).not.toContain('half');
  });
});

describe('SupportTicketService.attach and close', () => {
  it('records the thread once', async () => {
    const tickets = [ticket({ threadId: null })];
    const prisma = fakePrisma(tickets);
    await SupportTicketService.attach(prisma, 't1', { threadId: '222', staffMessageId: '333' });
    expect(tickets[0]).toMatchObject({ threadId: '222', staffMessageId: '333' });
    await expect(SupportTicketService.attach(prisma, 't1', { threadId: '444', staffMessageId: null })).rejects.toMatchObject({ code: 'TICKET_ATTACHED' });
  });

  it('lets the member who opened it or a game admin close it, once', async () => {
    const tickets = [ticket(), ticket({ id: 't2', discordId: 'other' })];
    const prisma = fakePrisma(tickets, [{ discordId: 'admin', isAdmin: true }, { discordId: 'player', isAdmin: false }]);
    await expect(SupportTicketService.close(prisma, 't1', { discordId: 'player', name: 'Player' }, now)).rejects.toMatchObject({ statusCode: 403 });
    expect(await SupportTicketService.close(prisma, 't1', { discordId: 'member', name: 'Member' }, now)).toMatchObject({ closedAt: now.toISOString(), closedByName: 'Member' });
    await expect(SupportTicketService.close(prisma, 't1', { discordId: 'member', name: 'Member' }, now)).rejects.toMatchObject({ code: 'TICKET_CLOSED' });
    expect(await SupportTicketService.close(prisma, 't2', { discordId: 'admin', name: 'Admin' }, now)).toMatchObject({ closedByName: 'Admin' });
    await expect(SupportTicketService.close(prisma, 'missing', { discordId: 'admin', name: 'Admin' }, now)).rejects.toMatchObject({ code: 'TICKET_NOT_FOUND' });
  });
});
