import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ForumLinkService, forumLinkDto } from '../services/forum-link.service.js';
import { forumUserIdSchema } from '../services/forum-proof.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const finishSchema = z.object({ proof: z.string().min(1).max(4096) }).strict();

const forumRoutes: FastifyPluginAsync = async (fastify) => {
  async function requireGameOrigin(request: FastifyRequest) {
    // Same-site cookies alone do not protect sibling subdomains from CSRF.
    const origin = request.headers.origin;
    if (!origin || ![new URL(env.frontendOrigin).origin, ...env.corsOrigins].includes(origin)) {
      throw AppError.forbidden('Open your game account settings to manage the forum connection.');
    }
  }
  function requireEnabled() {
    if (!env.forum.enabled) throw new AppError(503, 'FORUM_LINK_UNAVAILABLE', 'Forum account linking is not available yet.');
  }

  fastify.get('/status', { preHandler: fastify.requireAuth }, async (request) => ({
    enabled: env.forum.enabled,
    link: forumLinkDto(await fastify.prisma.forumLink.findUnique({ where: { accountId: request.auth!.account.id } })),
  }));
  fastify.post('/start', { preHandler: [fastify.requireAuth, requireGameOrigin] }, async (request) => {
    requireEnabled();
    return ForumLinkService.start(fastify.prisma, request.auth!.account.id, request.auth!.session.id, request.auth!.account.username);
  });
  fastify.post('/finish', { preHandler: [fastify.requireAuth, requireGameOrigin] }, async (request) => {
    requireEnabled();
    const { proof } = parseBody(finishSchema, request.body);
    return { link: await ForumLinkService.finish(fastify.prisma, request.auth!.account.id, request.auth!.session.id, proof) };
  });
  fastify.post('/unlink', { preHandler: [fastify.requireAuth, requireGameOrigin] }, async (request) =>
    ForumLinkService.unlink(fastify.prisma, request.auth!.account.id));

  // Public, explicitly consented link only. No game IDs, emails, or Discord IDs.
  fastify.get('/users/:forumUserId', async (request) => {
    const { forumUserId } = parseBody(z.object({ forumUserId: forumUserIdSchema }), request.params);
    const link = env.forum.enabled ? await fastify.prisma.forumLink.findFirst({ where: {
      forumOrigin: env.forum.origin, forumUserId, account: { isActive: true },
    } }) : null;
    return { profileUrl: link ? new URL(`/game/forum/${forumUserId}`, env.frontendOrigin).toString() : null };
  });
};
export default forumRoutes;
