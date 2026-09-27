import type { FastifyPluginAsync } from 'fastify';
import { loadRulesetForRound } from '@streets/rules-engine';
import { APP_VERSION } from '@streets/shared';
import { env } from '../config/env.js';
import { PlatformService } from '../services/platform.service.js';
import { RoundService } from '../services/round.service.js';
import { MonitoringService } from '../services/monitoring.service.js';
import { timingSafeEqual } from 'node:crypto';

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
   * 1.0.0-F. Prometheus text for an external monitor. It exists only when METRICS_TOKEN
   * is set, and answers only to that token (Authorization: Bearer ... or x-metrics-token).
   */
  fastify.get('/metrics', async (request, reply) => {
    if (!env.monitoring.metricsToken) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No route for GET /api/metrics.' } });
    const header = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? request.headers['x-metrics-token'];
    const given = Buffer.from(typeof header === 'string' ? header : '');
    const expected = Buffer.from(env.monitoring.metricsToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Metrics need the monitoring token.' } });
    }
    const snapshot = await MonitoringService.snapshot(fastify.prisma);
    reply.header('cache-control', 'no-store').type('text/plain; version=0.0.4');
    return MonitoringService.prometheus(snapshot);
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
        // 1.0.0-F: scripts/ops/maintenance.sh checks this after a restart.
        maintenance: env.maintenance.enabled,
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
