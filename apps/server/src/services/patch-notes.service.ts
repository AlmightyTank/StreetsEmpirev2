import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/** A re-run deploy job sends the same notes again; this long after the first, they count as the same post. */
export const PATCH_NOTES_DUPLICATE_MS = 24 * 60 * 60_000;

export interface HeldPatchNotes {
  id: string;
  title: string;
  publishedAt: string;
  duplicate: boolean;
}

/**
 * Deploy-time patch notes from scripts/ops/patch-notes.mjs. Each one is a global
 * news post scheduled holdMinutes ahead: until then players, Discord and the forum
 * never see it, and staff edit, delete or publish it early from Admin → News.
 */
export const PatchNotesService = {
  async hold(
    prisma: PrismaClient,
    input: { title: string; body: string },
    now = new Date(),
    holdMinutes = env.patchNotes.holdMinutes,
  ): Promise<HeldPatchNotes> {
    const existing = await prisma.gameNews.findFirst({
      where: { title: input.title, body: input.body, roundId: null, createdAt: { gte: new Date(now.getTime() - PATCH_NOTES_DUPLICATE_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { id: existing.id, title: existing.title, publishedAt: existing.publishedAt.toISOString(), duplicate: true };
    const row = await prisma.gameNews.create({
      data: {
        title: input.title,
        body: input.body,
        isPinned: false,
        roundId: null,
        publishedAt: new Date(now.getTime() + holdMinutes * 60_000),
      },
    });
    return { id: row.id, title: row.title, publishedAt: row.publishedAt.toISOString(), duplicate: false };
  },
};
