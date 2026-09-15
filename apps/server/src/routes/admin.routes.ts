import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AdminAuditService } from '../services/admin-audit.service.js';
import { AdminRoundService } from '../services/admin-round.service.js';
import { parseBody } from '../utils/validate.js';

const isoDate = z.coerce.date();

const scheduleRoundSchema = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes.').optional(),
  rulesetId: z.string().trim().min(1).max(64),
  startsAt: isoDate,
  endsAt: isoDate.optional(),
  registrationOpensAt: isoDate.nullable().optional(),
}).strict();

const roundParams = z.object({ roundId: z.string().min(1).max(64) }).strict();
const emptyBody = z.object({}).strict();
const startRoundSchema = z.object({ confirmHandoff: z.boolean().optional() }).strict();
const endRoundSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  targetType: z.string().trim().min(1).max(40).optional(),
  targetId: z.string().trim().min(1).max(64).optional(),
}).strict();

/**
 * 0.3.0-B admin API. The admin guard is a hook on this whole plugin, so a
 * route added here cannot forget it. Every change writes an audit record in
 * the same transaction.
 */
const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireAdmin);

  fastify.get('/rounds', async () => AdminRoundService.list(fastify.prisma));

  fastify.post('/rounds', async (request, reply) => {
    const input = parseBody(scheduleRoundSchema, request.body);
    const round = await AdminRoundService.schedule(fastify.prisma, request.auth!.account, input);
    return reply.status(201).send({ round });
  });

  fastify.post('/rounds/:roundId/open-registration', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return { round: await AdminRoundService.openRegistration(fastify.prisma, request.auth!.account, roundId) };
  });

  fastify.post('/rounds/:roundId/start', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const { confirmHandoff } = parseBody(startRoundSchema, request.body ?? {});
    return { round: await AdminRoundService.start(fastify.prisma, request.auth!.account, roundId, { confirmHandoff: confirmHandoff ?? false }) };
  });

  fastify.post('/rounds/:roundId/end-early', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const { reason } = parseBody(endRoundSchema, request.body ?? {});
    return { round: await AdminRoundService.endEarly(fastify.prisma, request.auth!.account, roundId, reason) };
  });

  fastify.post('/rounds/:roundId/archive', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return { round: await AdminRoundService.archive(fastify.prisma, request.auth!.account, roundId) };
  });

  fastify.get('/audit', async (request) => AdminAuditService.list(fastify.prisma, parseBody(auditQuery, request.query)));
};

export default adminRoutes;
