import type { FastifyPluginAsync } from 'fastify';
import { PublicSiteService } from '../services/public-site.service.js';

const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=60';

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
};

export default publicRoutes;
