import type { PrismaClient } from '@prisma/client';
import type { AdminReportSummaryDto } from '@streets/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAccountService } from '../admin-account.service.js';
import { AdminModerationService } from '../admin-moderation.service.js';
import { DiscordStaffService } from '../discord-staff.service.js';

const now = new Date('2026-10-10T15:00:00.000Z');
const admin = { id: 'acct-admin', username: 'admin', isAdmin: true };

function fakePrisma(options: { account?: typeof admin | null; report?: { resolvedAt: Date | null; senderAccountId: string } | null }) {
  return {
    account: { findFirst: async () => (options.account === undefined ? admin : options.account) },
    playerMessageReport: {
      findUnique: async () => (options.report === undefined
        ? { resolvedAt: null, message: { sender: { accountId: 'acct-sender' } } }
        : options.report && { resolvedAt: options.report.resolvedAt, message: { sender: { accountId: options.report.senderAccountId } } }),
    },
  } as unknown as PrismaClient;
}

afterEach(() => vi.restoreAllMocks());

describe('AdminModerationService.actFromDiscord', () => {
  it('mutes the sender for a day, then closes the report as actioned, as the linked admin', async () => {
    const calls: string[] = [];
    const mute = vi.spyOn(AdminAccountService, 'muteComms').mockImplementation(async () => { calls.push('mute'); return {} as never; });
    const resolve = vi.spyOn(AdminModerationService, 'resolve').mockImplementation(async () => { calls.push('resolve'); return {} as never; });
    await AdminModerationService.actFromDiscord(fakePrisma({}), '123456789012345678', 'rep1', 'mute-1d', 'Threats, read in admin', now);
    expect(calls).toEqual(['mute', 'resolve']);
    expect(mute).toHaveBeenCalledWith(expect.anything(), admin, 'acct-sender', '1d', 'Threats, read in admin', now);
    expect(resolve).toHaveBeenCalledWith(expect.anything(), admin, 'rep1', 'ACTIONED', 'Threats, read in admin', now);
  });

  it('dismisses without muting', async () => {
    const mute = vi.spyOn(AdminAccountService, 'muteComms');
    const resolve = vi.spyOn(AdminModerationService, 'resolve').mockResolvedValue({} as never);
    await AdminModerationService.actFromDiscord(fakePrisma({}), '123456789012345678', 'rep1', 'dismiss', 'Banter between allies', now);
    expect(mute).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith(expect.anything(), admin, 'rep1', 'DISMISSED', 'Banter between allies', now);
  });

  it('refuses members who are not linked admins, and reports already closed, before muting anyone', async () => {
    const mute = vi.spyOn(AdminAccountService, 'muteComms');
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ account: null }), '1', 'rep1', 'mute-1d', 'note!', now)).rejects.toMatchObject({ code: 'DISCORD_NOT_LINKED' });
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ account: { ...admin, isAdmin: false } }), '1', 'rep1', 'mute-1d', 'note!', now)).rejects.toMatchObject({ statusCode: 403 });
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ report: { resolvedAt: now, senderAccountId: 'acct-sender' } }), '1', 'rep1', 'mute-1d', 'note!', now)).rejects.toMatchObject({ code: 'REPORT_RESOLVED' });
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ report: null }), '1', 'rep1', 'dismiss', 'note!', now)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' });
    expect(mute).not.toHaveBeenCalled();
  });
});

describe('DiscordStaffService.claim for message reports', () => {
  const summary = { id: 'rep1', source: 'PLAYER', reason: 'Threats', sender: { displayName: 'Loud_Guy' }, resolution: null } as unknown as AdminReportSummaryDto;

  it('posts a report with an admin link, and edits it once closed', async () => {
    vi.spyOn(AdminModerationService, 'summary').mockResolvedValue(summary);
    const posts = [
      { id: 'p1', kind: 'MESSAGE_REPORT', targetId: 'rep1', createdAt: new Date(now.getTime() - 60_000), claimedAt: null as Date | null, messageId: null as string | null },
    ];
    const db = {
      discordStaffPost: {
        findMany: async () => posts.filter((post) => !post.claimedAt),
        updateMany: async ({ data }: { data: { claimedAt: Date } }) => { for (const post of posts) post.claimedAt ??= data.claimedAt; return { count: 1 }; },
        findFirst: async ({ where }: { where: { kind: string; targetId: string } }) => posts.find((post) => post.kind === where.kind && post.targetId === where.targetId && post.messageId) ?? null,
      },
      $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
    };
    const prisma = db as unknown as PrismaClient;
    const [first] = await DiscordStaffService.claim(prisma, now);
    expect(first).toMatchObject({ id: 'p1', kind: 'MESSAGE_REPORT', editMessageId: null, messageReport: { id: 'rep1', reason: 'Threats' } });
    expect(first!.messageReport!.url).toMatch(/\/game\/admin\/reports$/);

    posts[0]!.messageId = '1234567890123456789';
    posts.push({ id: 'p2', kind: 'MESSAGE_REPORT_RESOLVED', targetId: 'rep1', createdAt: now, claimedAt: null, messageId: null });
    expect(await DiscordStaffService.claim(prisma, now)).toMatchObject([{ id: 'p2', editMessageId: '1234567890123456789', messageReport: { id: 'rep1' } }]);
  });
});
