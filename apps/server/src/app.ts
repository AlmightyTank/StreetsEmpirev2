import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import prismaPlugin from './plugins/prisma.js';
import routes from './routes/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.isProduction ? 'info' : 'debug',
      transport: env.isProduction
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
    trustProxy: env.isProduction,
  });

  await app.register(errorHandlerPlugin);

  await app.register(fastifyCors, {
    origin: env.corsOrigins,
    credentials: true,
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  await app.register(routes, { prefix: '/api' });

  return app;
}
