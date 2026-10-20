import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../utils/validate.js';
import { AdminRivalryService } from '../services/admin-rivalry.service.js';
import { RivalryOperationsService } from '../services/rivalry-operations.service.js';

const id = z.string().trim().min(1).max(128);
const reason = z.string().trim().min(5).max(500);
const adminRivalryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireAdmin);
  fastify.get('/rivalries', async (request) => AdminRivalryService.overview(fastify.prisma, parseBody(z.object({ roundId: id }).strict(), request.query).roundId));
  fastify.get('/rivalries/:relationshipId/preview', async (request) => AdminRivalryService.preview(fastify.prisma, parseBody(z.object({ relationshipId: id }).strict(), request.params).relationshipId));
  fastify.post('/rivalries/:relationshipId/suppress', async (request) => {
    const params = parseBody(z.object({ relationshipId: id }).strict(), request.params);
    const body = parseBody(z.object({ reason }).strict(), request.body);
    return AdminRivalryService.suppress(fastify.prisma, request.auth!.account, params.relationshipId, body.reason);
  });
  fastify.post('/rivalries/:relationshipId/report', async (request) => {
    const params = parseBody(z.object({ relationshipId: id }).strict(), request.params);
    const body = parseBody(z.object({ reason }).strict(), request.body);
    return AdminRivalryService.report(fastify.prisma, params.relationshipId, body.reason);
  });
  fastify.post('/rivalry-reports/:reportId/resolve', async (request) => {
    const params = parseBody(z.object({ reportId: id }).strict(), request.params);
    const body = parseBody(z.object({ resolution: reason }).strict(), request.body);
    return AdminRivalryService.resolveReport(fastify.prisma, request.auth!.account, params.reportId, body.resolution);
  });
  fastify.get('/rivalries/:relationshipId/audit', async (request) => {
    const params = parseBody(z.object({ relationshipId: id }).strict(), request.params);
    return AdminRivalryService.auditHistory(fastify.prisma, params.relationshipId);
  });
  fastify.get('/rivalry-operations/metrics', async () => RivalryOperationsService.metrics(fastify.prisma));
  fastify.post('/rivalry-operations/pause', async (request) => {
    const body = parseBody(z.object({ paused: z.boolean(), reason }).strict(), request.body);
    return RivalryOperationsService.setPaused(fastify.prisma, request.auth!.account, body.paused, body.reason);
  });
};
export default adminRivalryRoutes;
