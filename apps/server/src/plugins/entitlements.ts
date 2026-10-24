import { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { configureSharedEntitlements } from '../services/shared-entitlement-runtime.js';

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
  if (!env.sharedEntitlements.databaseUrl) {
    configureSharedEntitlements(null);
    fastify.decorate('entitlements', null);
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: env.sharedEntitlements.databaseUrl } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });
  try {
    await prisma.$connect();
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    if (env.sharedEntitlements.enabled) throw error;
    fastify.log.warn('Shared entitlement database is unreachable; continuing with shared entitlements unavailable because SHARED_ENTITLEMENTS_ENABLED=false.');
    configureSharedEntitlements(null);
    fastify.decorate('entitlements', null);
    return;
  }
  // Keep the canonical connection available to player account linking
  // before shared runtime mode is enabled. Wallet routes still obey the
  // explicit SHARED_ENTITLEMENTS_ENABLED switch in sharedEntitlementRuntime.
  configureSharedEntitlements(env.sharedEntitlements.enabled ? prisma : null);
  fastify.decorate('entitlements', prisma);
  fastify.addHook('onClose', async () => {
    configureSharedEntitlements(null);
    await prisma.$disconnect();
  });
};

export default fp(entitlementsPlugin, { name: 'entitlements', dependencies: ['prisma'] });
