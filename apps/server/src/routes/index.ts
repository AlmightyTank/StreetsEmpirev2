import type { FastifyPluginAsync } from 'fastify';
import authRoutes from './auth.routes.js';
import communityRoutes from './community.routes.js';
import gameRoutes from './game.routes.js';
import healthRoutes from './health.routes.js';
import roundInfoRoutes from './round-info.routes.js';
import roundRoutes from './round.routes.js';

const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(roundRoutes, { prefix: '/rounds' });
  await fastify.register(roundInfoRoutes, { prefix: '/rounds' });
  await fastify.register(gameRoutes, { prefix: '/game' });
  await fastify.register(communityRoutes, { prefix: '/game' });
};

export default routes;
