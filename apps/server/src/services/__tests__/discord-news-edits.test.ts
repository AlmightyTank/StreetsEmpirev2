import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { DiscordBotService } from '../discord-bot.service.js';

const at = new Date('2026-10-17T20:00:00.000Z');

function fakeNews() {
  const row = {
    id: 'news-1', title: 'Patch notes 2.1.4', body: '- Fixed navigation', isPinned: false,
    publishedAt: at, updatedAt: at, discordPostedAt: at,
    discordMessageId: null as string | null,
    discordEditQueuedAt: null as Date | null,
    discordEditClaimedAt: null as Date | null,
    discordEditError: null as string | null,
    createdBy: { username: 'admin' },
  };
  const db = {
    gameNews: {
      findUnique: async () => ({ ...row }),
      update: async ({ data }: { data: Partial<typeof row> }) => {
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: {
        where: {
          id: string; discordEditQueuedAt?: Date | null;
          OR?: Array<{ discordEditClaimedAt?: null | { lt: Date } }>;
        };
        data: Partial<typeof row>;
      }) => {
        if (where.id !== row.id) return { count: 0 };
        if ('discordEditQueuedAt' in where && where.discordEditQueuedAt?.getTime() !== row.discordEditQueuedAt?.getTime()) return { count: 0 };
        if (where.OR && row.discordEditClaimedAt && !(row.discordEditClaimedAt < where.OR[1]!.discordEditClaimedAt!.lt)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      findMany: async ({ where }: { where: { OR: Array<{ discordEditClaimedAt?: null | { lt: Date } }> } }) => {
        const expired = row.discordEditClaimedAt && row.discordEditClaimedAt < where.OR[1]!.discordEditClaimedAt!.lt;
        return row.discordMessageId && row.discordEditQueuedAt && !row.discordEditError && (!row.discordEditClaimedAt || expired) ? [{ ...row }] : [];
      },
    },
    $transaction: async <T>(task: (tx: unknown) => Promise<T>) => task(db),
  };
  return { row, prisma: db as unknown as PrismaClient };
}

describe('Discord news message sync', () => {
  it('stores the original message ID, leases an edit, then clears it on success', async () => {
    const { row, prisma } = fakeNews();
    await DiscordBotService.newsPosted(prisma, row.id, '1234567890123456789');
    expect(row.discordMessageId).toBe('1234567890123456789');
    row.discordEditQueuedAt = new Date(at.getTime() + 60_000);
    row.body = '- Updated content';

    const [claimed] = await DiscordBotService.claimNewsEdits(prisma);
    expect(claimed).toMatchObject({
      id: row.id, messageId: '1234567890123456789', body: '- Updated content',
    });
    expect(row.discordEditQueuedAt).not.toBeNull();
    expect(row.discordEditClaimedAt).not.toBeNull();
    expect(await DiscordBotService.claimNewsEdits(prisma)).toEqual([]);

    await DiscordBotService.newsEditPosted(prisma, row.id, claimed!.queuedAt);
    expect(row.discordEditQueuedAt).toBeNull();
    expect(row.discordEditClaimedAt).toBeNull();
  });

  it('keeps a newer edit when an older revision is acknowledged', async () => {
    const { row, prisma } = fakeNews();
    row.discordMessageId = '1234567890123456789';
    row.discordEditQueuedAt = new Date(at.getTime() + 60_000);
    const [claimed] = await DiscordBotService.claimNewsEdits(prisma);
    row.discordEditQueuedAt = new Date(at.getTime() + 120_000);
    row.body = '- Newer version';

    await DiscordBotService.newsEditPosted(prisma, row.id, claimed!.queuedAt);
    expect(row.discordEditQueuedAt?.toISOString()).toBe(new Date(at.getTime() + 120_000).toISOString());

    // Old lease expires if the edit completed but the bot missed an acknowledgement.
    row.discordEditClaimedAt = new Date(Date.now() - 3 * 60_000);
    const [next] = await DiscordBotService.claimNewsEdits(prisma);
    expect(next?.body).toBe('- Newer version');
  });

  it('retries a leased edit after the bot crashes before acknowledging', async () => {
    const { row, prisma } = fakeNews();
    row.discordMessageId = '1234567890123456789';
    row.discordEditQueuedAt = new Date(at.getTime() + 60_000);
    const [claimed] = await DiscordBotService.claimNewsEdits(prisma);
    expect(claimed).toBeTruthy();
    expect(await DiscordBotService.claimNewsEdits(prisma)).toEqual([]);
    row.discordEditClaimedAt = new Date(Date.now() - 3 * 60_000);
    expect((await DiscordBotService.claimNewsEdits(prisma))[0]?.queuedAt).toBe(claimed!.queuedAt);
  });

  it('keeps failed edits visible for staff rather than reposting', async () => {
    const { row, prisma } = fakeNews();
    row.discordMessageId = '1234567890123456789';
    row.discordEditQueuedAt = new Date(at.getTime() + 60_000);
    await DiscordBotService.newsEditFailed(prisma, row.id, 'Missing Read Message History', row.discordEditQueuedAt.toISOString());
    expect(row.discordEditError).toContain('Read Message History');
    expect(await DiscordBotService.claimNewsEdits(prisma)).toEqual([]);
  });

  it('reconciles copy edited during the first Discord send', async () => {
    const { row, prisma } = fakeNews();
    row.updatedAt = new Date(at.getTime() + 30_000);
    await DiscordBotService.newsPosted(prisma, row.id, '1234567890123456789');
    expect(row.discordEditQueuedAt).not.toBeNull();
  });
});
