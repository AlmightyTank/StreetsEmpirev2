import type { FastifyPluginAsync } from 'fastify';
import { bugReportSchema } from '@streets/shared';
import { BugReportService } from '../services/support.service.js';
import { parseBody } from '../utils/validate.js';

/** rc.2. Player support: reporting a bug from the game. Any signed-in account may send one. */
const supportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/bug-reports', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const body = parseBody(bugReportSchema, request.body ?? {});
    const result = await BugReportService.create(fastify.prisma, request.auth!.account, body, {
      userAgent: request.headers['user-agent'],
    });
    return reply.status(201).send(result);
  });
};

export default supportRoutes;
