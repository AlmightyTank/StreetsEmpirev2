import type { FastifyPluginAsync } from 'fastify';
import { toActivityDto } from '../game/dto.js';
import { ActivityService } from '../services/activity.service.js';
import { MentoringService } from '../services/mentoring.service.js';
import { PlayerExperienceService } from '../services/player-experience.service.js';
import { CommunityService } from '../services/community.service.js';
import { PlayerStateService } from '../services/player-state.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundService } from '../services/round.service.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { forumUserIdSchema } from '../services/forum-proof.js';
import { parseBody } from '../utils/validate.js';
import { z } from 'zod';
import { EmpireLegacyService } from '../services/empire-legacy.service.js';
import { CAREER_KEYS, PlayerCareerService } from '../services/player-career.service.js';
import { CareerStoryService } from '../services/career-story.service.js';
import { careerStoryChoiceSchema } from '@streets/shared';

const MAX_ACTIVITY = 100;

const communityRoutes: FastifyPluginAsync = async (fastify) => {
  async function requireSettledPlayer(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const existing = await RoundPlayerService.find(fastify.prisma, round.id, accountId);

    if (!existing) {
      throw AppError.notFound('NOT_IN_ROUND', `You have not entered ${round.name} yet.`);
    }

    const settled = await PlayerStateService.settle(fastify.prisma, existing.id, {
      markActive: true,
    });

    return { round, settled };
  }

  /** 0.1.0-E: national and current-city leaderboards. */
  fastify.get('/rankings', { preHandler: fastify.requireAuth }, async (request) => {
    const { settled } = await requireSettledPlayer(request.auth!.account.id);

    return CommunityService.rankings(
      fastify.prisma,
      settled.player,
      settled.ruleset.rankings.topCount,
      settled.ruleset,
    );
  });

  /** 0.3.0-A: public past-round podiums. */
  fastify.get('/hall-of-fame', async () => CommunityService.hallOfFame(fastify.prisma));

  // Mentoring: a new player names a seasoned mentor, who earns XP as they level.
  fastify.get('/mentoring', { preHandler: fastify.requireAuth }, async (request) => MentoringService.view(fastify.prisma, request.auth!.account.id));
  fastify.post('/mentoring', { preHandler: fastify.requireAuth }, async (request) => {
    const body = request.body as { mentorPublicPimpId?: unknown } | null;
    const id = Number(body?.mentorPublicPimpId);
    if (!Number.isSafeInteger(id) || id <= 0) throw AppError.badRequest('VALIDATION_FAILED', 'Enter the player number of your mentor.');
    return MentoringService.choose(fastify.prisma, request.auth!.account.id, id);
  });

  // Endgame: account XP earned this calendar year (or ?year=YYYY), across every round.
  fastify.get('/xp-leaderboard', { preHandler: fastify.requireAuth }, async (request) => {
    const thisYear = new Date().getUTCFullYear();
    const asked = Number((request.query as { year?: string }).year);
    const year = Number.isInteger(asked) && asked >= 2024 && asked <= thisYear ? asked : thisYear;
    return PlayerExperienceService.yearlyLeaderboard(fastify.prisma, year, request.auth!.account.id);
  });

  /** Fair competitive seasons: permanent account history, no carry-forward power. */
  fastify.get('/career', { preHandler: fastify.requireAuth }, async (request) => ({
    career: await CommunityService.career(fastify.prisma, request.auth!.account.id),
  }));

  fastify.get('/career-identity', { preHandler: fastify.requireAuth }, async (request) => ({
    career: await PlayerCareerService.get(fastify.prisma, request.auth!.account.id),
    choices: CAREER_KEYS,
  }));

  fastify.post('/career-identity', { preHandler: fastify.requireAuth }, async (request) => {
    const { settled } = await requireSettledPlayer(request.auth!.account.id);
    const schema = z.object({ career: z.enum(CAREER_KEYS as [typeof CAREER_KEYS[number], ...typeof CAREER_KEYS]) }).strict();
    const { career } = parseBody(schema, request.body);
    return { career: await PlayerCareerService.choose(fastify.prisma, {
      accountId: request.auth!.account.id,
      roundPlayerId: settled.player.id,
      key: career,
    }) };
  });

  fastify.get('/career-story', { preHandler: fastify.requireAuth }, async (request) => {
    const { settled } = await requireSettledPlayer(request.auth!.account.id);
    return { story: await CareerStoryService.active(fastify.prisma, { accountId: request.auth!.account.id, roundPlayerId: settled.player.id, ruleset: settled.ruleset }) };
  });

  fastify.post('/career-story/choice', { preHandler: fastify.requireAuth }, async (request) => {
    const { settled } = await requireSettledPlayer(request.auth!.account.id);
    const input = parseBody(careerStoryChoiceSchema, request.body);
    return { choice: await CareerStoryService.choose(fastify.prisma, { accountId: request.auth!.account.id, roundPlayerId: settled.player.id, ruleset: settled.ruleset, ...input }) };
  });

  fastify.get('/career-story/portfolio', { preHandler: fastify.requireAuth }, async (request) => ({ portfolio: await CareerStoryService.portfolio(fastify.prisma, request.auth!.account.id) }));

  fastify.get('/career-story/portfolio/public/:publicPimpId', { preHandler: fastify.requireAuth }, async (request) => {
    const publicPimpId = Number((request.params as { publicPimpId?: string }).publicPimpId);
    if (!Number.isSafeInteger(publicPimpId) || publicPimpId < 1) throw AppError.badRequest('INVALID_PIMP_ID', 'That pimp number is not valid.');
    const target = await fastify.prisma.roundPlayer.findFirst({ where: { publicPimpId }, select: { accountId: true } });
    if (!target) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player was not found.');
    return { portfolio: await CareerStoryService.portfolio(fastify.prisma, target.accountId, 'PUBLIC') };
  });

  /** Select one immutable receipt for the public profile; null clears the slot. */
  fastify.post('/legacy/feature', { preHandler: fastify.requireAuth }, async (request) => {
    const { entryId } = parseBody(z.object({ entryId: z.string().cuid().nullable() }), request.body);
    return { entries: await EmpireLegacyService.feature(fastify.prisma, request.auth!.account.id, entryId) };
  });

  /** 0.1.0-E: public, deliberately non-sensitive player profile. */
  fastify.get('/players/:publicPimpId', { preHandler: fastify.requireAuth }, async (request) => {
    const params = request.params as { publicPimpId?: string };
    const publicPimpId = Number(params.publicPimpId);

    if (!Number.isSafeInteger(publicPimpId) || publicPimpId < 1) {
      throw AppError.badRequest('INVALID_PIMP_ID', 'That pimp number is not valid.');
    }

    const { round, settled } = await requireSettledPlayer(request.auth!.account.id);
    const player = await CommunityService.profile(
      fastify.prisma,
      round.id,
      publicPimpId,
      settled.player.publicPimpId,
      settled.ruleset,
    );

    return { player };
  });

  /** 0.1.0-E: the player's full recent history rather than the dashboard's ten rows. */
  fastify.get('/forum-players/:forumUserId', { preHandler: fastify.requireAuth }, async (request) => {
    const { forumUserId } = parseBody(z.object({ forumUserId: forumUserIdSchema }), request.params);
    const link = await fastify.prisma.forumLink.findFirst({ where: {
      forumOrigin: env.forum.origin, forumUserId, account: { isActive: true },
    } });
    if (!link) throw AppError.notFound('FORUM_NOT_LINKED', 'This forum account has not linked a game profile.');
    const { round, settled } = await requireSettledPlayer(request.auth!.account.id);
    const target = await RoundPlayerService.find(fastify.prisma, round.id, link.accountId);
    if (!target) throw AppError.notFound('PLAYER_NOT_IN_ROUND', 'This player has not entered the current round yet.');
    return { player: await CommunityService.profile(fastify.prisma, round.id, target.publicPimpId, settled.player.publicPimpId, settled.ruleset) };
  });

  fastify.get('/activity', { preHandler: fastify.requireAuth }, async (request) => {
    const query = request.query as { limit?: string };
    const requested = Number(query.limit ?? 50);
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(MAX_ACTIVITY, Math.floor(requested)))
      : 50;

    const { settled } = await requireSettledPlayer(request.auth!.account.id);
    const activity = await ActivityService.recent(fastify.prisma, settled.player.id, limit);

    return { activity: activity.map(toActivityDto) };
  });
};

export default communityRoutes;
