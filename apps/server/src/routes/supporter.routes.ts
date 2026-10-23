import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SupporterBillingService } from '../services/supporter-billing.service.js';
import { SupporterPollService } from '../services/supporter-poll.service.js';
import { GooglePlayBillingService } from '../services/google-play-billing.service.js';
import { parseBody } from '../utils/validate.js';
import { SupporterBenefitsService } from '../services/supporter-benefits.service.js';

const listingSchema = z.object({ listed: z.boolean() }).strict();
const creditSchema = z.object({ optIn: z.boolean() }).strict();
const giftCheckoutSchema = z.object({ recipientAccountId: z.string().min(1) }).strict();
const voteSchema = z.object({ optionKey: z.string().min(1).max(80) }).strict();
const pollParams = z.object({ pollId: z.string().min(1) }).strict();
const playPurchaseSchema = z.object({ purchaseToken: z.string().min(20).max(4096) }).strict();

/** Supporter page: provider-neutral status, Google Play verification, and Stripe web checkout. */
const supporterRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.status(fastify.prisma, request.auth!.account.id));

  fastify.get('/benefits', { preHandler: fastify.requireAuth }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    return SupporterBenefitsService.get(fastify.prisma, request.auth!.account.id);
  });

  fastify.post('/checkout', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.startCheckout(fastify.prisma, request.auth!.account));

  fastify.post('/gift-checkout', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(giftCheckoutSchema, request.body ?? {});
    return SupporterBillingService.startGiftCheckout(fastify.prisma, request.auth!.account, body.recipientAccountId);
  });

  fastify.post('/portal', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterBillingService.openPortal(fastify.prisma, request.auth!.account.id));

  fastify.post('/google-play/verify', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(playPurchaseSchema, request.body ?? {});
    await GooglePlayBillingService.verify(fastify.prisma, request.auth!.account.id, body.purchaseToken);
    return SupporterBillingService.status(fastify.prisma, request.auth!.account.id);
  });

  fastify.get('/polls', { preHandler: fastify.requireAuth }, async (request) =>
    SupporterPollService.list(fastify.prisma, request.auth!.account.id));

  fastify.post('/polls/:pollId/vote', { preHandler: fastify.requireAuth }, async (request) => {
    const { pollId } = parseBody(pollParams, request.params);
    const body = parseBody(voteSchema, request.body ?? {});
    return SupporterPollService.vote(fastify.prisma, request.auth!.account.id, pollId, body.optionKey);
  });

  /** Opt in to (or out of) the public thank-you list. */
  fastify.post('/listing', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(listingSchema, request.body ?? {});
    return SupporterBillingService.setListed(fastify.prisma, request.auth!.account.id, body.listed);
  });

  fastify.post('/release-credit', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(creditSchema, request.body ?? {});
    return SupporterBillingService.setReleaseNotesCredit(fastify.prisma, request.auth!.account.id, body.optIn);
  });
};

export default supporterRoutes;
