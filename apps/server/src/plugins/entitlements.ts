import { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    entitlements: PrismaClient | null;
  }
}

/**
 * Optional canonical store for Drop data shared by beta and live. It is kept
 * separate from the gameplay Prisma connection so beta can never accidentally
 * point its rounds at production.
 */
const entitlementsPlugin: FastifyPluginAsync = async (fastify) => {
  if (!env.sharedEntitlements.enabled) {
    fastify.decorate('entitlements', null);
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: env.sharedEntitlements.databaseUrl } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });
  await prisma.$connect();
  fastify.decorate('entitlements', prisma);
  fastify.addHook('onClose', async () => { await prisma.$disconnect(); });
};

export default fp(entitlementsPlugin, { name: 'entitlements', dependencies: ['prisma'] });
