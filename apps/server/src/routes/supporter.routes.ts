import type { FastifyPluginAsync } from 'fastify';
import { SupporterBillingService } from '../services/supporter-billing.service.js';

/** Account → Supporting: the player's supporter status, Stripe Checkout and the billing portal. */
const supporterRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.status(fastify.prisma, request.auth!.account.id));

  fastify.post('/checkout', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.startCheckout(fastify.prisma, request.auth!.account));

  fastify.post('/portal', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.openPortal(fastify.prisma, request.auth!.account.id));
};

export default supporterRoutes;
