import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RoundAftermathQueryService } from '../services/round-aftermath-query.service.js';
import { parseBody } from '../utils/validate.js';

const roundParams = z.object({ roundId: z.string().trim().min(1).max(64) }).strict();
const categoryParams = roundParams.extend({
  category: z.enum(['wealth', 'turf', 'crew', 'drugs', 'businesses', 'crime', 'competition']),
}).strict();
const leaderboardQuery = z.object({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const roundAftermathRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:roundId/aftermath', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return RoundAftermathQueryService.overview(fastify.prisma, roundId);
  });

  fastify.get('/:roundId/aftermath/categories', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return RoundAftermathQueryService.categories(fastify.prisma, roundId);
  });

  fastify.get('/:roundId/aftermath/leaderboards/:category', async (request) => {
    const { roundId, category } = parseBody(categoryParams, request.params);
    const { page, pageSize } = parseBody(leaderboardQuery, request.query ?? {});
    return RoundAftermathQueryService.leaderboard(fastify.prisma, roundId, category, page, pageSize);
  });
};

export default roundAftermathRoutes;
