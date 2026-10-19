import type { FastifyPluginAsync } from 'fastify';
import { AdmissionService } from '../services/admission.service.js';
import { RoundService } from '../services/round.service.js';

const admissionRoutes: FastifyPluginAsync = async (fastify) => {
  async function currentRound() {
    return RoundService.requireCurrent(fastify.prisma);
  }
  fastify.get('/status', { preHandler: fastify.requireAuth }, async (request) => {
    const round = await currentRound();
    return AdmissionService.status(fastify.prisma, request.auth!.account.id, round.id);
  });
  fastify.post('/join', { preHandler: fastify.requireAuth }, async (request) => {
    const round = await currentRound();
    return AdmissionService.join(fastify.prisma, request.auth!.account.id, round.id);
  });
  fastify.post('/renew', { preHandler: fastify.requireAuth }, async (request) => {
    const round = await currentRound();
    return AdmissionService.renew(fastify.prisma, request.auth!.account.id, round.id);
  });
  fastify.post('/leave', { preHandler: fastify.requireAuth }, async (request) => {
    const round = await currentRound();
    await AdmissionService.leave(fastify.prisma, request.auth!.account.id, round.id);
    return { ok: true };
  });
};

export default admissionRoutes;
