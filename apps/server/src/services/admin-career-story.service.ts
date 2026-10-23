import { rulesets } from '@streets/rulesets';
import { CAREER_STORY_CATALOG, CAREER_STORY_CATALOG_VERSION } from './career-story-catalog.service.js';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errors.js';

export const AdminCareerStoryService = {
  catalog() {
    return {
      catalogVersion: CAREER_STORY_CATALOG_VERSION,
      careers: CAREER_STORY_CATALOG.map((arc) => ({
        career: arc.career,
        title: arc.title,
        chapters: arc.chapters.map((chapter) => ({ key: chapter.key, order: chapter.order, sourceKind: chapter.sourceKind, objectiveKey: chapter.objectiveKey, optionalCrossover: chapter.optionalCrossover, branches: chapter.branches.map((branch) => ({ key: branch.key, title: branch.title, reward: branch.reward })) })),
        rewardBudget: arc.rewardBudget,
      })),
    };
  },

  preview(input: { career: string; chapterKey: string; branchKey?: string }) {
    const arc = CAREER_STORY_CATALOG.find((entry) => entry.career === input.career);
    const chapter = arc?.chapters.find((entry) => entry.key === input.chapterKey);
    const branch = chapter?.branches.find((entry) => entry.key === input.branchKey);
    return { dryRun: true, eligible: Boolean(arc && chapter), career: arc?.career ?? null, chapter: chapter ? { key: chapter.key, sourceKind: chapter.sourceKind, prerequisiteChapterKey: chapter.prerequisiteChapterKey } : null, branch: branch ? { key: branch.key, title: branch.title, reward: branch.reward } : null, rewardBudget: arc?.rewardBudget ?? null };
  },

  testTrigger(input: { career: string; chapterKey: string; branchKey?: string }) {
    if (process.env.NODE_ENV === 'production') throw AppError.conflict('CAREER_STORY_TEST_TRIGGER_DISABLED', 'Test triggers are disabled in production.');
    return { ...AdminCareerStoryService.preview(input), mutation: 'NONE', rewardGrant: 'NONE' } as const;
  },

  async round(prisma: PrismaClient, roundId: string) {
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true, name: true, status: true, rulesetId: true, rulesetVersion: true, pausedAt: true, endsAt: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round was not found.');
    const ruleset = rulesets[round.rulesetId];
    const [instances, claims, choices, portfolios] = await Promise.all([
      prisma.careerStoryInstance.count({ where: { roundId } }),
      prisma.careerStorySourceClaim.count({ where: { instance: { roundId } } }),
      prisma.careerStoryChoice.count({ where: { instance: { roundId } } }),
      prisma.careerStoryPortfolio.count({ where: { instance: { roundId } } }),
    ]);
    return { round, capability: ruleset?.careerStorylines ?? null, catalogVersion: CAREER_STORY_CATALOG_VERSION, counts: { instances, claims, choices, portfolios } };
  },
};
