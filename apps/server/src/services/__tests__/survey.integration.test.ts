import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV08H } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { RoundService } from '../round.service.js';

describe.runIf(process.env.SURVEY_INTEGRATION === '1')('Survey Phase B with PostgreSQL', () => {
  const rules = classicOgV08H;
  let app: FastifyInstance;
  let accountId = '';
  let cookie = '';
  let roundId = '';
  let otherRoundId = '';
  const surveyIds: string[] = [];

  async function makeSurvey(data: Partial<{
    title: string;
    status: 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'CLOSED';
    roundId: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
  }> = {}) {
    const row = await app.prisma.survey.create({
      data: {
        title: data.title ?? `Survey ${randomUUID().slice(0, 6)}`,
        description: 'Tell us what you think about the current change.',
        status: data.status ?? 'LIVE',
        roundId: data.roundId === undefined ? null : data.roundId,
        startsAt: data.startsAt === undefined ? null : data.startsAt,
        endsAt: data.endsAt === undefined ? null : data.endsAt,
        rewards: [{ kind: 'CASH', amount: 1_000 }],
        createdByUsername: 'survey-phase-b-test',
        questions: {
          create: [
            {
              type: 'RATING',
              prompt: 'How does this change feel?',
              required: true,
              position: 2,
              ratingMin: 1,
              ratingMax: 5,
            },
            {
              type: 'SINGLE_CHOICE',
              prompt: 'Which layout is clearer?',
              required: true,
              position: 1,
              options: {
                create: [
                  { value: 'B', label: 'Layout B', position: 2 },
                  { value: 'A', label: 'Layout A', position: 1 },
                ],
              },
            },
          ],
        },
      },
    });
    surveyIds.push(row.id);
    return row;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const username = `svb_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, email: `${username}@example.invalid`, password: randomUUID() },
    });
    expect(registered.statusCode, registered.body).toBeLessThan(300);
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');

    const now = Date.now();
    const current = await app.prisma.round.create({
      data: {
        name: 'Survey B Live',
        slug: `survey-b-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date(now - 86_400_000),
        endsAt: new Date(now + 10 * 86_400_000),
      },
    });
    roundId = current.id;

    const other = await app.prisma.round.create({
      data: {
        name: 'Survey B Other',
        slug: `survey-b-other-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ENDED',
        startsAt: new Date(now - 20 * 86_400_000),
        endsAt: new Date(now - 10 * 86_400_000),
      },
    });
    otherRoundId = other.id;

    const cityId = (await app.prisma.city.findUniqueOrThrow({
      where: { slug: rules.round.startingCitySlug },
    })).id;
    await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId,
        cityId,
        displayName: username,
        publicPimpId: 7811,
      },
    });

    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () =>
      app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(async () =>
      app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (surveyIds.length) await app.prisma.survey.deleteMany({ where: { id: { in: surveyIds } } }).catch(() => undefined);
    if (roundId || otherRoundId) {
      await app.prisma.round.deleteMany({ where: { id: { in: [roundId, otherRoundId].filter(Boolean) } } }).catch(() => undefined);
    }
    if (accountId) await app.prisma.account.deleteMany({ where: { id: accountId } }).catch(() => undefined);
    await app?.close();
  });

  const get = (path: string, withCookie = true) => app.inject({
    method: 'GET',
    url: `/api/game${path}`,
    ...(withCookie ? { headers: { cookie } } : {}),
  });

  it('lists only live, in-window global/current-round surveys and keeps completed history', async () => {
    const openGlobal = await makeSurvey({ title: 'Open global' });
    const openRound = await makeSurvey({ title: 'Open round', roundId });
    await makeSurvey({ title: 'Draft', status: 'DRAFT' });
    await makeSurvey({ title: 'Future', status: 'LIVE', startsAt: new Date(Date.now() + 86_400_000) });
    await makeSurvey({ title: 'Expired', status: 'LIVE', endsAt: new Date(Date.now() - 1_000) });
    await makeSurvey({ title: 'Other round', status: 'LIVE', roundId: otherRoundId });

    const completed = await makeSurvey({ title: 'Completed and closed', status: 'CLOSED', roundId });
    const player = await app.prisma.roundPlayer.findUniqueOrThrow({
      where: { roundId_accountId: { roundId, accountId } },
    });
    await app.prisma.surveySubmission.create({
      data: {
        surveyId: completed.id,
        accountId,
        roundPlayerId: player.id,
        rewardSnapshot: [{ kind: 'CASH', amount: 1_000 }],
      },
    });

    const response = await get('/surveys');
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.serverTime).toEqual(expect.any(String));
    expect(new Set(body.available.map((row: { id: string }) => row.id))).toEqual(new Set([openGlobal.id, openRound.id]));
    expect(body.completed.map((row: { id: string }) => row.id)).toContain(completed.id);
    expect(body.completed.find((row: { id: string }) => row.id === completed.id).completion.submittedAt).toEqual(expect.any(String));
  });

  it('returns questions/options in authored order and hides unavailable direct links', async () => {
    const visible = await makeSurvey({ title: 'Detail visible', roundId });
    const hidden = await makeSurvey({ title: 'Detail hidden', status: 'DRAFT', roundId });

    const response = await get(`/surveys/${visible.id}`);
    expect(response.statusCode, response.body).toBe(200);
    const detail = response.json();
    expect(detail.questions.map((question: { position: number }) => question.position)).toEqual([1, 2]);
    expect(detail.questions[0].options.map((option: { value: string }) => option.value)).toEqual(['A', 'B']);

    expect((await get(`/surveys/${hidden.id}`)).statusCode).toBe(404);
  });

  it('allows a completed closed survey to be reopened from history', async () => {
    const completed = await makeSurvey({ title: 'History detail', status: 'CLOSED', roundId });
    const player = await app.prisma.roundPlayer.findUniqueOrThrow({
      where: { roundId_accountId: { roundId, accountId } },
    });
    await app.prisma.surveySubmission.create({
      data: {
        surveyId: completed.id,
        accountId,
        roundPlayerId: player.id,
        rewardSnapshot: [{ kind: 'CASH', amount: 1_000 }],
      },
    });

    const response = await get(`/surveys/${completed.id}`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().completion).not.toBeNull();
  });

  it('requires authentication', async () => {
    expect((await get('/surveys', false)).statusCode).toBe(401);
  });
});
