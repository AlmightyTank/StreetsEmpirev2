import type { Prisma, PrismaClient } from '@prisma/client';
import type { AdminReportSummaryDto } from '@streets/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAccountService } from '../admin-account.service.js';
import { AdminAuditService } from '../admin-audit.service.js';
import { AdminModerationService } from '../admin-moderation.service.js';
import { DiscordStaffService } from '../discord-staff.service.js';

const now = new Date('2026-10-10T15:00:00.000Z');
const admin = { id: 'acct-admin', username: 'admin', isAdmin: true };

type FakeReport = { resolvedAt: Date | null; senderAccountId: string };

/**
 * A database with one report. `closedMeanwhile` makes the close find nothing left
 * open, as when another admin closed it while this transaction waited on its rows.
 */
function fakePrisma(options: { account?: typeof admin | null; report?: FakeReport | null; closedMeanwhile?: boolean }) {
  const report = options.report === undefined ? { resolvedAt: null, senderAccountId: 'acct-sender' } : options.report;
  const tx = {
    playerMessageReport: {
      findUnique: async () => report && { id: 'rep1', messageId: 'msg1', resolvedAt: report.resolvedAt, message: { sender: { accountId: report.senderAccountId } } },
      findMany: async () => [{ id: 'rep1' }],
      updateMany: async () => ({ count: options.closedMeanwhile ? 0 : 1 }),
    },
  };
  return {
    account: { findFirst: async () => (options.account === undefined ? admin : options.account) },
    $transaction: async <T>(work: (db: unknown) => Promise<T>) => work(tx),
  } as unknown as PrismaClient;
}

function spies() {
  const calls: string[] = [];
  vi.spyOn(DiscordStaffService, 'queue').mockImplementation(async () => { calls.push('queue'); });
  const audit = vi.spyOn(AdminAuditService, 'record').mockImplementation(async () => { calls.push('audit'); return {} as never; });
  const mute = vi.spyOn(AdminAccountService, 'muteCommsWithin').mockImplementation(async () => { calls.push('mute'); });
  return { calls, audit, mute };
}

afterEach(() => vi.restoreAllMocks());

describe('AdminModerationService.actFromDiscord', () => {
  it('closes the report as actioned, then mutes the sender for a day, in one transaction, as the linked admin', async () => {
    const { calls, audit, mute } = spies();
    await AdminModerationService.actFromDiscord(fakePrisma({}), '123456789012345678', 'rep1', 'mute-1d', 'Threats, read in admin', now);
    expect(calls).toEqual(['queue', 'audit', 'mute']);
    expect(audit).toHaveBeenCalledWith(expect.anything(), admin, expect.objectContaining({ action: 'report.resolve', after: expect.objectContaining({ resolution: 'ACTIONED' }) }));
    expect(mute).toHaveBeenCalledWith(expect.anything(), admin, 'acct-sender', '1d', 'Threats, read in admin', now);
  });

  it('dismisses without muting', async () => {
    const { audit, mute } = spies();
    await AdminModerationService.actFromDiscord(fakePrisma({}), '123456789012345678', 'rep1', 'dismiss', 'Banter between allies', now);
    expect(mute).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.anything(), admin, expect.objectContaining({ reason: 'Banter between allies', after: expect.objectContaining({ resolution: 'DISMISSED' }) }));
  });

  it('refuses members who are not linked admins, and reports already closed, before muting anyone', async () => {
    const { mute } = spies();
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ account: null }), '1', 'rep1', 'mute-1d', 'note!', now)).rejects.toMatchObject({ code: 'DISCORD_NOT_LINKED' });
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ account: { ...admin, isAdmin: false } }), '1', 'rep1', 'mute-1d', 'note!', now)).rejects.toMatchObject({ statusCode: 403 });
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ report: { resolvedAt: now, senderAccountId: 'acct-sender' } }), '1', 'rep1', 'mute-1d', 'note!', now)).rejects.toMatchObject({ code: 'REPORT_RESOLVED' });
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ report: null }), '1', 'rep1', 'dismiss', 'note!', now)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' });
    expect(mute).not.toHaveBeenCalled();
  });

  it('does not mute when another admin closed the report while this click waited on it', async () => {
    const { calls, mute } = spies();
    await expect(AdminModerationService.actFromDiscord(fakePrisma({ closedMeanwhile: true }), '1', 'rep1', 'mute-1d', 'note!', now)).rejects.toMatchObject({ code: 'REPORT_RESOLVED' });
    expect(mute).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe('AdminAccountService.muteCommsWithin', () => {
  const sender = { id: 'acct-sender', username: 'Loud_Guy', isAdmin: false, commsMutedUntil: null as Date | null, commsMutedPermanent: false };

  function fakeTx(before: typeof sender) {
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...before, ...data }));
    const tx = {
      $executeRaw: async () => 0,
      $queryRaw: async () => [],
      account: {
        findUnique: async ({ where }: { where: { id: string } }) => (where.id === admin.id ? { isAdmin: true, isActive: true } : before),
        update,
      },
    };
    return { tx: tx as unknown as Prisma.TransactionClient, update };
  }

  it('mutes an unmuted sender, or one whose mute ends sooner, for a day', async () => {
    const audit = vi.spyOn(AdminAuditService, 'record').mockResolvedValue({} as never);
    for (const before of [sender, { ...sender, commsMutedUntil: new Date(now.getTime() + 60 * 60_000) }]) {
      const { tx, update } = fakeTx(before);
      await AdminAccountService.muteCommsWithin(tx, admin, sender.id, '1d', 'Threats', now);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ commsMutedUntil: new Date(now.getTime() + 24 * 60 * 60_000), commsMutedPermanent: false }),
      }));
    }
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it('keeps a longer or permanent mute instead of cutting it to a day, and audits that it did', async () => {
    const audit = vi.spyOn(AdminAuditService, 'record').mockResolvedValue({} as never);
    for (const before of [{ ...sender, commsMutedUntil: new Date(now.getTime() + 7 * 24 * 60 * 60_000) }, { ...sender, commsMutedPermanent: true }]) {
      const { tx, update } = fakeTx(before);
      await AdminAccountService.muteCommsWithin(tx, admin, sender.id, '1d', 'Threats', now);
      expect(update).not.toHaveBeenCalled();
    }
    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenLastCalledWith(expect.anything(), admin, expect.objectContaining({ action: 'account.comms-mute', after: expect.objectContaining({ keptLongerMute: true }) }));
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
