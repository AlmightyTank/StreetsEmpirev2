import type { FastifyPluginAsync } from 'fastify';
import { loadRulesetForRound } from '@streets/rules-engine';
import { RoundService } from '../services/round.service.js';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /** Liveness: process is up. Deliberately has no database dependency. */
  fastify.get('/health', async () => ({
    ok: true,
    version: '0.3.0',
    milestone: '0.3.0-B',
  }));

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
