import type { FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';
import { parseStripeEvent, verifyStripeSignature } from '../services/stripe.client.js';
import { SupporterBillingService } from '../services/supporter-billing.service.js';
import { AppError } from '../utils/errors.js';

/**
 * Stripe's webhook for supporter payments. The signature covers the exact bytes
 * Stripe sent, so this plugin keeps JSON bodies raw instead of parsing them.
 * A 2xx tells Stripe the event is done; anything else makes it retry.
 */
const stripeWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  fastify.post('/webhook', async (request) => {
    if (!env.stripe.enabled) throw AppError.notFound('NOT_FOUND', 'Not found.');
    const payload = request.body;
    if (!Buffer.isBuffer(payload)) throw AppError.badRequest('STRIPE_WEBHOOK_INVALID', 'Expected a JSON body.');
    const signature = request.headers['stripe-signature'];
    if (!verifyStripeSignature(payload, typeof signature === 'string' ? signature : undefined, env.stripe.webhookSecret)) {
      throw AppError.badRequest('STRIPE_SIGNATURE_INVALID', 'The Stripe signature does not match.');
    }
    const event = parseStripeEvent(payload);
    if (!event) throw AppError.badRequest('STRIPE_WEBHOOK_INVALID', 'That is not a Stripe event.');
    const outcome = await SupporterBillingService.handleEvent(fastify.prisma, event);
    // Unmatched events are acknowledged (a retry would not match either) but logged for an admin.
    const level = outcome === 'unmatched' ? 'warn' : 'info';
    request.log[level]({ stripeEventId: event.id, stripeEventType: event.type, outcome }, 'Stripe webhook');
    return { received: true };
  });
};

export default stripeWebhookRoutes;
