import type { FastifyPluginAsync } from 'fastify';
import authRoutes from './auth.routes.js';
import communityRoutes from './community.routes.js';
import combatRoutes from './combat.routes.js';
import discordBotRoutes from './discord-bot.routes.js';
import gameRoutes from './game.routes.js';
import healthRoutes from './health.routes.js';
import forumRoutes from './forum.routes.js';
import roundInfoRoutes from './round-info.routes.js';
import roundRoutes from './round.routes.js';

const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(forumRoutes, { prefix: '/forum' });
  await fastify.register(discordBotRoutes, { prefix: '/internal/discord' });
  await fastify.register(roundRoutes, { prefix: '/rounds' });
  await fastify.register(roundInfoRoutes, { prefix: '/rounds' });
  await fastify.register(gameRoutes, { prefix: '/game' });
  await fastify.register(communityRoutes, { prefix: '/game' });
  await fastify.register(combatRoutes, { prefix: '/game' });
};

export default routes;
