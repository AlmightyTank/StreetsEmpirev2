import type { FastifyPluginAsync } from 'fastify';
import { SiteBannerService } from '../services/site-banner.service.js';

const siteRoutes: FastifyPluginAsync = async (fastify) => {
  /** 0.3.0-B: the live site banner, if any. Public, so logged-out pages show it too. */
  fastify.get('/banner', async () => ({ banner: await SiteBannerService.current(fastify.prisma) }));
};

export default siteRoutes;
