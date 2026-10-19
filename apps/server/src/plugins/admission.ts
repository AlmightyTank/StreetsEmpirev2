import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AdmissionService } from '../services/admission.service.js';
import { RoundService } from '../services/round.service.js';

/**
 * Admission is intentionally limited to gameplay URLs. Authentication,
 * billing/supporter pages, queue endpoints, account settings, public pages and
 * health checks must remain reachable while the game is full.
 */
const admissionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    const path = request.url.split('?', 1)[0] ?? request.url;
    if (!path.startsWith('/api/game/') || !request.auth) return;
    const round = await RoundService.getCurrent(fastify.prisma);
    if (round) await AdmissionService.requireAdmission(fastify.prisma, request.auth.account.id, round.id);
  });
};

export default fp(admissionPlugin, { name: 'admission', dependencies: ['auth', 'prisma'] });
