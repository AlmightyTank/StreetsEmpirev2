import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SharedEntitlementLinkingService } from '../services/shared-entitlement-linking.service.js';
import { parseBody } from '../utils/validate.js';

const confirmSchema = z.object({ confirmOwnAccounts: z.literal(true) }).strict();
const completeSchema = z.object({ code: z.string().trim().min(30).max(120), confirmOwnAccounts: z.literal(true) }).strict();

/** Player-controlled cross-environment linking, independent of Drop runtime switches. */
const accountEntitlementsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/link', { preHandler: fastify.requireAuth }, async (request) =>
    SharedEntitlementLinkingService.playerStatus(fastify.entitlements, request.auth!.account.id));

  fastify.post('/link/start', { preHandler: fastify.requireAuth }, async (request) => {
    parseBody(confirmSchema, request.body ?? {});
    return SharedEntitlementLinkingService.start(fastify.prisma, fastify.entitlements, request.auth!.account.id);
  });

  fastify.post('/link/complete', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(completeSchema, request.body ?? {});
    return SharedEntitlementLinkingService.complete(fastify.prisma, fastify.entitlements, request.auth!.account.id, body.code);
  });
};

export default accountEntitlementsRoutes;
