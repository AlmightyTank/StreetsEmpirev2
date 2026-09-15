import type { FastifyPluginAsync } from 'fastify';
import { usernameSchema } from '@streets/shared';
import { z } from 'zod';
import { AdminAccountService } from '../services/admin-account.service.js';
import { AdminAuditService } from '../services/admin-audit.service.js';
import { AdminPlayerService } from '../services/admin-player.service.js';
import { AdminRoundService } from '../services/admin-round.service.js';
import { parseBody } from '../utils/validate.js';

const isoDate = z.coerce.date();
const id = z.string().min(1).max(64);
const reason = z.string().trim().min(5, 'Give a reason of at least 5 characters.').max(500);

const scheduleRoundSchema = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes.').optional(),
  rulesetId: z.string().trim().min(1).max(64),
  startsAt: isoDate,
  endsAt: isoDate.optional(),
  registrationOpensAt: isoDate.nullable().optional(),
}).strict();

const roundParams = z.object({ roundId: id }).strict();
const accountParams = z.object({ accountId: id }).strict();
const playerParams = z.object({ roundPlayerId: id }).strict();
const emptyBody = z.object({}).strict();
const reasonBody = z.object({ reason }).strict();
const startRoundSchema = z.object({ confirmHandoff: z.boolean().optional() }).strict();
const revokeSessionsSchema = z.object({ reason, sessionId: id.optional() }).strict();
const renameSchema = z.object({ reason, username: usernameSchema }).strict();
const adminRoleSchema = z.object({ reason, isAdmin: z.boolean() }).strict();

const accountSearchQuery = z.object({
  query: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'active', 'inactive', 'admin']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

const battlesQuery = z.object({ before: id.optional() }).strict();

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  actor: z.string().trim().min(1).max(40).optional(),
  action: z.string().trim().min(1).max(60).optional(),
  targetType: z.string().trim().min(1).max(40).optional(),
  targetId: z.string().trim().min(1).max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  before: id.optional(),
}).strict();

/**
 * 0.3.0-B admin API. The admin guard is a hook on this whole plugin, so a
 * route added here cannot forget it. Every change writes an audit record in
 * the same transaction.
 */
const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireAdmin);

  // Rounds

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
    const body = parseBody(reasonBody, request.body ?? {});
    return { round: await AdminRoundService.endEarly(fastify.prisma, request.auth!.account, roundId, body.reason) };
  });

  fastify.post('/rounds/:roundId/archive', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return { round: await AdminRoundService.archive(fastify.prisma, request.auth!.account, roundId) };
  });

  // Accounts

  fastify.get('/accounts', async (request) => AdminAccountService.search(fastify.prisma, parseBody(accountSearchQuery, request.query)));

  fastify.get('/accounts/:accountId', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    return AdminAccountService.detail(fastify.prisma, accountId);
  });

  fastify.post('/accounts/:accountId/deactivate', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.setActive(fastify.prisma, request.auth!.account, accountId, false, body.reason);
  });

  fastify.post('/accounts/:accountId/reactivate', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.setActive(fastify.prisma, request.auth!.account, accountId, true, body.reason);
  });

  fastify.post('/accounts/:accountId/sessions/revoke', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(revokeSessionsSchema, request.body ?? {});
    return AdminAccountService.revokeSessions(fastify.prisma, request.auth!.account, accountId, body.reason, body.sessionId);
  });

  fastify.post('/accounts/:accountId/rename', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(renameSchema, request.body ?? {});
    return AdminAccountService.rename(fastify.prisma, request.auth!.account, accountId, body.username, body.reason);
  });

  fastify.post('/accounts/:accountId/reset-profile', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.resetProfile(fastify.prisma, request.auth!.account, accountId, body.reason);
  });

  fastify.post('/accounts/:accountId/admin', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(adminRoleSchema, request.body ?? {});
    return AdminAccountService.setAdmin(fastify.prisma, request.auth!.account, accountId, body.isAdmin, body.reason);
  });

  // Player inspector

  fastify.get('/players/:roundPlayerId', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    return AdminPlayerService.inspect(fastify.prisma, roundPlayerId);
  });

  fastify.get('/players/:roundPlayerId/battles', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const { before } = parseBody(battlesQuery, request.query);
    return AdminPlayerService.battles(fastify.prisma, roundPlayerId, before);
  });

  // Audit

  fastify.get('/audit', async (request) => AdminAuditService.list(fastify.prisma, parseBody(auditQuery, request.query)));
};

export default adminRoutes;
