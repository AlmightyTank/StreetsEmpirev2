import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { canPlay, isPlayPath, needsRulesAcceptance } from '../auth/play-access.js';

/**
 * Signed-in players whose email is not confirmed yet can use their account (settings,
 * resending the email, linking Discord, signing out) but cannot join a season or play
 * until they verify or sign in with Discord. Then they accept the game rules once
 * (again whenever RULES_VERSION changes) before they play.
 */
const playAccessPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const account = request.auth?.account;
    if (!account) return;
    const path = request.url.split('?', 1)[0] ?? request.url;
    if (!isPlayPath(path)) return;
    if (canPlay(account) && needsRulesAcceptance(account)) {
      return reply.status(403).send({
        error: { code: 'RULES_NOT_ACCEPTED', message: 'Read and accept the game rules to play.' },
      });
    }
    if (canPlay(account)) return;
    return reply.status(403).send({
      error: {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email to play: open the link we sent you, or sign in with Discord.',
      },
    });
  });
};

export default fp(playAccessPlugin, { name: 'play-access', dependencies: ['auth'] });
