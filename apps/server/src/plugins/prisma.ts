import { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    // 1.0.0-H. Under a burst (the load test: hundreds of players pressing a button in
    // the same second) a transaction can wait more than Prisma's default 2 s for a pool
    // connection and fail. Waiting up to 10 s turns that into a slower answer instead
    // of an error; the few that still cannot start get an honest 503 SERVER_BUSY.
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });

  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default fp(prismaPlugin, { name: 'prisma' });
