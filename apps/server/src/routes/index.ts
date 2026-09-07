import type { FastifyPluginAsync } from 'fastify';
import authRoutes from './auth.routes.js';
import gameRoutes from './game.routes.js';
import roundRoutes from './round.routes.js';

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ ok: true, version: '0.1.0' }));

  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(roundRoutes, { prefix: '/rounds' });
  await fastify.register(gameRoutes, { prefix: '/game' });
};

export default routes;
