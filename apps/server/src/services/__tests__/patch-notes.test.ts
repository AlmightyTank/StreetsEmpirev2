import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { BODY_MAX, buildPatchNotes, extractPatchNotes } from '../../../../../scripts/ops/patch-notes.mjs';
import { PATCH_NOTES_DUPLICATE_MS, PatchNotesService } from '../patch-notes.service.js';

const template = `## What changed
- Render each award's crest on the shared card.

## Patch notes
<!--
Player-facing bullets for the in-game news post.
- this example stays hidden
-->
- Badges now show their artwork on your profile.
* Locked achievements show a dimmed crest.
1. Fixed the header covering the page on phones.

## Testing
- npm test`;

describe('extractPatchNotes', () => {
  it('reads only the bullets under the Patch notes heading, without template comments', () => {
    expect(extractPatchNotes(template)).toEqual([
      'Badges now show their artwork on your profile.',
      'Locked achievements show a dimmed crest.',
      'Fixed the header covering the page on phones.',
    ]);
  });

  it('skips internal PRs: no section, an empty template bullet, or "none"', () => {
    expect(extractPatchNotes('## What changed\n- CI only')).toEqual([]);
    expect(extractPatchNotes('## Patch notes\n- \n')).toEqual([]);
    expect(extractPatchNotes('### Patch Notes:\r\nNone.\r\n')).toEqual([]);
    expect(extractPatchNotes('## Patch notes\n- N/A')).toEqual([]);
    expect(extractPatchNotes(null)).toEqual([]);
  });

  it('keeps a plain sentence under the heading as a note', () => {
    expect(extractPatchNotes('## Patch notes\nRoulette pays out faster.')).toEqual(['Roulette pays out faster.']);
  });
});

describe('buildPatchNotes', () => {
  const date = new Date('2026-10-10T18:00:00.000Z');

  it('lists every PR in merge order under a dated title', () => {
    const post = buildPatchNotes([
      { number: 12, mergedAt: '2026-10-10T12:00:00Z', body: '## Patch notes\n- Second' },
      { number: 11, mergedAt: '2026-10-10T09:00:00Z', body: '## Patch notes\n- First' },
      { number: 13, mergedAt: '2026-10-10T13:00:00Z', body: '## Patch notes\nnone' },
    ], date);
    expect(post).toEqual({ title: 'Patch notes: October 10, 2026', body: '- First\n- Second' });
  });

  it('posts nothing when no PR had notes', () => {
    expect(buildPatchNotes([{ number: 1, mergedAt: '2026-10-10T09:00:00Z', body: '## Patch notes\n- ' }], date)).toBeNull();
    expect(buildPatchNotes([], date)).toBeNull();
  });

  it('stays within the news body limit and counts what it left out', () => {
    const note = 'x'.repeat(190);
    const body = `## Patch notes\n${Array.from({ length: 40 }, (_, index) => `- ${index} ${note}`).join('\n')}`;
    const post = buildPatchNotes([{ number: 1, mergedAt: '2026-10-10T09:00:00Z', body }], date)!;
    expect(post.body.length).toBeLessThanOrEqual(BODY_MAX);
    const kept = post.body.split('\n').filter((line) => line.startsWith('- ')).length;
    expect(post.body.endsWith(`…and ${40 - kept} more changes.`)).toBe(true);
  });
});

type NewsRow = { id: string; title: string; body: string; roundId: string | null; isPinned: boolean; publishedAt: Date; createdAt: Date };

function fakePrisma(rows: NewsRow[], now: Date) {
  const db = {
    gameNews: {
      findFirst: async ({ where }: { where: { title: string; body: string; createdAt: { gte: Date } } }) =>
        rows.find((row) => row.title === where.title && row.body === where.body && row.roundId === null && row.createdAt >= where.createdAt.gte) ?? null,
      create: async ({ data }: { data: Omit<NewsRow, 'id' | 'createdAt'> }) => {
        const row = { ...data, id: `news-${rows.length + 1}`, createdAt: now };
        rows.push(row);
        return row;
      },
    },
    // No bot API in tests, so the staff channel heads-up is never queued.
    discordStaffPost: { create: async () => { throw new Error('queued a staff post with the bot API off'); } },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
  };
  return db as unknown as PrismaClient;
}

describe('PatchNotesService.hold', () => {
  const now = new Date('2026-10-10T18:00:00.000Z');
  const notes = { title: 'Patch notes: October 10, 2026', body: '- First' };

  it('schedules a global, unpinned post the hold time ahead', async () => {
    const rows: NewsRow[] = [];
    const held = await PatchNotesService.hold(fakePrisma(rows, now), notes, now, 120);
    expect(held).toEqual({ id: 'news-1', title: notes.title, publishedAt: '2026-10-10T20:00:00.000Z', duplicate: false });
    expect(rows[0]).toMatchObject({ roundId: null, isPinned: false });
  });

  it('returns the earlier post when a re-run job sends the same notes', async () => {
    const rows: NewsRow[] = [];
    const prisma = fakePrisma(rows, now);
    await PatchNotesService.hold(prisma, notes, now, 120);
    const again = await PatchNotesService.hold(prisma, notes, new Date(now.getTime() + 60_000), 120);
    expect(again).toMatchObject({ id: 'news-1', duplicate: true });
    expect(rows).toHaveLength(1);
  });

  it('posts the same text again after a day', async () => {
    const rows: NewsRow[] = [];
    const prisma = fakePrisma(rows, now);
    await PatchNotesService.hold(prisma, notes, now, 120);
    const later = await PatchNotesService.hold(prisma, notes, new Date(now.getTime() + PATCH_NOTES_DUPLICATE_MS + 1), 120);
    expect(later.duplicate).toBe(false);
  });
});
