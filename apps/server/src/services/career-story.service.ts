import { Prisma, type PrismaClient } from '@prisma/client';
import type { CareerIdentityKey, CareerStoryActiveDto, CareerStoryArchiveDto } from '@streets/shared';
import type { Ruleset } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import { CAREER_STORY_CATALOG_VERSION, careerStoryArc, loadCareerStoryArc } from './career-story-catalog.service.js';
import { PlayerCareerService } from './player-career.service.js';

type CareerStoryDb = PrismaClient | Prisma.TransactionClient;

function isRootDb(db: CareerStoryDb): db is PrismaClient {
  return '$transaction' in db;
}

function ensureOpen(round: { pausedAt: Date | null; endsAt: Date; status: string }, now: Date): void {
  if (round.status === 'ENDED' || round.endsAt <= now) throw AppError.conflict('CAREER_STORY_ROUND_ENDED', 'This career story is archived because the round has ended.');
  if (round.pausedAt) throw AppError.conflict('CAREER_STORY_PAUSED', 'Career story progress resumes when the round is unpaused.');
}

export function careerStoryEligibility(input: { owner: boolean; roundStatus: string; pausedAt: Date | null; endsAt: Date; now: Date; instanceStatus?: string; expiresAt?: Date | null }): { ok: true } | { ok: false; code: string } {
  if (!input.owner) return { ok: false, code: 'FOREIGN_PLAYER' };
  if (input.roundStatus === 'ENDED' || input.endsAt <= input.now) return { ok: false, code: 'ROUND_ENDED' };
  if (input.pausedAt) return { ok: false, code: 'ROUND_PAUSED' };
  if (input.expiresAt && input.expiresAt <= input.now) return { ok: false, code: 'STORY_EXPIRED' };
  if (input.instanceStatus === 'EXPIRED' || input.instanceStatus === 'ARCHIVED') return { ok: false, code: 'STORY_ARCHIVED' };
  return { ok: true };
}

export const CareerStoryService = {
  async portfolio(prisma: CareerStoryDb, accountId: string, visibility: 'PUBLIC' | 'PRIVATE' = 'PRIVATE'): Promise<CareerStoryArchiveDto[]> {
    const rows = await prisma.careerStoryPortfolio.findMany({ where: { accountId, ...(visibility === 'PUBLIC' ? { visibility: 'PUBLIC' } : {}) }, orderBy: { updatedAt: 'desc' } });
    return rows.map((row) => ({ career: row.career as CareerIdentityKey, status: row.finaleEarned ? 'COMPLETE' : 'IN_PROGRESS', completedChapters: row.completedChapters, finaleEarned: row.finaleEarned, title: row.title, visibility: row.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC' }));
  },

  async active(prisma: CareerStoryDb, input: { accountId: string; roundPlayerId: string; ruleset: Ruleset; now?: Date }): Promise<CareerStoryActiveDto | null> {
    const now = input.now ?? new Date();
    const player = await prisma.roundPlayer.findUnique({ where: { id: input.roundPlayerId }, select: { accountId: true, roundId: true, round: { select: { pausedAt: true, endsAt: true, status: true } } } });
    if (!player || player.accountId !== input.accountId) throw AppError.notFound('CAREER_STORY_NOT_FOUND', 'Career story not found.');
    const career = await PlayerCareerService.get(prisma, input.accountId, now);
    if (!career) return null;
    const arc = loadCareerStoryArc(input.ruleset, career.key);
    if (!arc) return null;
    const instance = await prisma.careerStoryInstance.findUnique({ where: { roundPlayerId_career_catalogVersion: { roundPlayerId: input.roundPlayerId, career: career.key, catalogVersion: CAREER_STORY_CATALOG_VERSION } }, include: { sourceClaims: true } });
    if (!instance) return null;
    return {
      career: career.key,
      catalogVersion: instance.catalogVersion,
      status: instance.expiresAt && instance.expiresAt <= now ? 'EXPIRED' : instance.status as CareerStoryActiveDto['status'],
      currentChapterKey: instance.currentChapterKey,
      chapters: arc.chapters.map((chapter) => ({ chapterKey: chapter.key, order: chapter.order, completed: instance.sourceClaims.some((claim) => claim.objectiveKey === chapter.objectiveKey), objectiveKey: chapter.objectiveKey, claimedSourceIds: instance.sourceClaims.filter((claim) => claim.objectiveKey === chapter.objectiveKey).map((claim) => claim.sourceId) })),
    };
  },

  async ensureInstance(prisma: CareerStoryDb, input: { accountId: string; roundPlayerId: string; ruleset: Ruleset; now?: Date }) {
    const now = input.now ?? new Date();
    const player = await prisma.roundPlayer.findUnique({ where: { id: input.roundPlayerId }, select: { accountId: true, roundId: true, round: { select: { pausedAt: true, endsAt: true, status: true } } } });
    if (!player || player.accountId !== input.accountId) throw AppError.notFound('CAREER_STORY_NOT_FOUND', 'Career story not found.');
    ensureOpen(player.round, now);
    const career = await PlayerCareerService.get(prisma, input.accountId, now);
    if (!career) throw AppError.conflict('CAREER_REQUIRED', 'Choose a career before opening its story.');
    const arc = loadCareerStoryArc(input.ruleset, career.key);
    if (!arc) throw AppError.notFound('CAREER_STORY_DISABLED', 'Career stories are not enabled for this round.');
    return prisma.careerStoryInstance.upsert({ where: { roundPlayerId_career_catalogVersion: { roundPlayerId: input.roundPlayerId, career: career.key, catalogVersion: arc.version } }, create: { roundPlayerId: input.roundPlayerId, roundId: player.roundId, career: career.key, catalogVersion: arc.version, currentChapterKey: arc.chapters[0]!.key, expiresAt: player.round.endsAt }, update: {} });
  },

  async claimSource(prisma: CareerStoryDb, input: { accountId: string; roundPlayerId: string; ruleset: Ruleset; sourceKind: string; sourceId: string; settledAt: Date; now?: Date }) {
    const instance = await CareerStoryService.ensureInstance(prisma, input);
    if (instance.expiresAt && instance.expiresAt <= (input.now ?? new Date())) return { advanced: false, duplicate: false, expired: true };
    const arc = careerStoryArc(instance.career as CareerIdentityKey);
    const chapter = arc.chapters.find((entry) => entry.key === instance.currentChapterKey);
    if (!chapter || chapter.sourceKind !== input.sourceKind) return { advanced: false, duplicate: false };
    const next = arc.chapters[chapter.order] ?? null;
    try {
      const applyClaim = async (tx: Prisma.TransactionClient | PrismaClient) => {
        await tx.careerStorySourceClaim.create({ data: { instanceId: instance.id, sourceKind: input.sourceKind, sourceId: input.sourceId, objectiveKey: chapter.objectiveKey, settledAt: input.settledAt } });
        await tx.careerStoryInstance.update({ where: { id: instance.id }, data: { currentChapterKey: next?.key ?? null, status: next ? 'ACTIVE' : 'COMPLETE' } });
      };
      if (isRootDb(prisma)) await prisma.$transaction(applyClaim);
      else await applyClaim(prisma);
      await prisma.careerStoryPortfolio.upsert({
        where: { instanceId: instance.id },
        create: { accountId: input.accountId, instanceId: instance.id, career: instance.career, title: `${arc.title} progress`, completedChapters: chapter.order, finaleEarned: !next, provenance: { catalogVersion: instance.catalogVersion, lastSourceId: input.sourceId, lastObjectiveKey: chapter.objectiveKey } },
        update: { completedChapters: chapter.order, finaleEarned: !next, provenance: { catalogVersion: instance.catalogVersion, lastSourceId: input.sourceId, lastObjectiveKey: chapter.objectiveKey } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { advanced: false, duplicate: true };
      throw error;
    }
    return { advanced: true, duplicate: false, chapterKey: chapter.key };
  },

  async choose(prisma: CareerStoryDb, input: { accountId: string; roundPlayerId: string; ruleset: Ruleset; chapterKey: string; branchKey: string; now?: Date }) {
    const instance = await CareerStoryService.ensureInstance(prisma, input);
    const arc = careerStoryArc(instance.career as CareerIdentityKey);
    const chapter = arc.chapters.find((entry) => entry.key === input.chapterKey);
    if (!chapter || !chapter.branches.some((branch) => branch.key === input.branchKey)) throw AppError.badRequest('CAREER_STORY_BRANCH_INVALID', 'That career story choice is not available.');
    if (instance.currentChapterKey !== input.chapterKey) throw AppError.conflict('CAREER_STORY_CHAPTER_LOCKED', 'Complete the current chapter before choosing this branch.');
    try {
      const choice = await prisma.careerStoryChoice.create({ data: { instanceId: instance.id, chapterKey: input.chapterKey, branchKey: input.branchKey } });
      const branch = chapter.branches.find((entry) => entry.key === input.branchKey)!;
      await prisma.careerStoryPortfolio.upsert({
        where: { instanceId: instance.id },
        create: { accountId: input.accountId, instanceId: instance.id, career: instance.career, title: `${arc.title}: ${branch.reward.label}`, completedChapters: 0, finaleEarned: false, provenance: { catalogVersion: instance.catalogVersion, chapterKey: input.chapterKey, branchKey: input.branchKey, rewardKind: branch.reward.kind, rewardKey: branch.reward.key } },
        update: { title: `${arc.title}: ${branch.reward.label}`, provenance: { catalogVersion: instance.catalogVersion, chapterKey: input.chapterKey, branchKey: input.branchKey, rewardKind: branch.reward.kind, rewardKey: branch.reward.key } },
      });
      return choice;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw AppError.conflict('CAREER_STORY_CHOICE_REPLAY', 'This chapter already has an immutable choice.');
      throw error;
    }
  },
};
