import type { Prisma, PrismaClient, Round, Survey } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { isItemRewardField, type QuestRewardDefinition, type QuestRewardKind, type Ruleset } from '@streets/rulesets';
import {
  SURVEY_DEFAULT_LONG_TEXT_MAX_LENGTH,
  SURVEY_DEFAULT_RATING_MAX,
  SURVEY_DEFAULT_RATING_MIN,
  SURVEY_DEFAULT_SHORT_TEXT_MAX_LENGTH,
  SURVEY_DEFAULT_TEXT_MIN_LENGTH,
  type GameActionResult,
  type SurveyAnswerInputDto,
  type SurveyCompletionDto,
  type SurveyDetailDto,
  type SurveyPageDto,
  type SurveyQuestionDto,
  type SurveySubmissionResultDto,
  type SurveySubmitInputDto,
  type SurveySummaryDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { grantRewards, rewardDto } from './reward-grant.service.js';
import { ActionService } from './action.service.js';
import { RoundPlayerService } from './round-player.service.js';
import { RoundService } from './round.service.js';
import { settleSurveySchedules } from './survey-schedule.service.js';

type SurveyWindow = Pick<Survey, 'status' | 'startsAt' | 'endsAt' | 'roundId'>;

const summaryInclude = {
  round: true,
  _count: { select: { questions: true } },
} satisfies Prisma.SurveyInclude;

type SummaryRow = Prisma.SurveyGetPayload<{ include: typeof summaryInclude }>;

function rewardDefinitions(value: Prisma.JsonValue): QuestRewardDefinition[] {
  return Array.isArray(value) ? value as unknown as QuestRewardDefinition[] : [];
}

const SURVEY_REWARD_KINDS = new Set<QuestRewardKind>([
  'CASH',
  'TURNS',
  'ITEM',
  'CONTACT_REP',
  'WEAPON_ACCESS',
  'PERMANENT_UNLOCK',
  'FAVOR_ITEM',
  'COSMETIC_UNLOCK',
  'PRODUCT',
]);

function positiveAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Survey rewards are authored JSON, so never trust their static cast at payout.
 * A bad survey must fail closed instead of deducting resources or throwing
 * halfway through grantRewards().
 */
export function validateSurveyRewards(value: Prisma.JsonValue, ruleset: Ruleset): QuestRewardDefinition[] {
  if (!Array.isArray(value)) configurationError('Survey rewards must be a list.');

  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      configurationError('A survey reward is malformed.');
    }
    const reward = raw as Record<string, unknown>;
    const kind = reward.kind;
    if (typeof kind !== 'string' || !SURVEY_REWARD_KINDS.has(kind as QuestRewardKind)) {
      configurationError('A survey reward has an unknown type.');
    }

    const key = typeof reward.key === 'string' ? reward.key : undefined;
    const amount = reward.amount;

    switch (kind as QuestRewardKind) {
      case 'CASH':
      case 'TURNS':
        if (!positiveAmount(amount)) configurationError('Survey cash and turn rewards must be positive whole numbers.');
        break;
      case 'ITEM':
        if (!key || !isItemRewardField(key) || !positiveAmount(amount)) {
          configurationError('A survey item reward is invalid.');
        }
        break;
      case 'CONTACT_REP':
        if (!key || !ruleset.contacts?.[key as keyof typeof ruleset.contacts] || !positiveAmount(amount)) {
          configurationError('A survey contact reputation reward is invalid.');
        }
        break;
      case 'WEAPON_ACCESS':
        if (!key || !['SHOTGUN', 'TEK9', 'AK47'].includes(key)) {
          configurationError('A survey weapon access reward is invalid.');
        }
        break;
      case 'PERMANENT_UNLOCK':
        if (!key || !ruleset.permanentUnlocks?.[key]) {
          configurationError('A survey permanent unlock reward is invalid.');
        }
        break;
      case 'FAVOR_ITEM':
        if (!key || !ruleset.favors?.[key] || !positiveAmount(amount)) {
          configurationError('A survey favor reward is invalid.');
        }
        break;
      case 'COSMETIC_UNLOCK':
        if (!key || !ruleset.cosmetics?.[key]) {
          configurationError('A survey cosmetic reward is invalid.');
        }
        break;
      case 'PRODUCT':
        if (!key || (key !== 'CRACK' && !ruleset.products?.[key]) || !positiveAmount(amount)) {
          configurationError('A survey product reward is invalid.');
        }
        break;
    }

    return {
      kind: kind as QuestRewardKind,
      ...(key ? { key } : {}),
      ...(amount !== undefined ? { amount: amount as number } : {}),
    };
  });
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

export type SurveyQuestionForSubmission = Prisma.SurveyQuestionGetPayload<{
  include: { options: true };
}>;

function questionField(questionId: string): Record<string, string> {
  return { [questionId]: 'Check this answer.' };
}

function configurationError(message: string): never {
  throw AppError.conflict('SURVEY_CONFIGURATION_INVALID', message);
}

/**
 * Validate against the authored question, not against the opinion.
 * Text is trimmed for storage, but never sentiment-scored or interpreted.
 */
export function validateSurveyAnswers(
  questions: readonly SurveyQuestionForSubmission[],
  answers: readonly SurveyAnswerInputDto[],
): SurveyAnswerInputDto[] {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const answersById = new Map<string, SurveyAnswerInputDto>();

  for (const answer of answers) {
    if (answersById.has(answer.questionId)) {
      throw AppError.badRequest(
        'SURVEY_ANSWER_DUPLICATE',
        'Answer each survey question only once.',
        questionField(answer.questionId),
      );
    }
    answersById.set(answer.questionId, answer);
    if (!questionsById.has(answer.questionId)) {
      throw AppError.badRequest(
        'SURVEY_ANSWER_UNKNOWN',
        'That answer does not belong to this survey.',
        questionField(answer.questionId),
      );
    }
  }

  const normalized: SurveyAnswerInputDto[] = [];
  for (const question of questions) {
    const answer = answersById.get(question.id);
    if (!answer) {
      if (question.required) {
        throw AppError.badRequest(
          'SURVEY_REQUIRED_ANSWER_MISSING',
          'Answer every required survey question before submitting.',
          { [question.id]: 'This question is required.' },
        );
      }
      continue;
    }

    const invalidType = () => AppError.badRequest(
      'SURVEY_ANSWER_INVALID',
      'One of your survey answers has the wrong format.',
      questionField(question.id),
    );

    switch (question.type) {
      case 'YES_NO': {
        if (typeof answer.value !== 'boolean') throw invalidType();
        normalized.push({ questionId: question.id, value: answer.value });
        break;
      }
      case 'SINGLE_CHOICE': {
        if (typeof answer.value !== 'string') throw invalidType();
        if (!question.options.length) configurationError('A single-choice survey question has no choices.');
        if (!answer.value && !question.required) break;
        if (!question.options.some((option) => option.value === answer.value)) {
          throw AppError.badRequest(
            'SURVEY_CHOICE_INVALID',
            'Pick one of the choices shown for that question.',
            questionField(question.id),
          );
        }
        normalized.push({ questionId: question.id, value: answer.value });
        break;
      }
      case 'MULTIPLE_CHOICE': {
        if (!Array.isArray(answer.value) || !answer.value.every((value) => typeof value === 'string')) {
          throw invalidType();
        }
        if (!question.options.length) configurationError('A multiple-choice survey question has no choices.');
        if (answer.value.length === 0) {
          if (question.required) {
            throw AppError.badRequest(
              'SURVEY_REQUIRED_ANSWER_MISSING',
              'Answer every required survey question before submitting.',
              { [question.id]: 'Choose at least one option.' },
            );
          }
          break;
        }
        if (new Set(answer.value).size !== answer.value.length) {
          throw AppError.badRequest(
            'SURVEY_CHOICE_DUPLICATE',
            'Choose each option only once.',
            questionField(question.id),
          );
        }
        const allowed = new Set(question.options.map((option) => option.value));
        if (answer.value.some((value) => !allowed.has(value))) {
          throw AppError.badRequest(
            'SURVEY_CHOICE_INVALID',
            'Pick only the choices shown for that question.',
            questionField(question.id),
          );
        }
        normalized.push({ questionId: question.id, value: [...answer.value] });
        break;
      }
      case 'RATING': {
        if (typeof answer.value !== 'number' || !Number.isInteger(answer.value)) throw invalidType();
        const min = question.ratingMin ?? SURVEY_DEFAULT_RATING_MIN;
        const max = question.ratingMax ?? SURVEY_DEFAULT_RATING_MAX;
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 10 || min > max) {
          configurationError('A survey rating question has invalid bounds.');
        }
        if (answer.value < min || answer.value > max) {
          throw AppError.badRequest(
            'SURVEY_RATING_OUT_OF_RANGE',
            `Give that question a rating from ${min} to ${max}.`,
            questionField(question.id),
          );
        }
        normalized.push({ questionId: question.id, value: answer.value });
        break;
      }
      case 'SHORT_TEXT':
      case 'LONG_TEXT': {
        if (typeof answer.value !== 'string') throw invalidType();
        const value = answer.value.trim();
        if (!value && !question.required) break;
        const min = question.minLength ?? SURVEY_DEFAULT_TEXT_MIN_LENGTH;
        const defaultMax = question.type === 'SHORT_TEXT'
          ? SURVEY_DEFAULT_SHORT_TEXT_MAX_LENGTH
          : SURVEY_DEFAULT_LONG_TEXT_MAX_LENGTH;
        const max = question.maxLength ?? defaultMax;
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > SURVEY_DEFAULT_LONG_TEXT_MAX_LENGTH) {
          configurationError('A survey text question has invalid length limits.');
        }
        if (value.length < min) {
          throw AppError.badRequest(
            'SURVEY_TEXT_TOO_SHORT',
            `Write at least ${min} characters for that question.`,
            questionField(question.id),
          );
        }
        if (value.length > max) {
          throw AppError.badRequest(
            'SURVEY_TEXT_TOO_LONG',
            `Keep that answer to ${max} characters or fewer.`,
            questionField(question.id),
          );
        }
        normalized.push({ questionId: question.id, value });
        break;
      }
    }
  }

  return normalized;
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
    await settleSurveySchedules(prisma, now);
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
    await settleSurveySchedules(prisma, now);
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
        include: {
          roundPlayer: { include: { round: true } },
          answers: true,
        },
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

    const positions = new Map(survey.questions.map((question) => [question.id, question.position]));
    return {
      ...base,
      questions: survey.questions.map(questionDto),
      answers: submission
        ? [...submission.answers]
            .sort((left, right) => (positions.get(left.questionId) ?? 0) - (positions.get(right.questionId) ?? 0))
            .map((answer) => ({
              questionId: answer.questionId,
              value: answer.value as unknown as SurveyAnswerInputDto['value'],
            }))
        : null,
    };
  },

  async submit(
    prisma: PrismaClient,
    accountId: string,
    surveyId: string,
    input: SurveySubmitInputDto,
  ): Promise<GameActionResult<SurveySubmissionResultDto>> {
    await settleSurveySchedules(prisma);
    const { player } = await currentPlayer(prisma, accountId);

    return ActionService.run<SurveySubmissionResultDto>(prisma, player.id, {
      action: 'SURVEY_COMPLETE',
      actionId: input.actionId,
      idempotencyScope: `SURVEY_COMPLETE:${surveyId}`,
      execute: async ({ tx, current, player: actionPlayer, round, ruleset, now }) => {
        const survey = await tx.survey.findUnique({
          where: { id: surveyId },
          include: {
            questions: {
              include: { options: { orderBy: { position: 'asc' } } },
              orderBy: { position: 'asc' },
            },
          },
        });

        if (!survey || !surveyAvailableNow(survey, round.id, now)) {
          throw AppError.conflict(
            'SURVEY_NOT_AVAILABLE',
            'That survey is no longer available to submit.',
          );
        }

        const existing = await tx.surveySubmission.findUnique({
          where: { surveyId_accountId: { surveyId, accountId: actionPlayer.accountId } },
        });
        if (existing) {
          throw AppError.conflict(
            'SURVEY_ALREADY_COMPLETED',
            'You already completed this survey.',
          );
        }

        const normalizedAnswers = validateSurveyAnswers(survey.questions, input.answers);
        const rewards = validateSurveyRewards(survey.rewards, ruleset);
        const next = { ...current };

        const submission = await tx.surveySubmission.create({
          data: {
            surveyId: survey.id,
            accountId: actionPlayer.accountId,
            roundPlayerId: actionPlayer.id,
            submittedAt: now,
            rewardSnapshot: survey.rewards as Prisma.InputJsonValue,
            answers: {
              create: normalizedAnswers.map((answer) => ({
                questionId: answer.questionId,
                value: answer.value as Prisma.InputJsonValue,
              })),
            },
          },
        });

        await grantRewards(
          {
            tx,
            roundPlayerId: actionPlayer.id,
            accountId: actionPlayer.accountId,
            ruleset,
            now,
            sourceKey: `survey:${survey.id}`,
          },
          next,
          rewards,
        );

        await tx.surveySubmission.update({
          where: { id: submission.id },
          data: { rewardGrantedAt: now },
        });

        return {
          next,
          result: {
            surveyId: survey.id,
            submittedAt: now.toISOString(),
            rewards: rewards.map((reward) => rewardDto(reward, ruleset)),
          },
        };
      },
    });
  },
};
