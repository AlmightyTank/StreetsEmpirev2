import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { classicOgV08H } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { AdminSurveyService } from '../admin-survey.service.js';
import { AdminSurveyResultsService } from '../admin-survey-results.service.js';
import { NotificationService } from '../notification.service.js';
import { settleSurveySchedules } from '../survey-schedule.service.js';

describe.runIf(process.env.SURVEY_INTEGRATION === '1')('Survey Phase C submission with PostgreSQL', () => {
  const rules = classicOgV08H;
  let app: FastifyInstance;
  let accountId = '';
  let playerId = '';
  let cookie = '';
  let roundId = '';
  const surveyIds: string[] = [];
  const extraAccountIds: string[] = [];

  async function makeSurvey(title: string, rewards: Prisma.InputJsonValue = [{ kind: 'CASH', amount: 12_345 }, { kind: 'TURNS', amount: 7 }]) {
    const survey = await app.prisma.survey.create({
      data: {
        title,
        description: 'Phase C completion test.',
        status: 'LIVE',
        roundId,
        rewards,
        createdByUsername: 'survey-phase-c-test',
        questions: {
          create: [
            { type: 'YES_NO', prompt: 'Did you try it?', required: true, position: 1 },
            {
              type: 'SINGLE_CHOICE',
              prompt: 'Better or worse?',
              required: true,
              position: 2,
              options: { create: [
                { value: 'BETTER', label: 'Better', position: 1 },
                { value: 'WORSE', label: 'Worse', position: 2 },
              ] },
            },
            {
              type: 'MULTIPLE_CHOICE',
              prompt: 'Where did you try it?',
              required: true,
              position: 3,
              options: { create: [
                { value: 'DESKTOP', label: 'Desktop', position: 1 },
                { value: 'MOBILE', label: 'Mobile', position: 2 },
              ] },
            },
            { type: 'RATING', prompt: 'Rate it.', required: true, position: 4, ratingMin: 1, ratingMax: 5 },
            { type: 'SHORT_TEXT', prompt: 'Short note.', required: true, position: 5 },
            { type: 'LONG_TEXT', prompt: 'Anything else?', required: false, position: 6 },
          ],
        },
      },
    });
    surveyIds.push(survey.id);
    return survey;
  }

  const validAnswers = (surveyQuestions: Array<{ id: string; type: string }>, feedback = 'I hate the current spacing.') =>
    surveyQuestions.map((question) => {
      switch (question.type) {
        case 'YES_NO': return { questionId: question.id, value: true };
        case 'SINGLE_CHOICE': return { questionId: question.id, value: 'WORSE' };
        case 'MULTIPLE_CHOICE': return { questionId: question.id, value: ['DESKTOP', 'MOBILE'] };
        case 'RATING': return { questionId: question.id, value: 2 };
        case 'SHORT_TEXT': return { questionId: question.id, value: feedback };
        case 'LONG_TEXT': return { questionId: question.id, value: 'Please keep working on it.' };
        default: throw new Error(`Unexpected question type ${question.type}`);
      }
    });

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const username = `svc_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, email: `${username}@example.invalid`, password: randomUUID() },
    });
    expect(registered.statusCode, registered.body).toBeLessThan(300);
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');

    const now = Date.now();
    const round = await app.prisma.round.create({
      data: {
        name: 'Survey C Live',
        slug: `survey-c-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date(now - 86_400_000),
        endsAt: new Date(now + 10 * 86_400_000),
      },
    });
    roundId = round.id;

    const cityId = (await app.prisma.city.findUniqueOrThrow({
      where: { slug: rules.round.startingCitySlug },
    })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId,
        cityId,
        displayName: username,
        publicPimpId: 7821,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    playerId = player.id;

    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () =>
      app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(async () =>
      app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (surveyIds.length) await app.prisma.survey.deleteMany({ where: { id: { in: surveyIds } } }).catch(() => undefined);
    if (roundId) await app.prisma.round.deleteMany({ where: { id: roundId } }).catch(() => undefined);
    if (extraAccountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: extraAccountIds } } }).catch(() => undefined);
    if (accountId) await app.prisma.account.deleteMany({ where: { id: accountId } }).catch(() => undefined);
    await app?.close();
  });

  async function submit(surveyId: string, actionId: string, answers: object[]) {
    return app.inject({
      method: 'POST',
      url: `/api/game/surveys/${surveyId}/submit`,
      headers: { cookie },
      payload: { actionId, answers },
    });
  }

  it('stores critical feedback and pays the advertised reward once', async () => {
    const survey = await makeSurvey('Critical feedback still pays');
    const questions = await app.prisma.surveyQuestion.findMany({
      where: { surveyId: survey.id },
      orderBy: { position: 'asc' },
    });
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const actionId = randomUUID();

    const first = await submit(survey.id, actionId, validAnswers(questions));
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().result).toMatchObject({
      surveyId: survey.id,
      submittedAt: expect.any(String),
      rewards: [
        expect.objectContaining({ kind: 'CASH' }),
        expect.objectContaining({ kind: 'TURNS' }),
      ],
    });

    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(after.cashCents - before.cashCents).toBe(12_345n);
    expect(after.turns - before.turns).toBe(7);

    const stored = await app.prisma.surveySubmission.findUniqueOrThrow({
      where: { surveyId_accountId: { surveyId: survey.id, accountId } },
      include: { answers: { orderBy: { question: { position: 'asc' } } } },
    });
    expect(stored.rewardGrantedAt).not.toBeNull();
    expect(stored.rewardSnapshot).toEqual([{ kind: 'CASH', amount: 12_345 }, { kind: 'TURNS', amount: 7 }]);
    expect(stored.answers).toHaveLength(6);
    expect(stored.answers.some((answer) => answer.value === 'I hate the current spacing.')).toBe(true);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/game/surveys/${survey.id}`,
      headers: { cookie },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().answers).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'I hate the current spacing.' }),
    ]));

    // Same action id replays the original result even if the client retries with changed answers.
    const replay = await submit(survey.id, actionId, validAnswers(questions, 'I love it now.'));
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const afterReplay = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(afterReplay.cashCents).toBe(after.cashCents);
    expect(afterReplay.turns).toBe(after.turns);

    // A fresh action id cannot collect the same survey a second time.
    const second = await submit(survey.id, randomUUID(), validAnswers(questions));
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('SURVEY_ALREADY_COMPLETED');
  });

  it('pays nothing and stores nothing when a required answer is missing', async () => {
    const survey = await makeSurvey('Missing required answer');
    const questions = await app.prisma.surveyQuestion.findMany({
      where: { surveyId: survey.id },
      orderBy: { position: 'asc' },
    });
    const answers = validAnswers(questions).slice(1);
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });

    const response = await submit(survey.id, randomUUID(), answers);
    expect(response.statusCode).toBe(400);

    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(after.cashCents).toBe(before.cashCents);
    expect(after.turns).toBe(before.turns);
    expect(await app.prisma.surveySubmission.findUnique({
      where: { surveyId_accountId: { surveyId: survey.id, accountId } },
    })).toBeNull();
  });

  it('rejects stale or invalid choices without paying', async () => {
    const survey = await makeSurvey('Invalid option');
    const questions = await app.prisma.surveyQuestion.findMany({
      where: { surveyId: survey.id },
      orderBy: { position: 'asc' },
    });
    const answers = validAnswers(questions);
    const singleIndex = questions.findIndex((question) => question.type === 'SINGLE_CHOICE');
    answers[singleIndex] = { questionId: questions[singleIndex]!.id, value: 'NOT_AN_OPTION' };
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });

    const response = await submit(survey.id, randomUUID(), answers);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('SURVEY_CHOICE_INVALID');

    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(after.cashCents).toBe(before.cashCents);
    expect(after.turns).toBe(before.turns);
  });

  it('rejects a survey that closes before submit', async () => {
    const survey = await makeSurvey('Closed before submit');
    const questions = await app.prisma.surveyQuestion.findMany({
      where: { surveyId: survey.id },
      orderBy: { position: 'asc' },
    });
    await app.prisma.survey.update({
      where: { id: survey.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    const response = await submit(survey.id, randomUUID(), validAnswers(questions));
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SURVEY_NOT_AVAILABLE');
  });

  it('creates and publishes an audited survey through the Phase E admin service', async () => {
    const actor = await app.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { id: true, username: true },
    });
    const created = await AdminSurveyService.create(app.prisma, actor, {
      title: 'Phase E admin survey',
      description: 'Verify draft creation and publish auditing.',
      releaseTag: '1.1.0-E',
      featureTag: 'Surveys',
      roundId,
      startsAt: null,
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      rewards: [{ kind: 'CASH', amount: 5000 }],
      questions: [{
        type: 'YES_NO',
        prompt: 'Did the admin builder work?',
        description: null,
        required: true,
        options: [],
      }],
    });
    surveyIds.push(created.id);
    expect(created.status).toBe('DRAFT');

    const published = await AdminSurveyService.publish(app.prisma, actor, created.id);
    expect(published.status).toBe('LIVE');
    expect(published.publishedAt).toEqual(expect.any(String));

    const actions = await app.prisma.adminAuditLog.findMany({
      where: { targetType: 'survey', targetId: created.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(actions.map((row) => row.action)).toEqual(['survey.create', 'survey.publish']);
  });

  it('promotes due scheduled surveys and closes expired ones', async () => {
    const due = await app.prisma.survey.create({
      data: {
        title: 'Due scheduled survey',
        description: 'Due now.',
        status: 'SCHEDULED',
        roundId,
        startsAt: new Date(Date.now() - 5_000),
        endsAt: new Date(Date.now() + 86_400_000),
        rewards: [],
        createdByUsername: 'phase-e-test',
        questions: { create: [{ type: 'YES_NO', prompt: 'Ready?', required: true, position: 1 }] },
      },
    });
    const expired = await app.prisma.survey.create({
      data: {
        title: 'Expired live survey',
        description: 'Already over.',
        status: 'LIVE',
        roundId,
        endsAt: new Date(Date.now() - 5_000),
        rewards: [],
        createdByUsername: 'phase-e-test',
        questions: { create: [{ type: 'YES_NO', prompt: 'Too late?', required: true, position: 1 }] },
      },
    });
    surveyIds.push(due.id, expired.id);

    const settled = await settleSurveySchedules(app.prisma, new Date());
    expect(settled.opened).toBeGreaterThanOrEqual(1);
    expect(settled.closed).toBeGreaterThanOrEqual(1);
    expect((await app.prisma.survey.findUniqueOrThrow({ where: { id: due.id } })).status).toBe('LIVE');
    expect((await app.prisma.survey.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe('CLOSED');
  });

  it('announces a newly-live survey only once and links to that survey', async () => {
    const survey = await makeSurvey('Phase E notification');
    await app.prisma.notificationSettings.upsert({
      where: { accountId },
      create: { accountId, announcementsEnabled: true },
      update: { announcementsEnabled: true },
    });

    await NotificationService.collect(app.prisma, new Date(), { discord: false, push: false });
    await NotificationService.collect(app.prisma, new Date(), { discord: false, push: false });

    const stored = await app.prisma.survey.findUniqueOrThrow({ where: { id: survey.id } });
    expect(stored.announcedAt).not.toBeNull();

    const activities = await app.prisma.playerActivity.findMany({
      where: { roundPlayerId: playerId, type: 'GAME_ANNOUNCEMENT' },
      orderBy: { createdAt: 'desc' },
    });
    const matching = activities.filter((activity) =>
      (activity.payload as { surveyId?: string }).surveyId === survey.id);
    expect(matching).toHaveLength(1);
    expect(matching[0]!.payload).toMatchObject({
      href: `/game/surveys?tab=available&survey=${encodeURIComponent(survey.id)}`,
    });

    expect(await app.prisma.inAppNotification.count({
      where: { roundPlayerId: playerId, activity: { id: matching[0]!.id } },
    })).toBe(1);
  });

  it('reports a private 50 percent response rate and searchable anonymous text', async () => {
    const survey = await makeSurvey('Phase F analytics');
    const questions = await app.prisma.surveyQuestion.findMany({
      where: { surveyId: survey.id },
      orderBy: { position: 'asc' },
    });
    const response = await submit(
      survey.id,
      randomUUID(),
      validAnswers(questions, 'The voucher discount still looks broken on mobile.'),
    );
    expect(response.statusCode, response.body).toBe(200);

    const secondName = `svc_${randomUUID().slice(0, 6)}`;
    const secondRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: secondName,
        email: `${secondName}@example.invalid`,
        password: randomUUID(),
      },
    });
    expect(secondRegistration.statusCode, secondRegistration.body).toBeLessThan(300);
    const secondAccountId = secondRegistration.json().account.id as string;
    extraAccountIds.push(secondAccountId);

    const cityId = (await app.prisma.city.findUniqueOrThrow({
      where: { slug: rules.round.startingCitySlug },
    })).id;
    const secondPlayer = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId: secondAccountId,
        cityId,
        displayName: secondName,
        publicPimpId: 7822,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });

    const results = await AdminSurveyResultsService.results(app.prisma, survey.id, {
      q: 'voucher',
      page: 1,
      pageSize: 25,
    });

    expect(results.overview).toMatchObject({
      eligibleAccounts: 2,
      submissions: 1,
      responseRate: 50,
      rewardsGranted: 1,
    });
    const single = results.questions.find((question) => question.type === 'SINGLE_CHOICE');
    expect(single).toMatchObject({
      answered: 1,
      aggregate: {
        kind: 'CHOICE',
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'WORSE', count: 1, percent: 100 }),
        ]),
      },
    });
    const multiple = results.questions.find((question) => question.type === 'MULTIPLE_CHOICE');
    expect(multiple).toMatchObject({
      answered: 1,
      aggregate: {
        kind: 'CHOICE',
        multiple: true,
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'DESKTOP', count: 1, percent: 100 }),
          expect.objectContaining({ value: 'MOBILE', count: 1, percent: 100 }),
        ]),
      },
    });
    expect(results.textResponses.total).toBe(1);
    expect(results.textResponses.responses[0]).toMatchObject({
      responseNumber: 1,
      value: 'The voucher discount still looks broken on mobile.',
    });

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain(accountId);
    expect(serialized).not.toContain(secondAccountId);
    expect(serialized).not.toContain(playerId);
    expect(serialized).not.toContain(secondPlayer.id);
    expect(serialized).not.toContain(secondName);
  });
});
