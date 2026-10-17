import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../utils/validate.js';
import { OperationRepairService } from '../services/operation-repair.service.js';

const repairBody = z.object({
  operationId: z.string().trim().min(1).max(64),
  action: z.enum(['expire', 'cancel', 'finish']),
}).strict();
const flagBody = z.object({
  roundId: z.string().trim().min(1).max(64),
  enabled: z.boolean(),
}).strict();

const adminOperationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireAdmin);

  fastify.get('/operations/:operationId/history', async (request, reply) => {
    const { operationId } = request.params as { operationId: string };
    reply.header('Cache-Control', 'private, no-store');
    return OperationRepairService.history(fastify.prisma, operationId);
  });

  fastify.post('/operations/repair', async (request, reply) => {
    const input = parseBody(repairBody, request.body ?? {});
    reply.header('Cache-Control', 'private, no-store');
    return OperationRepairService.repair(fastify.prisma, input.operationId, input.action);
  });

  fastify.post('/operations/flag', async (request, reply) => {
    const input = parseBody(flagBody, request.body ?? {});
    reply.header('Cache-Control', 'private, no-store');
    return OperationRepairService.setFlag(fastify.prisma, input.roundId, input.enabled);
  });
};

export default adminOperationsRoutes;
