import fastifyCors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import prismaPlugin from './plugins/prisma.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import maintenancePlugin, { maintenanceRefusals } from './plugins/maintenance.js';
import playAccessPlugin from './plugins/play-access.js';
import securityPlugin from './plugins/security.js';
import routes from './routes/index.js';
import { metrics } from './services/metrics.service.js';
import { acceptRequestId, LOG_REDACT_PATHS, logContextFields, withLogContext } from './utils/request-context.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.logLevel,
      transport: env.isProduction
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
      // 1.0.0-F: every line carries the request, player, round, action and ruleset it belongs to...
      mixin: logContextFields,
      // ...and never a secret, wherever one turns up.
      redact: { paths: [...LOG_REDACT_PATHS], censor: '[redacted]' },
    },
    trustProxy: env.trustProxy,
    // A request id from the proxy is kept when it looks like one; otherwise we make our own.
    genReqId: (request) => acceptRequestId(request.headers['x-request-id']) ?? randomUUID(),
  });

  // 1.0.0-F: the request's log context, entered first so every hook and handler after it shares it.
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    withLogContext({ requestId: request.id }, done);
  });

  // 1.0.0-F: every answered request is counted and timed for monitoring.
  app.addHook('onResponse', (request, reply, done) => {
    metrics.recordRequest({ url: request.url, method: request.method, statusCode: reply.statusCode, durationMs: reply.elapsedTime, deliberate: maintenanceRefusals.has(request) });
    done();
  });

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin);

  await app.register(fastifyCors, {
    origin: env.corsOrigins,
    credentials: true,
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(maintenancePlugin);
  await app.register(playAccessPlugin);

  await app.register(routes, { prefix: '/api' });

  return app;
}
