import type { QuestRewardDto } from './api.js';

export const SURVEY_STATUSES = ['DRAFT', 'SCHEDULED', 'LIVE', 'CLOSED'] as const;
export type SurveyStatusDto = (typeof SURVEY_STATUSES)[number];

export const SURVEY_QUESTION_TYPES = [
  'YES_NO',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'RATING',
  'SHORT_TEXT',
  'LONG_TEXT',
] as const;
export type SurveyQuestionTypeDto = (typeof SURVEY_QUESTION_TYPES)[number];

/**
 * Answers stay typed end-to-end:
 * - YES_NO -> boolean
 * - SINGLE_CHOICE -> option value string
 * - MULTIPLE_CHOICE -> option value string[]
 * - RATING -> integer
 * - SHORT_TEXT / LONG_TEXT -> string
 *
 * The server validates a submitted value against the authored question before
 * recording it. The content or sentiment of an answer never changes rewards.
 */
export type SurveyAnswerValueDto = boolean | string | string[] | number;

export interface SurveyOptionDto {
  id: string;
  value: string;
  label: string;
  position: number;
}

export interface SurveyQuestionDto {
  id: string;
  type: SurveyQuestionTypeDto;
  prompt: string;
  description: string | null;
  required: boolean;
  position: number;
  minLength: number | null;
  maxLength: number | null;
  ratingMin: number | null;
  ratingMax: number | null;
  options: SurveyOptionDto[];
}

export interface SurveyCompletionDto {
  submittedAt: string;
  rewardGrantedAt: string | null;
}

export interface SurveySummaryDto {
  id: string;
  title: string;
  description: string;
  status: SurveyStatusDto;
  releaseTag: string | null;
  featureTag: string | null;
  roundId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  questionCount: number;
  rewards: QuestRewardDto[];
  completion: SurveyCompletionDto | null;
}

export interface SurveyDetailDto extends SurveySummaryDto {
  questions: SurveyQuestionDto[];
  /** This account's submitted answers on completed surveys; null before completion. */
  answers: SurveyAnswerInputDto[] | null;
}

export interface SurveyPageDto {
  /** Server clock keeps schedule/expiry rendering independent of client clock skew. */
  serverTime: string;
  available: SurveySummaryDto[];
  completed: SurveySummaryDto[];
}

export interface SurveyAnswerInputDto {
  questionId: string;
  value: SurveyAnswerValueDto;
}

export interface SurveySubmitInputDto {
  actionId: string;
  answers: SurveyAnswerInputDto[];
}

export interface SurveySubmissionResultDto {
  surveyId: string;
  submittedAt: string;
  rewards: QuestRewardDto[];
}


export interface AdminSurveyRewardInput {
  kind: QuestRewardDto['kind'];
  amount?: number;
  key?: string;
}

export interface AdminSurveyOptionInput {
  value: string;
  label: string;
}

export interface AdminSurveyQuestionInput {
  type: SurveyQuestionTypeDto;
  prompt: string;
  description?: string | null;
  required: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  ratingMin?: number | null;
  ratingMax?: number | null;
  options: AdminSurveyOptionInput[];
}

export interface AdminSurveyDefinitionInput {
  title: string;
  description: string;
  releaseTag?: string | null;
  featureTag?: string | null;
  roundId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  rewards: AdminSurveyRewardInput[];
  questions: AdminSurveyQuestionInput[];
}

export interface AdminSurveyRowDto {
  id: string;
  title: string;
  description: string;
  status: SurveyStatusDto;
  releaseTag: string | null;
  featureTag: string | null;
  roundId: string | null;
  roundName: string | null;
  rewards: AdminSurveyRewardInput[];
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  announcedAt: string | null;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  submissionCount: number;
}

export interface AdminSurveyDetailDto extends AdminSurveyRowDto {
  questions: SurveyQuestionDto[];
}

export interface AdminSurveysDto {
  now: string;
  surveys: AdminSurveyRowDto[];
  rounds: Array<{
    id: string;
    name: string;
    status: string;
    rulesetVersion: string;
  }>;
}
