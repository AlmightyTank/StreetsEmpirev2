import { z } from 'zod';
import { SURVEY_QUESTION_TYPES, SURVEY_REWARD_KINDS } from '../types/survey.js';

const id = z.string().trim().min(1).max(64);
const optionalTag = z.string().trim().max(80).nullable().optional();
const rewardKind = z.enum(SURVEY_REWARD_KINDS);

export const adminSurveyRewardSchema = z.object({
  kind: rewardKind,
  amount: z.number().int().positive().optional(),
  key: z.string().trim().min(1).max(100).optional(),
}).strict();

export const adminSurveyOptionSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(180),
}).strict();

export const adminSurveyQuestionSchema = z.object({
  type: z.enum(SURVEY_QUESTION_TYPES),
  prompt: z.string().trim().min(3).max(500),
  description: z.string().trim().max(1000).nullable().optional(),
  required: z.boolean(),
  minLength: z.number().int().min(1).max(5000).nullable().optional(),
  maxLength: z.number().int().min(1).max(5000).nullable().optional(),
  ratingMin: z.number().int().min(1).max(10).nullable().optional(),
  ratingMax: z.number().int().min(1).max(10).nullable().optional(),
  options: z.array(adminSurveyOptionSchema).max(25),
}).strict();

export const adminSurveyDefinitionSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(3).max(4000),
  releaseTag: optionalTag,
  featureTag: optionalTag,
  roundId: id.nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  rewards: z.array(adminSurveyRewardSchema).max(20),
  questions: z.array(adminSurveyQuestionSchema).min(1).max(100),
}).strict();

export const adminSurveyCloseSchema = z.object({
  reason: z.string().trim().min(5).max(500),
}).strict();

export type AdminSurveyDefinitionParsed = z.infer<typeof adminSurveyDefinitionSchema>;


export const adminSurveyResultsQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  questionId: id.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
}).strict();

export type AdminSurveyResultsQueryParsed = z.infer<typeof adminSurveyResultsQuerySchema>;
