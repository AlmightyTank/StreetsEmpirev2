import type { FastifyPluginAsync } from 'fastify';
import { PublicSiteService } from '../services/public-site.service.js';
import { AppError } from '../utils/errors.js';

const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=60';
const ARCHIVE_CACHE = 'public, max-age=300, stale-while-revalidate=600';

const publicRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/overview', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicSiteService.overview(fastify.prisma);
  });

  fastify.get('/current-game', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return {
      currentGame: await PublicSiteService.currentGame(fastify.prisma),
    };
  });

  fastify.get('/games', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicSiteService.games(fastify.prisma);
  });

  fastify.get('/games/:gameId', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const game = await PublicSiteService.completedGame(fastify.prisma, gameId);
    if (!game) {
      throw AppError.notFound('GAME_NOT_FOUND', 'That completed game is not in the archive.');
    }

    reply.header('Cache-Control', ARCHIVE_CACHE);
    return { game };
  });
};

export default publicRoutes;
