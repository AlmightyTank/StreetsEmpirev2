import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { RoundAftermathQueryService } from '../services/round-aftermath-query.service.js';
import { CrewLegendService } from '../services/crew-legends.service.js';
import { parseBody } from '../utils/validate.js';
import { CareerStoryService } from '../services/career-story.service.js';

const roundParams = z.object({ roundId: z.string().trim().min(1).max(64) }).strict();
const categoryParams = roundParams.extend({
  category: z.enum(['wealth', 'turf', 'crew', 'drugs', 'businesses', 'crime', 'competition']),
}).strict();
const recordsParams = roundParams.extend({
  category: z.enum(['wealth', 'turf', 'crew', 'drugs', 'businesses', 'crime', 'competition']),
}).strict();
const cityParams = roundParams.extend({
  citySlug: z.string().trim().min(1).max(64),
}).strict();
const leaderboardQuery = z.object({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
const recordsQuery = z.object({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  citySlug: z.string().trim().min(1).max(64).optional(),
}).strict();
const archiveQuery = z.object({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(80).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  reportStatus: z.enum(['READY', 'UNAVAILABLE', 'PREPARING']).optional(),
  order: z.enum(['newest', 'oldest']).default('newest'),
}).strict();

const roundAftermathRoutes: FastifyPluginAsync = async (fastify) => {
  if (!env.roundAftermath.publicEnabled) return;

  fastify.get('/aftermath/archive', async (request, reply) => {
    const filters = parseBody(archiveQuery, request.query ?? {});
    reply.header('Cache-Control', 'public, max-age=60');
    return RoundAftermathQueryService.archive(fastify.prisma, {
      page: filters.page,
      pageSize: filters.pageSize,
      query: filters.q || undefined,
      year: filters.year,
      reportStatus: filters.reportStatus,
      order: filters.order,
    });
  });

  fastify.get('/:roundId/aftermath', async (request, reply) => {
    const { roundId } = parseBody(roundParams, request.params);
    reply.header('Cache-Control', 'public, max-age=60');
    return RoundAftermathQueryService.overview(fastify.prisma, roundId);
  });

  fastify.get('/:roundId/aftermath/me', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId } = parseBody(roundParams, request.params);
    reply.header('Cache-Control', 'private, no-store');
    return RoundAftermathQueryService.personal(fastify.prisma, roundId, request.auth!.account.id);
  });

  fastify.get('/:roundId/aftermath/career-stories/me', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId } = parseBody(roundParams, request.params);
    reply.header('Cache-Control', 'private, no-store');
    return { biography: await CareerStoryService.biography(fastify.prisma, request.auth!.account.id, roundId) };
  });

  fastify.get('/:roundId/aftermath/crew-legends/me', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId } = parseBody(roundParams, request.params);
    reply.header('Cache-Control', 'private, no-store');
    return CrewLegendService.archive(fastify.prisma, request.auth!.account.id, roundId);
  });
  fastify.get('/:roundId/aftermath/categories', async (request, reply) => {
    const { roundId } = parseBody(roundParams, request.params);
    reply.header('Cache-Control', 'public, max-age=60');
    return RoundAftermathQueryService.categories(fastify.prisma, roundId);
  });

  fastify.get('/:roundId/aftermath/cities/:citySlug', async (request, reply) => {
    const { roundId, citySlug } = parseBody(cityParams, request.params);
    reply.header('Cache-Control', 'public, max-age=60');
    return RoundAftermathQueryService.city(fastify.prisma, roundId, citySlug);
  });

  fastify.get('/:roundId/aftermath/alliances', async (request, reply) => {
    const { roundId } = parseBody(roundParams, request.params);
    reply.header('Cache-Control', 'public, max-age=60');
    return RoundAftermathQueryService.alliances(fastify.prisma, roundId);
  });

  fastify.get('/:roundId/aftermath/leaderboards/:category', async (request, reply) => {
    const { roundId, category } = parseBody(categoryParams, request.params);
    const { page, pageSize } = parseBody(leaderboardQuery, request.query ?? {});
    reply.header('Cache-Control', 'public, max-age=60');
    return RoundAftermathQueryService.leaderboard(fastify.prisma, roundId, category, page, pageSize);
  });

  fastify.get('/:roundId/aftermath/records/:category', async (request, reply) => {
    const { roundId, category } = parseBody(recordsParams, request.params);
    const { page, pageSize, citySlug } = parseBody(recordsQuery, request.query ?? {});
    reply.header('Cache-Control', 'public, max-age=60');
    return RoundAftermathQueryService.records(fastify.prisma, roundId, category, page, pageSize, citySlug ?? null);
  });
};

export default roundAftermathRoutes;
