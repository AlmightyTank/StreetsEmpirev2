import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  AdminSurveyAnonymousTextResponseDto,
  AdminSurveyQuestionResultDto,
  AdminSurveyResultsDto,
  AdminSurveyResultsQueryParsed,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { settleSurveySchedules } from './survey-schedule.service.js';

const resultsInclude = {
  round: { select: { name: true } },
  questions: {
    include: { options: { orderBy: { position: 'asc' as const } } },
    orderBy: { position: 'asc' as const },
  },
  submissions: {
    orderBy: [{ submittedAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      submittedAt: true,
      rewardGrantedAt: true,
      rewardSnapshot: true,
      answers: {
        select: { questionId: true, value: true },
      },
    },
  },
} satisfies Prisma.SurveyInclude;

type SurveyResultsRow = Prisma.SurveyGetPayload<{ include: typeof resultsInclude }>;
type QuestionRow = SurveyResultsRow['questions'][number];
type SubmissionRow = SurveyResultsRow['submissions'][number];

function pct(count: number, denominator: number): number {
  return denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : 0;
}

function asBoolean(value: Prisma.JsonValue): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: Prisma.JsonValue): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: Prisma.JsonValue): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function valuesFor(questionId: string, submissions: SubmissionRow[]): Prisma.JsonValue[] {
  return submissions.flatMap((submission) => {
    const answer = submission.answers.find((row) => row.questionId === questionId);
    return answer ? [answer.value] : [];
  });
}

function aggregateQuestion(question: QuestionRow, submissions: SubmissionRow[]): AdminSurveyQuestionResultDto {
  const values = valuesFor(question.id, submissions);
  const answered = values.length;
  const skipped = Math.max(0, submissions.length - answered);
  const base = {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    required: question.required,
    position: question.position,
    answered,
    skipped,
  };

  if (question.type === 'YES_NO') {
    const yes = values.filter((value) => asBoolean(value) === true).length;
    const no = values.filter((value) => asBoolean(value) === false).length;
    return {
      ...base,
      aggregate: {
        kind: 'YES_NO',
        yes,
        no,
        yesPercent: pct(yes, answered),
        noPercent: pct(no, answered),
      },
    };
  }

  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    const counts = new Map(question.options.map((option) => [option.value, 0]));
    for (const value of values) {
      const selected = question.type === 'MULTIPLE_CHOICE' ? asStringArray(value) : [asString(value)].filter((entry): entry is string => Boolean(entry));
      for (const key of selected) {
        if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return {
      ...base,
      aggregate: {
        kind: 'CHOICE',
        multiple: question.type === 'MULTIPLE_CHOICE',
        options: question.options.map((option) => {
          const count = counts.get(option.value) ?? 0;
          return {
            value: option.value,
            label: option.label,
            count,
            percent: pct(count, answered),
          };
        }),
      },
    };
  }

  if (question.type === 'RATING') {
    const min = question.ratingMin ?? 1;
    const max = question.ratingMax ?? 5;
    const numeric = values.map(asNumber).filter((value): value is number => value !== null);
    const counts = new Map<number, number>();
    for (let value = min; value <= max; value += 1) counts.set(value, 0);
    for (const value of numeric) {
      if (counts.has(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const average = numeric.length
      ? Math.round((numeric.reduce((sum, value) => sum + value, 0) / numeric.length) * 100) / 100
      : null;
    return {
      ...base,
      aggregate: {
        kind: 'RATING',
        average,
        min,
        max,
        buckets: [...counts.entries()].map(([value, count]) => ({
          value: String(value),
          label: String(value),
          count,
          percent: pct(count, answered),
        })),
      },
    };
  }

  return {
    ...base,
    aggregate: { kind: 'TEXT', responseCount: answered },
  };
}

function effectiveWindow(survey: SurveyResultsRow, now: Date): { start: Date; end: Date } | null {
  if (survey.status === 'DRAFT' || survey.status === 'SCHEDULED') return null;
  const start = survey.publishedAt ?? survey.startsAt ?? survey.createdAt;
  const endCandidates = [now, survey.endsAt, survey.closedAt].filter((value): value is Date => Boolean(value));
  const end = new Date(Math.min(...endCandidates.map((value) => value.getTime())));
  return end > start ? { start, end } : null;
}

async function eligibleAccounts(prisma: PrismaClient, survey: SurveyResultsRow, now: Date): Promise<number> {
  const window = effectiveWindow(survey, now);
  if (!window) return 0;

  const rows = survey.roundId
    ? await prisma.roundPlayer.findMany({
        where: {
          roundId: survey.roundId,
          createdAt: { lte: window.end },
        },
        distinct: ['accountId'],
        select: { accountId: true },
      })
    : await prisma.roundPlayer.findMany({
        where: {
          createdAt: { lte: window.end },
          round: { endsAt: { gt: window.start } },
        },
        distinct: ['accountId'],
        select: { accountId: true },
      });
  return rows.length;
}

function completionTrend(submissions: SubmissionRow[]): AdminSurveyResultsDto['completionTrend'] {
  const counts = new Map<string, number>();
  for (const submission of submissions) {
    const day = submission.submittedAt.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let cumulative = 0;
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => {
      cumulative += count;
      return { date, count, cumulative };
    });
}

function textResponses(
  survey: SurveyResultsRow,
  query: AdminSurveyResultsQueryParsed,
): AdminSurveyResultsDto['textResponses'] {
  const textQuestions = survey.questions.filter(
    (question) => question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT',
  );
  if (query.questionId && !textQuestions.some((question) => question.id === query.questionId)) {
    throw AppError.badRequest(
      'SURVEY_TEXT_QUESTION_NOT_FOUND',
      'That text question is not part of this survey.',
      { questionId: 'Choose a short-text or long-text question from this survey.' },
    );
  }

  const questionById = new Map(textQuestions.map((question) => [question.id, question]));
  const responseNumber = new Map(survey.submissions.map((submission, index) => [submission.id, index + 1]));
  const needle = query.q.toLocaleLowerCase();

  const matches: AdminSurveyAnonymousTextResponseDto[] = [];
  for (const submission of survey.submissions) {
    for (const answer of submission.answers) {
      const question = questionById.get(answer.questionId);
      if (!question || (query.questionId && question.id !== query.questionId)) continue;
      const value = asString(answer.value)?.trim();
      if (!value) continue;
      if (needle && !value.toLocaleLowerCase().includes(needle)) continue;
      matches.push({
        responseNumber: responseNumber.get(submission.id)!,
        submittedAt: submission.submittedAt.toISOString(),
        questionId: question.id,
        prompt: question.prompt,
        value,
      });
    }
  }

  matches.sort((left, right) =>
    right.submittedAt.localeCompare(left.submittedAt)
    || left.responseNumber - right.responseNumber
    || left.questionId.localeCompare(right.questionId));

  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;

  return {
    query: query.q,
    questionId: query.questionId ?? null,
    page,
    pageSize: query.pageSize,
    total,
    totalPages,
    responses: matches.slice(start, start + query.pageSize),
  };
}

export const AdminSurveyResultsService = {
  async results(
    prisma: PrismaClient,
    surveyId: string,
    query: AdminSurveyResultsQueryParsed,
    now = new Date(),
  ): Promise<AdminSurveyResultsDto> {
    await settleSurveySchedules(prisma, now);
    const survey = await prisma.survey.findUnique({
      where: { id: surveyId },
      include: resultsInclude,
    });
    if (!survey) throw AppError.notFound('SURVEY_NOT_FOUND', 'That survey does not exist.');

    const eligible = await eligibleAccounts(prisma, survey, now);
    const submissions = survey.submissions.length;
    const submittedTimes = survey.submissions.map((row) => row.submittedAt);
    return {
      survey: {
        id: survey.id,
        title: survey.title,
        status: survey.status,
        releaseTag: survey.releaseTag,
        featureTag: survey.featureTag,
        roundId: survey.roundId,
        roundName: survey.round?.name ?? null,
      },
      overview: {
        eligibleAccounts: Math.max(eligible, submissions),
        submissions,
        responseRate: pct(submissions, Math.max(eligible, submissions)),
        rewardsGranted: survey.submissions.filter(
          (row) => row.rewardGrantedAt !== null && Array.isArray(row.rewardSnapshot) && row.rewardSnapshot.length > 0,
        ).length,
        firstSubmittedAt: submittedTimes[0]?.toISOString() ?? null,
        lastSubmittedAt: submittedTimes.length ? submittedTimes[submittedTimes.length - 1]!.toISOString() : null,
      },
      completionTrend: completionTrend(survey.submissions),
      questions: survey.questions.map((question) => aggregateQuestion(question, survey.submissions)),
      textResponses: textResponses(survey, query),
    };
  },
};

export { aggregateQuestion };
