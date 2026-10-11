import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RoundAftermathQueryService } from '../services/round-aftermath-query.service.js';
import { parseBody } from '../utils/validate.js';

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

const roundAftermathRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:roundId/aftermath', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return RoundAftermathQueryService.overview(fastify.prisma, roundId);
  });

  fastify.get('/:roundId/aftermath/me', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId } = parseBody(roundParams, request.params);
    reply.header('Cache-Control', 'private, no-store');
    return RoundAftermathQueryService.personal(fastify.prisma, roundId, request.auth!.account.id);
  });

  fastify.get('/:roundId/aftermath/categories', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return RoundAftermathQueryService.categories(fastify.prisma, roundId);
  });

  fastify.get('/:roundId/aftermath/cities/:citySlug', async (request) => {
    const { roundId, citySlug } = parseBody(cityParams, request.params);
    return RoundAftermathQueryService.city(fastify.prisma, roundId, citySlug);
  });

  fastify.get('/:roundId/aftermath/alliances', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return RoundAftermathQueryService.alliances(fastify.prisma, roundId);
  });

  fastify.get('/:roundId/aftermath/leaderboards/:category', async (request) => {
    const { roundId, category } = parseBody(categoryParams, request.params);
    const { page, pageSize } = parseBody(leaderboardQuery, request.query ?? {});
    return RoundAftermathQueryService.leaderboard(fastify.prisma, roundId, category, page, pageSize);
  });

  fastify.get('/:roundId/aftermath/records/:category', async (request) => {
    const { roundId, category } = parseBody(recordsParams, request.params);
    const { page, pageSize, citySlug } = parseBody(recordsQuery, request.query ?? {});
    return RoundAftermathQueryService.records(fastify.prisma, roundId, category, page, pageSize, citySlug ?? null);
  });
};

export default roundAftermathRoutes;
