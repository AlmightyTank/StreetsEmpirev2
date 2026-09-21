import type { FastifyPluginAsync } from 'fastify';
import { PublicSiteService } from '../services/public-site.service.js';

const publicRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/overview', async () => PublicSiteService.overview(fastify.prisma));

  fastify.get('/current-game', async () => ({
    currentGame: await PublicSiteService.currentGame(fastify.prisma),
  }));
};

export default publicRoutes;
