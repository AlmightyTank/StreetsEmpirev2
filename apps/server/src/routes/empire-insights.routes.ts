import type { FastifyPluginAsync } from 'fastify';
import { EmpireInsightsService } from '../services/empire-insights.service.js';

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    return EmpireInsightsService.get(fastify.prisma, request.auth!.account.id);
  });
};

export default routes;
