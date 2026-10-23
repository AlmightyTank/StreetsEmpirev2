import type { FastifyPluginAsync } from 'fastify';
import { GooglePlayBillingService } from '../services/google-play-billing.service.js';

/** Authenticated Google Cloud Pub/Sub push endpoint for Google Play subscription changes. */
const googlePlayRtdnRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/rtdn', async (request) => {
    await GooglePlayBillingService.verifyRtdnAuthorization(request.headers.authorization);
    const result = await GooglePlayBillingService.handleRtdn(fastify.prisma, request.body);
    const level = result.outcome === 'unmatched' ? 'warn' : 'info';
    request.log[level]({ messageId: result.messageId, outcome: result.outcome }, 'Google Play RTDN');
    return { received: true };
  });
};

export default googlePlayRtdnRoutes;
