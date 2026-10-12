import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { DEPLOY_POST_MAX_AGE_MS, DiscordStaffService } from '../discord-staff.service.js';

const now = new Date('2026-10-10T15:00:00.000Z');
const MIN = 60_000;

type Post = { id: string; kind: string; targetId: string; createdAt: Date; claimedAt: Date | null; messageId: string | null };
type Banner = { id: string; message: string; endsAt: Date; maintenanceStartsAt: Date | null; maintenanceEndsAt: Date | null };

function fakePrisma(posts: Post[], banners: Banner[] = []) {
  const db = {
    discordStaffPost: {
      findMany: async ({ where }: { where: { kind: { in: string[] } } }) => posts.filter((post) => !post.claimedAt && where.kind.in.includes(post.kind)),
      updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: { claimedAt: Date } }) => {
        for (const post of posts) if (where.id.in.includes(post.id)) post.claimedAt ??= data.claimedAt;
        return { count: where.id.in.length };
      },
      findFirst: async ({ where }: { where: { kind: string; targetId: string } }) => posts.find((post) => post.kind === where.kind && post.targetId === where.targetId && post.messageId) ?? null,
    },
    siteBanner: { findUnique: async ({ where }: { where: { id: string } }) => banners.find((banner) => banner.id === where.id) ?? null },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
  };
  return db as unknown as PrismaClient;
}

const post = (id: string, kind: string, targetId: string, ageMs = MIN, messageId: string | null = null): Post =>
  ({ id, kind, targetId, createdAt: new Date(now.getTime() - ageMs), claimedAt: null, messageId });

describe('status channel posts', () => {
  it('are claimed apart from staff posts, so neither channel holds up the other', async () => {
    const posts = [post('bug', 'PATCH_NOTES_HELD', 'news1'), post('deploy', 'STATUS_DEPLOY_STARTED', 'abc1234')];
    const prisma = fakePrisma(posts);
    expect(await DiscordStaffService.claim(prisma, now, 10, 'status')).toMatchObject([
      { id: 'deploy', kind: 'STATUS_DEPLOY_STARTED', editMessageId: null, deploy: { phase: 'started', commit: 'abc1234' } },
    ]);
    expect(posts.find((row) => row.id === 'bug')!.claimedAt).toBeNull();
  });

  it('edit the deploy\'s "updating" post when it finishes or fails, and skip it when that never went out', async () => {
    const posted = fakePrisma([
      { ...post('start', 'STATUS_DEPLOY_STARTED', 'abc1234', 5 * MIN, '1234567890123456789'), claimedAt: now },
      post('done', 'STATUS_DEPLOY_FINISHED', 'abc1234'),
    ]);
    expect(await DiscordStaffService.claim(posted, now, 10, 'status')).toMatchObject([
      { id: 'done', editMessageId: '1234567890123456789', deploy: { phase: 'finished', commit: 'abc1234' } },
    ]);
    const never = fakePrisma([post('fail', 'STATUS_DEPLOY_FAILED', 'abc1234')]);
    expect(await DiscordStaffService.claim(never, now, 10, 'status')).toEqual([]);
  });

  it('drop deploy notices that are old news', async () => {
    const posts = [post('late', 'STATUS_DEPLOY_STARTED', 'abc1234', DEPLOY_POST_MAX_AGE_MS + 1)];
    expect(await DiscordStaffService.claim(fakePrisma(posts), now, 10, 'status')).toEqual([]);
    expect(posts[0]!.claimedAt).toEqual(now);
  });

  it('post planned maintenance, unless it was ended or is already over', async () => {
    const window = { maintenanceStartsAt: new Date(now.getTime() + 60 * MIN), maintenanceEndsAt: new Date(now.getTime() + 120 * MIN) };
    const prisma = fakePrisma(
      [post('m1', 'STATUS_MAINTENANCE', 'b1'), post('m2', 'STATUS_MAINTENANCE', 'b2')],
      [
        { id: 'b1', message: 'Database upgrade', endsAt: window.maintenanceEndsAt, ...window },
        // Ended early by an admin.
        { id: 'b2', message: 'Cancelled', endsAt: new Date(now.getTime() - MIN), ...window },
      ],
    );
    expect(await DiscordStaffService.claim(prisma, now, 10, 'status')).toMatchObject([
      { id: 'm1', kind: 'STATUS_MAINTENANCE', maintenance: { message: 'Database upgrade', startsAt: window.maintenanceStartsAt.toISOString() } },
    ]);
  });
});
