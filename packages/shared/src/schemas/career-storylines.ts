import { z } from 'zod';

export const careerStoryChoiceSchema = z.object({
  chapterKey: z.string().min(1).max(80),
  branchKey: z.string().min(1).max(80),
}).strict();

export const careerStorySourceClaimSchema = z.object({
  sourceKind: z.string().min(1).max(40),
  sourceId: z.string().min(1).max(160),
  objectiveKey: z.string().min(1).max(120),
  settledAt: z.coerce.date(),
}).strict();

export const careerStoryPortfolioVisibilitySchema = z.object({
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
}).strict();
