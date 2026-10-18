import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { DiscordBotService } from '../discord-bot.service.js';

const at = new Date('2026-10-17T20:00:00.000Z');

function fakeNews() {
  const row = {
    id: 'news-1', title: 'Patch notes 2.1.4', body: '- Fixed navigation', isPinned: false,
    publishedAt: at, discordPostedAt: at, discordMessageId: null as string | null,
    discordEditQueuedAt: null as Date | null, discordEditError: null as string | null,
    createdBy: { username: 'admin' },
  };
  const db = {
    gameNews: {
      updateMany: async ({ where, data }: {
        where: { id: string; discordPostedAt?: unknown; discordEditQueuedAt?: Date | null; discordMessageId?: unknown };
        data: Partial<typeof row>;
      }) => {
        if (where.id !== row.id) return { count: 0 };
        if ('discordEditQueuedAt' in where && where.discordEditQueuedAt?.getTime() !== row.discordEditQueuedAt?.getTime()) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      findMany: async () => row.discordMessageId && row.discordEditQueuedAt && !row.discordEditError ? [{ ...row }] : [],
    },
    $transaction: async <T>(task: (tx: unknown) => Promise<T>) => task(db),
  };
  return { row, prisma: db as unknown as PrismaClient };
}

describe('Discord news message sync', () => {
  it('stores the ID and claims a text edit without creating another public post', async () => {
    const { row, prisma } = fakeNews();
    await DiscordBotService.newsPosted(prisma, row.id, '1234567890123456789');
    expect(row.discordMessageId).toBe('1234567890123456789');
    row.discordEditQueuedAt = new Date(at.getTime() + 60_000);
    row.body = '- Updated content';
    const [claimed] = await DiscordBotService.claimNewsEdits(prisma);
    expect(claimed).toMatchObject({
      id: row.id, messageId: '1234567890123456789', body: '- Updated content',
    });
    expect(row.discordEditQueuedAt).toBeNull();
    expect(await DiscordBotService.claimNewsEdits(prisma)).toEqual([]);
  });

  it('preserves a new edit queued while an earlier edit is in flight', async () => {
    const { row, prisma } = fakeNews();
    row.discordMessageId = '1234567890123456789';
    row.discordEditQueuedAt = new Date(at.getTime() + 60_000);
    await DiscordBotService.claimNewsEdits(prisma);
    row.discordEditQueuedAt = new Date(at.getTime() + 120_000);
    row.body = '- Newer version';
    const [next] = await DiscordBotService.claimNewsEdits(prisma);
    expect(next?.body).toBe('- Newer version');
  });

  it('keeps failed edits visible for staff rather than silently reposting', async () => {
    const { row, prisma } = fakeNews();
    row.discordMessageId = '1234567890123456789';
    await DiscordBotService.newsEditFailed(prisma, row.id, 'Missing Read Message History');
    expect(row.discordEditError).toContain('Read Message History');
  });
});
