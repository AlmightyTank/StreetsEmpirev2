import type { Prisma, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type {
  AdminSurveyDefinitionInput,
  AdminSurveyDetailDto,
  AdminSurveyQuestionInput,
  AdminSurveyRewardInput,
  AdminSurveyRowDto,
  AdminSurveysDto,
  SurveyQuestionDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { RoundService } from './round.service.js';
import { settleSurveySchedules } from './survey-schedule.service.js';
import { validateSurveyRewards } from './survey.service.js';

const listInclude = {
  round: { select: { name: true } },
  _count: { select: { questions: true, submissions: true } },
} satisfies Prisma.SurveyInclude;

const detailInclude = {
  ...listInclude,
  questions: {
    include: { options: { orderBy: { position: 'asc' } } },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.SurveyInclude;

type SurveyListRow = Prisma.SurveyGetPayload<{ include: typeof listInclude }>;
type SurveyDetailRow = Prisma.SurveyGetPayload<{ include: typeof detailInclude }>;

function rewardInputs(value: Prisma.JsonValue): AdminSurveyRewardInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    if (typeof row.kind !== 'string') return [];
    return [{
      kind: row.kind as AdminSurveyRewardInput['kind'],
      ...(typeof row.amount === 'number' ? { amount: row.amount } : {}),
      ...(typeof row.key === 'string' ? { key: row.key } : {}),
    }];
  });
}

function rowDto(row: SurveyListRow): AdminSurveyRowDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    releaseTag: row.releaseTag,
    featureTag: row.featureTag,
    roundId: row.roundId,
    roundName: row.round?.name ?? null,
    rewards: rewardInputs(row.rewards),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    announcedAt: row.announcedAt?.toISOString() ?? null,
    createdByUsername: row.createdByUsername,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    questionCount: row._count.questions,
    submissionCount: row._count.submissions,
  };
}

function questionDto(question: SurveyDetailRow['questions'][number]): SurveyQuestionDto {
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

function detailDto(row: SurveyDetailRow): AdminSurveyDetailDto {
  return { ...rowDto(row), questions: row.questions.map(questionDto) };
}

function dateValue(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function questionCreate(question: AdminSurveyQuestionInput, index: number): Prisma.SurveyQuestionCreateWithoutSurveyInput {
  return {
    type: question.type,
    prompt: question.prompt,
    description: question.description ?? null,
    required: question.required,
    position: index + 1,
    minLength: question.minLength ?? null,
    maxLength: question.maxLength ?? null,
    ratingMin: question.ratingMin ?? null,
    ratingMax: question.ratingMax ?? null,
    options: {
      create: question.options.map((option, optionIndex) => ({
        value: option.value,
        label: option.label,
        position: optionIndex + 1,
      })),
    },
  };
}

function definitionData(input: AdminSurveyDefinitionInput) {
  return {
    title: input.title,
    description: input.description,
    releaseTag: input.releaseTag || null,
    featureTag: input.featureTag || null,
    roundId: input.roundId || null,
    startsAt: dateValue(input.startsAt),
    endsAt: dateValue(input.endsAt),
    rewards: input.rewards as unknown as Prisma.InputJsonValue,
  };
}

function assertDates(startsAt: Date | null, endsAt: Date | null, now: Date): void {
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    throw AppError.badRequest('SURVEY_START_INVALID', 'The survey start time is invalid.', { startsAt: 'Choose a valid start time.' });
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw AppError.badRequest('SURVEY_END_INVALID', 'The survey end time is invalid.', { endsAt: 'Choose a valid end time.' });
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw AppError.badRequest('SURVEY_WINDOW_INVALID', 'The survey must close after it opens.', { endsAt: 'Choose a time after the start.' });
  }
  if (endsAt && endsAt <= now) {
    throw AppError.badRequest('SURVEY_END_PAST', 'The survey close time must still be in the future.', { endsAt: 'Choose a future close time.' });
  }
}

function assertQuestionConfiguration(questions: SurveyDetailRow['questions']): void {
  if (!questions.length) throw AppError.badRequest('SURVEY_NO_QUESTIONS', 'Add at least one question before publishing.');

  for (const question of questions) {
    if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
      if (question.options.length < 2) {
        throw AppError.badRequest(
          'SURVEY_CHOICES_TOO_FEW',
          'Choice questions need at least two options before publishing.',
          { [question.id]: 'Add at least two choices.' },
        );
      }
      const values = question.options.map((option) => option.value);
      if (new Set(values).size !== values.length) {
        throw AppError.badRequest(
          'SURVEY_CHOICE_DUPLICATE',
          'Choice values must be unique inside each question.',
          { [question.id]: 'Use a different value for each choice.' },
        );
      }
    }

    if (question.type === 'RATING') {
      const min = question.ratingMin ?? 1;
      const max = question.ratingMax ?? 5;
      if (min < 1 || max > 10 || min > max) {
        throw AppError.badRequest('SURVEY_RATING_CONFIG_INVALID', 'Rating questions must use a valid 1–10 range.');
      }
    }

    if (question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT') {
      const min = question.minLength ?? 3;
      const max = question.maxLength ?? (question.type === 'SHORT_TEXT' ? 500 : 5000);
      if (min < 1 || max > 5000 || min > max) {
        throw AppError.badRequest('SURVEY_TEXT_CONFIG_INVALID', 'Text question limits are invalid.');
      }
    }
  }
}

async function publishRuleset(prisma: PrismaClient, row: SurveyDetailRow, now: Date) {
  const round = row.roundId
    ? await prisma.round.findUnique({ where: { id: row.roundId } })
    : await RoundService.getCurrent(prisma, now);

  if (row.roundId && !round) throw AppError.notFound('ROUND_NOT_FOUND', 'The target round no longer exists.');
  if (!round && rewardInputs(row.rewards).length) {
    throw AppError.conflict('SURVEY_REWARD_ROUND_REQUIRED', 'Start a round or target a round before publishing a rewarded global survey.');
  }
  return round ? loadRulesetForRound(round) : null;
}

async function assertPublishable(prisma: PrismaClient, row: SurveyDetailRow, now: Date): Promise<void> {
  assertDates(row.startsAt, row.endsAt, now);
  assertQuestionConfiguration(row.questions);
  const ruleset = await publishRuleset(prisma, row, now);
  if (ruleset) validateSurveyRewards(row.rewards, ruleset);
  else if (!Array.isArray(row.rewards)) throw AppError.badRequest('SURVEY_REWARDS_INVALID', 'Survey rewards must be a list.');
}

function assertStorableQuestions(questions: readonly AdminSurveyQuestionInput[]): void {
  questions.forEach((question, index) => {
    if (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE') return;
    const values = question.options.map((option) => option.value);
    if (new Set(values).size !== values.length) {
      throw AppError.badRequest(
        'SURVEY_CHOICE_DUPLICATE',
        'Choice values must be unique inside each question.',
        { [`questions.${index}`]: 'Use a different value for each choice.' },
      );
    }
  });
}

function assertInputQuestionConfiguration(questions: readonly AdminSurveyQuestionInput[]): void {
  if (!questions.length) throw AppError.badRequest('SURVEY_NO_QUESTIONS', 'Add at least one question before publishing.');
  questions.forEach((question, index) => {
    const field = `questions.${index}`;
    if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
      if (question.options.length < 2) {
        throw AppError.badRequest('SURVEY_CHOICES_TOO_FEW', 'Choice questions need at least two options before publishing.', { [field]: 'Add at least two choices.' });
      }
      const values = question.options.map((option) => option.value);
      if (new Set(values).size !== values.length) {
        throw AppError.badRequest('SURVEY_CHOICE_DUPLICATE', 'Choice values must be unique inside each question.', { [field]: 'Use a different value for each choice.' });
      }
    }
    if (question.type === 'RATING') {
      const min = question.ratingMin ?? 1;
      const max = question.ratingMax ?? 5;
      if (min < 1 || max > 10 || min > max) {
        throw AppError.badRequest('SURVEY_RATING_CONFIG_INVALID', 'Rating questions must use a valid 1–10 range.', { [field]: 'Check the rating range.' });
      }
    }
    if (question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT') {
      const min = question.minLength ?? 3;
      const max = question.maxLength ?? (question.type === 'SHORT_TEXT' ? 500 : 5000);
      if (min < 1 || max > 5000 || min > max) {
        throw AppError.badRequest('SURVEY_TEXT_CONFIG_INVALID', 'Text question limits are invalid.', { [field]: 'Check the text limits.' });
      }
    }
  });
}

async function assertDefinitionPublishable(
  prisma: PrismaClient,
  input: AdminSurveyDefinitionInput,
  now: Date,
): Promise<void> {
  const startsAt = dateValue(input.startsAt);
  const endsAt = dateValue(input.endsAt);
  assertDates(startsAt, endsAt, now);
  assertInputQuestionConfiguration(input.questions);

  const round = input.roundId
    ? await prisma.round.findUnique({ where: { id: input.roundId } })
    : await RoundService.getCurrent(prisma, now);
  if (input.roundId && !round) throw AppError.notFound('ROUND_NOT_FOUND', 'The target round no longer exists.');
  if (!round && input.rewards.length) {
    throw AppError.conflict('SURVEY_REWARD_ROUND_REQUIRED', 'Start a round or target a round before scheduling a rewarded global survey.');
  }
  if (round) {
    validateSurveyRewards(input.rewards as unknown as Prisma.InputJsonValue, loadRulesetForRound(round));
  }
}

async function requireEditable(prisma: PrismaClient, surveyId: string): Promise<SurveyDetailRow> {
  const row = await prisma.survey.findUnique({ where: { id: surveyId }, include: detailInclude });
  if (!row) throw AppError.notFound('SURVEY_NOT_FOUND', 'That survey does not exist.');
  if (row.status === 'LIVE' || row.status === 'CLOSED') {
    throw AppError.conflict('SURVEY_LOCKED', 'Live and closed surveys cannot be edited.');
  }
  if (row._count.submissions > 0) {
    throw AppError.conflict('SURVEY_HAS_RESPONSES', 'A survey with responses cannot be edited.');
  }
  return row;
}

export const AdminSurveyService = {
  async list(prisma: PrismaClient, now = new Date()): Promise<AdminSurveysDto> {
    await settleSurveySchedules(prisma, now);
    const [rows, rounds] = await Promise.all([
      prisma.survey.findMany({
        include: listInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.round.findMany({
        where: { status: { in: ['SCHEDULED', 'REGISTRATION', 'ACTIVE', 'ENDED'] } },
        orderBy: { startsAt: 'desc' },
        take: 30,
        select: { id: true, name: true, status: true, rulesetVersion: true },
      }),
    ]);
    return { now: now.toISOString(), surveys: rows.map(rowDto), rounds };
  },

  async detail(prisma: PrismaClient, surveyId: string, now = new Date()): Promise<AdminSurveyDetailDto> {
    await settleSurveySchedules(prisma, now);
    const row = await prisma.survey.findUnique({ where: { id: surveyId }, include: detailInclude });
    if (!row) throw AppError.notFound('SURVEY_NOT_FOUND', 'That survey does not exist.');
    return detailDto(row);
  },

  async create(
    prisma: PrismaClient,
    actor: AuditActor,
    input: AdminSurveyDefinitionInput,
    now = new Date(),
  ): Promise<AdminSurveyDetailDto> {
    const startsAt = dateValue(input.startsAt);
    const endsAt = dateValue(input.endsAt);
    assertStorableQuestions(input.questions);
    if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
      throw AppError.badRequest('SURVEY_WINDOW_INVALID', 'One of the survey dates is invalid.');
    }
    if (input.roundId && !(await prisma.round.findUnique({ where: { id: input.roundId }, select: { id: true } }))) {
      throw AppError.notFound('ROUND_NOT_FOUND', 'That target round does not exist.');
    }

    const id = await prisma.$transaction(async (tx) => {
      const row = await tx.survey.create({
        data: {
          ...definitionData(input),
          status: 'DRAFT',
          createdByUsername: actor.username,
          questions: { create: input.questions.map(questionCreate) },
        },
      });
      await AdminAuditService.record(tx, actor, {
        action: 'survey.create',
        targetType: 'survey',
        targetId: row.id,
        after: { title: row.title, roundId: row.roundId, startsAt: row.startsAt, endsAt: row.endsAt },
      });
      return row.id;
    });
    return AdminSurveyService.detail(prisma, id, now);
  },

  async update(
    prisma: PrismaClient,
    actor: AuditActor,
    surveyId: string,
    input: AdminSurveyDefinitionInput,
    now = new Date(),
  ): Promise<AdminSurveyDetailDto> {
    await settleSurveySchedules(prisma, now);
    const before = await requireEditable(prisma, surveyId);
    if (before.status === 'SCHEDULED') {
      await assertDefinitionPublishable(prisma, input, now);
    }
    if (input.roundId && !(await prisma.round.findUnique({ where: { id: input.roundId }, select: { id: true } }))) {
      throw AppError.notFound('ROUND_NOT_FOUND', 'That target round does not exist.');
    }
    const startsAt = dateValue(input.startsAt);
    const endsAt = dateValue(input.endsAt);
    assertStorableQuestions(input.questions);
    if (before.status === 'SCHEDULED' && (!startsAt || startsAt <= now)) {
      throw AppError.badRequest(
        'SURVEY_SCHEDULE_START_REQUIRED',
        'A scheduled survey must keep a future start time. Close it and create a new immediate survey to publish now.',
        { startsAt: 'Choose a future start time.' },
      );
    }
    assertDates(startsAt, endsAt, before.status === 'SCHEDULED' ? now : new Date(0));

    await prisma.$transaction(async (tx) => {
      await tx.surveyQuestion.deleteMany({ where: { surveyId } });
      const after = await tx.survey.update({
        where: { id: surveyId },
        data: {
          ...definitionData(input),
          questions: { create: input.questions.map(questionCreate) },
        },
      });
      await AdminAuditService.record(tx, actor, {
        action: 'survey.update',
        targetType: 'survey',
        targetId: surveyId,
        before: {
          title: before.title,
          roundId: before.roundId,
          startsAt: before.startsAt,
          endsAt: before.endsAt,
          rewards: before.rewards,
          questions: before.questions.map(questionDto),
        },
        after: { title: after.title, roundId: after.roundId, startsAt: after.startsAt, endsAt: after.endsAt, rewards: after.rewards },
      });
    });

    if (before.status === 'SCHEDULED') {
      await settleSurveySchedules(prisma, now);
    }
    return AdminSurveyService.detail(prisma, surveyId, now);
  },

  async publish(
    prisma: PrismaClient,
    actor: AuditActor,
    surveyId: string,
    now = new Date(),
  ): Promise<AdminSurveyDetailDto> {
    await settleSurveySchedules(prisma, now);
    const before = await requireEditable(prisma, surveyId);
    if (before.status !== 'DRAFT') {
      throw AppError.conflict('SURVEY_ALREADY_SCHEDULED', 'That survey is already scheduled.');
    }
    await assertPublishable(prisma, before, now);

    const scheduled = Boolean(before.startsAt && before.startsAt > now);
    await prisma.$transaction(async (tx) => {
      const after = await tx.survey.update({
        where: { id: surveyId },
        data: {
          status: scheduled ? 'SCHEDULED' : 'LIVE',
          publishedAt: scheduled ? null : now,
          closedAt: null,
          announcedAt: null,
        },
      });
      await AdminAuditService.record(tx, actor, {
        action: scheduled ? 'survey.schedule' : 'survey.publish',
        targetType: 'survey',
        targetId: surveyId,
        before: { status: before.status },
        after: { status: after.status, startsAt: after.startsAt, endsAt: after.endsAt },
      });
    });
    return AdminSurveyService.detail(prisma, surveyId, now);
  },

  async close(
    prisma: PrismaClient,
    actor: AuditActor,
    surveyId: string,
    reason: string,
    now = new Date(),
  ): Promise<AdminSurveyDetailDto> {
    await settleSurveySchedules(prisma, now);
    const before = await prisma.survey.findUnique({ where: { id: surveyId }, include: detailInclude });
    if (!before) throw AppError.notFound('SURVEY_NOT_FOUND', 'That survey does not exist.');
    if (before.status !== 'LIVE' && before.status !== 'SCHEDULED') {
      throw AppError.conflict('SURVEY_NOT_CLOSABLE', 'Only a live or scheduled survey can be closed.');
    }

    await prisma.$transaction(async (tx) => {
      const after = await tx.survey.update({
        where: { id: surveyId },
        data: { status: 'CLOSED', closedAt: now },
      });
      await AdminAuditService.record(tx, actor, {
        action: 'survey.close',
        targetType: 'survey',
        targetId: surveyId,
        reason,
        before: { status: before.status, endsAt: before.endsAt },
        after: { status: after.status, closedAt: after.closedAt },
      });
    });
    return AdminSurveyService.detail(prisma, surveyId, now);
  },
};
