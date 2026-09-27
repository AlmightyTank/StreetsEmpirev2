import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { canPlay, isPlayPath } from '../auth/play-access.js';

/**
 * Signed-in players whose email is not confirmed yet can use their account (settings,
 * resending the email, linking Discord, signing out) but cannot join a season or play
 * until they verify or sign in with Discord.
 */
const playAccessPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const account = request.auth?.account;
    if (!account) return;
    const path = request.url.split('?', 1)[0] ?? request.url;
    if (!isPlayPath(path) || canPlay(account)) return;
    return reply.status(403).send({
      error: {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email to play: open the link we sent you, or sign in with Discord.',
      },
    });
  });
};

export default fp(playAccessPlugin, { name: 'play-access', dependencies: ['auth'] });
