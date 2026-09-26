import type { FastifyPluginAsync } from 'fastify';
import { loadRulesetForRound } from '@streets/rules-engine';
import { APP_VERSION } from '@streets/shared';
import { env } from '../config/env.js';
import { PlatformService } from '../services/platform.service.js';
import { RoundService } from '../services/round.service.js';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /** Liveness: process is up. Deliberately has no database dependency. */
  fastify.get('/health', async () => ({
    ok: true,
    version: APP_VERSION,
    environment: env.appEnvironment,
  }));

  /**
   * 1.0.0-A. Public: which build, environment, ruleset and season answered.
   * The game shell, the public site and deploy checks all read this.
   */
  fastify.get('/meta', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return PlatformService.meta(fastify.prisma);
  });

  /**
   * Readiness: database answers and any current round can load its pinned
   * ruleset. Deployments can use this before sending players to the process.
   */
  fastify.get('/ready', async (request, reply) => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      const round = await RoundService.getCurrent(fastify.prisma);
      if (round) loadRulesetForRound(round);

      return {
        ok: true,
        environment: env.appEnvironment,
        version: APP_VERSION,
        database: 'ready',
        round: round
          ? { id: round.id, slug: round.slug, status: round.status, rulesetId: round.rulesetId, rulesetVersion: round.rulesetVersion }
          : null,
      };
    } catch (error) {
      request.log.error({ err: error }, 'readiness check failed');
      return reply.status(503).send({
        ok: false,
        readiness: 'unavailable',
        message: 'The game server is not ready to accept players.',
      });
    }
  });
};

export default healthRoutes;
