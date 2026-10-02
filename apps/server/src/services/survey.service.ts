import type { Prisma, PrismaClient, Round, Survey } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { QuestRewardDefinition, Ruleset } from '@streets/rulesets';
import type {
  SurveyCompletionDto,
  SurveyDetailDto,
  SurveyPageDto,
  SurveyQuestionDto,
  SurveySummaryDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { rewardDto } from './reward-grant.service.js';
import { RoundPlayerService } from './round-player.service.js';
import { RoundService } from './round.service.js';

type SurveyWindow = Pick<Survey, 'status' | 'startsAt' | 'endsAt' | 'roundId'>;

const summaryInclude = {
  round: true,
  _count: { select: { questions: true } },
} satisfies Prisma.SurveyInclude;

type SummaryRow = Prisma.SurveyGetPayload<{ include: typeof summaryInclude }>;

function rewardDefinitions(value: Prisma.JsonValue): QuestRewardDefinition[] {
  return Array.isArray(value) ? value as unknown as QuestRewardDefinition[] : [];
}

function rewardRuleset(survey: SummaryRow, currentRound: Round, completionRound?: Round | null): Ruleset {
  return loadRulesetForRound(survey.round ?? completionRound ?? currentRound);
}

interface CompletionRow {
  submittedAt: Date;
  rewardGrantedAt: Date | null;
  rewardSnapshot: Prisma.JsonValue;
}

function completionDto(submission: CompletionRow | null): SurveyCompletionDto | null {
  if (!submission) return null;
  return {
    submittedAt: submission.submittedAt.toISOString(),
    rewardGrantedAt: submission.rewardGrantedAt?.toISOString() ?? null,
  };
}

function summaryDto(
  survey: SummaryRow,
  currentRound: Round,
  submission: CompletionRow | null,
  completionRound?: Round | null,
): SurveySummaryDto {
  const ruleset = rewardRuleset(survey, currentRound, completionRound);
  const rewardValue = submission?.rewardSnapshot ?? survey.rewards;
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    status: survey.status,
    releaseTag: survey.releaseTag,
    featureTag: survey.featureTag,
    roundId: survey.roundId,
    startsAt: survey.startsAt?.toISOString() ?? null,
    endsAt: survey.endsAt?.toISOString() ?? null,
    questionCount: survey._count.questions,
    rewards: rewardDefinitions(rewardValue).map((reward) => rewardDto(reward, ruleset)),
    completion: completionDto(submission),
  };
}

function questionDto(question: Prisma.SurveyQuestionGetPayload<{
  include: { options: true };
}>): SurveyQuestionDto {
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    description: question.description,
    required: question.required,
    position: question.position,
    minLength: question.minLength,
    maxLength: question.maxLength,
    ratingMin: question.ratingMin,
    ratingMax: question.ratingMax,
    options: question.options.map((option) => ({
      id: option.id,
      value: option.value,
      label: option.label,
      position: option.position,
    })),
  };
}

/**
 * Player eligibility is intentionally small and auditable:
 * - only LIVE surveys;
 * - inside the optional schedule window;
 * - global, or explicitly for the player's current round.
 *
 * Whether an answer is positive or negative never appears here.
 */
export function surveyAvailableNow(survey: SurveyWindow, currentRoundId: string, now = new Date()): boolean {
  if (survey.status !== 'LIVE') return false;
  if (survey.roundId !== null && survey.roundId !== currentRoundId) return false;
  if (survey.startsAt && survey.startsAt.getTime() > now.getTime()) return false;
  if (survey.endsAt && survey.endsAt.getTime() <= now.getTime()) return false;
  return true;
}

async function currentPlayer(prisma: PrismaClient, accountId: string) {
  const round = await RoundService.requireCurrent(prisma);
  const player = await RoundPlayerService.find(prisma, round.id, accountId);
  if (!player) {
    throw AppError.notFound('NOT_IN_ROUND', `You have not entered ${round.name} yet.`);
  }
  return { round, player };
}

export const SurveyService = {
  async page(prisma: PrismaClient, accountId: string, now = new Date()): Promise<SurveyPageDto> {
    const { round } = await currentPlayer(prisma, accountId);

    const [available, completed] = await Promise.all([
      prisma.survey.findMany({
        where: {
          status: 'LIVE',
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            { OR: [{ roundId: null }, { roundId: round.id }] },
          ],
          submissions: { none: { accountId } },
        },
        include: summaryInclude,
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.surveySubmission.findMany({
        where: { accountId },
        include: {
          survey: { include: summaryInclude },
          roundPlayer: { include: { round: true } },
        },
        orderBy: [{ submittedAt: 'desc' }],
      }),
    ]);

    return {
      serverTime: now.toISOString(),
      available: available.map((survey) => summaryDto(survey, round, null)),
      completed: completed.map((submission) =>
        summaryDto(
          submission.survey,
          round,
          submission,
          submission.roundPlayer?.round ?? null,
        )
      ),
    };
  },

  async detail(
    prisma: PrismaClient,
    accountId: string,
    surveyId: string,
    now = new Date(),
  ): Promise<SurveyDetailDto> {
    const { round } = await currentPlayer(prisma, accountId);
    const [survey, submission] = await Promise.all([
      prisma.survey.findUnique({
        where: { id: surveyId },
        include: {
          ...summaryInclude,
          questions: {
            include: { options: { orderBy: { position: 'asc' } } },
            orderBy: { position: 'asc' },
          },
        },
      }),
      prisma.surveySubmission.findUnique({
        where: { surveyId_accountId: { surveyId, accountId } },
        include: { roundPlayer: { include: { round: true } } },
      }),
    ]);

    if (!survey || (!submission && !surveyAvailableNow(survey, round.id, now))) {
      throw AppError.notFound('SURVEY_NOT_AVAILABLE', 'That survey is not available.');
    }

    const base = summaryDto(
      survey,
      round,
      submission,
      submission?.roundPlayer?.round ?? null,
    );

    return {
      ...base,
      questions: survey.questions.map(questionDto),
    };
  },
};
