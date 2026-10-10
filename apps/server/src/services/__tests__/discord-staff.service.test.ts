import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { DiscordStaffService, STAFF_POST_MAX_AGE_MS } from '../discord-staff.service.js';
import { bugReplyBody } from '../game-alerts.service.js';

const now = new Date('2026-10-10T15:00:00.000Z');

type Post = { id: string; kind: string; targetId: string; createdAt: Date; claimedAt: Date | null; messageId: string | null; error: string | null };

const report = {
  id: 'bug1', accountId: 'acct1', username: 'Big_Daddy', category: 'GAMEPLAY', summary: 'Raid button does nothing', details: 'Clicked it twice.',
  pagePath: '/game/raids', userAgent: 'Firefox', appVersion: '1.6.5', createdAt: new Date('2026-10-10T12:00:00.000Z'),
  resolvedAt: null as Date | null, resolvedByUsername: null as string | null, resolution: null as string | null, resolutionNote: null as string | null,
  source: 'GAME', playerReply: null as string | null, reporterNotifiedAt: null as Date | null,
};

function fakePrisma(posts: Post[], reports: Array<typeof report>, news: Array<{ id: string; title: string; body: string; publishedAt: Date }> = []) {
  const db = {
    discordStaffPost: {
      findMany: async () => posts.filter((post) => !post.claimedAt).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      updateMany: async ({ where, data }: { where: { id: { in: string[] } | string; claimedAt?: null }; data: Partial<Post> }) => {
        const ids = typeof where.id === 'string' ? [where.id] : where.id.in;
        for (const post of posts) if (ids.includes(post.id) && (where.claimedAt !== null || !post.claimedAt)) Object.assign(post, data);
        return { count: ids.length };
      },
      findFirst: async ({ where }: { where: { kind: string; targetId: string } }) =>
        posts.find((post) => post.kind === where.kind && post.targetId === where.targetId && post.messageId) ?? null,
    },
    bugReport: { findUnique: async ({ where }: { where: { id: string } }) => reports.find((row) => row.id === where.id) ?? null },
    gameNews: { findUnique: async ({ where }: { where: { id: string } }) => news.find((row) => row.id === where.id) ?? null },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
  };
  return db as unknown as PrismaClient;
}

const post = (id: string, kind: string, targetId: string, ageMs = 60_000, messageId: string | null = null): Post =>
  ({ id, kind, targetId, createdAt: new Date(now.getTime() - ageMs), claimedAt: null, messageId, error: null });

describe('DiscordStaffService.claim', () => {
  it('hands out a new report once, with what staff need to act on it', async () => {
    const posts = [post('p1', 'BUG_REPORT', 'bug1')];
    const prisma = fakePrisma(posts, [report]);
    const [claimed] = await DiscordStaffService.claim(prisma, now);
    expect(claimed).toMatchObject({
      id: 'p1', kind: 'BUG_REPORT', editMessageId: null,
      bugReport: { id: 'bug1', category: 'Something in the game works wrong', username: 'Big_Daddy', source: 'GAME', resolution: null },
    });
    expect(claimed!.bugReport!.url).toMatch(/\/game\/admin\/bugs$/);
    expect(posts[0]!.claimedAt).toEqual(now);
    expect(await DiscordStaffService.claim(prisma, now)).toEqual([]);
  });

  it('points a resolution at the first post, and skips it when that never reached Discord', async () => {
    const resolved = { ...report, resolvedAt: now, resolvedByUsername: 'admin', resolution: 'FIXED' };
    const posted = fakePrisma([{ ...post('p1', 'BUG_REPORT', 'bug1', 120_000, '1234567890123456789'), claimedAt: now }, post('p2', 'BUG_REPORT_RESOLVED', 'bug1')], [resolved]);
    expect(await DiscordStaffService.claim(posted, now)).toMatchObject([{ id: 'p2', editMessageId: '1234567890123456789', bugReport: { resolution: 'FIXED', resolvedByUsername: 'admin' } }]);
    const neverPosted = fakePrisma([{ ...post('p1', 'BUG_REPORT', 'bug1', 120_000), claimedAt: now }, post('p2', 'BUG_REPORT_RESOLVED', 'bug1')], [resolved]);
    expect(await DiscordStaffService.claim(neverPosted, now)).toEqual([]);
  });

  it('drops stale posts and ones whose report or news is gone, claiming them all', async () => {
    const posts = [
      post('old', 'BUG_REPORT', 'bug1', STAFF_POST_MAX_AGE_MS + 1),
      post('gone', 'BUG_REPORT', 'deleted'),
      post('notes', 'PATCH_NOTES_HELD', 'news1'),
      post('notes-gone', 'PATCH_NOTES_HELD', 'news-deleted'),
    ];
    const prisma = fakePrisma(posts, [report], [{ id: 'news1', title: 'Patch notes: October 10, 2026', body: '- Fixed raids', publishedAt: new Date('2026-10-10T17:00:00.000Z') }]);
    expect(await DiscordStaffService.claim(prisma, now)).toMatchObject([
      { id: 'notes', kind: 'PATCH_NOTES_HELD', patchNotes: { title: 'Patch notes: October 10, 2026', publishedAt: '2026-10-10T17:00:00.000Z' } },
    ]);
    expect(posts.every((row) => row.claimedAt)).toBe(true);
  });

  it('queues nothing while the bot API is off', async () => {
    const created: unknown[] = [];
    await DiscordStaffService.queue({ discordStaffPost: { create: async (args: unknown) => created.push(args) } } as unknown as PrismaClient, 'BUG_REPORT', 'bug1');
    expect(created).toEqual([]);
  });
});

describe('bugReplyBody', () => {
  it('says what staff decided in the player\'s own words, with any message for them', () => {
    expect(bugReplyBody({ summary: 'Raid button does nothing', resolution: 'FIXED', playerReply: null })).toBe('Staff fixed what you reported: "Raid button does nothing".');
    expect(bugReplyBody({ summary: 'Raid button does nothing', resolution: 'DUPLICATE', playerReply: 'Fix lands Friday.' }))
      .toBe('Staff already know about "Raid button does nothing" and are tracking it. Staff said: Fix lands Friday.');
    expect(bugReplyBody({ summary: 'Map is grey', resolution: 'WONT_FIX', playerReply: null })).toBe('Staff looked into "Map is grey" and won\'t be changing it.');
  });
});
