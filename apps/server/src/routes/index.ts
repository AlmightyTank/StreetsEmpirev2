import type { FastifyPluginAsync } from 'fastify';
import adminRoutes from './admin.routes.js';
import allianceRoutes from './alliance.routes.js';
import authRoutes from './auth.routes.js';
import communityRoutes from './community.routes.js';
import combatRoutes from './combat.routes.js';
import discordBotRoutes from './discord-bot.routes.js';
import gameRoutes from './game.routes.js';
import healthRoutes from './health.routes.js';
import notificationRoutes from './notification.routes.js';
import forumRoutes from './forum.routes.js';
import roundInfoRoutes from './round-info.routes.js';
import roundRoutes from './round.routes.js';
import siteRoutes from './site.routes.js';

const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoutes);
  await fastify.register(siteRoutes, { prefix: '/site' });
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(forumRoutes, { prefix: '/forum' });
  await fastify.register(notificationRoutes, { prefix: '/notifications' });
  await fastify.register(discordBotRoutes, { prefix: '/internal/discord' });
  await fastify.register(adminRoutes, { prefix: '/admin' });
  await fastify.register(roundRoutes, { prefix: '/rounds' });
  await fastify.register(roundInfoRoutes, { prefix: '/rounds' });
  await fastify.register(gameRoutes, { prefix: '/game' });
  await fastify.register(communityRoutes, { prefix: '/game' });
  await fastify.register(combatRoutes, { prefix: '/game' });
  await fastify.register(allianceRoutes, { prefix: '/game' });
};

export default routes;
