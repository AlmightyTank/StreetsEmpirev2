import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SupporterBillingService } from '../services/supporter-billing.service.js';
import { parseBody } from '../utils/validate.js';

const listingSchema = z.object({ listed: z.boolean() }).strict();

/** Account → Supporting: the player's supporter status, Stripe Checkout and the billing portal. */
const supporterRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.status(fastify.prisma, request.auth!.account.id));

  fastify.post('/checkout', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.startCheckout(fastify.prisma, request.auth!.account));

  fastify.post('/portal', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.openPortal(fastify.prisma, request.auth!.account.id));

  /** Opt in to (or out of) the public thank-you list. */
  fastify.post('/listing', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(listingSchema, request.body ?? {});
    return SupporterBillingService.setListed(fastify.prisma, request.auth!.account.id, body.listed);
  });
};

export default supporterRoutes;
