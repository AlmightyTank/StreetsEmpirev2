import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RoundService } from '../services/round.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { CriminalCaseFileService } from '../services/criminal-case-file.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const caseParams = z.object({ caseId: z.string().min(1).max(128) }).strict();
const listQuery = z.object({
  activePage: z.coerce.number().int().min(1).max(1000000).default(1),
  archivePage: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
const closeBody = z.object({ branchKey: z.string().min(1).max(64) }).strict();

const caseFileRoutes: FastifyPluginAsync = async (fastify) => {
  async function owner(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const player = await RoundPlayerService.find(fastify.prisma, round.id, accountId);
    if (!player) throw AppError.notFound('NOT_IN_ROUND', 'Join the current round before opening Case Files.');
    return { round, player };
  }

  fastify.get('/case-files', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { round, player } = await owner(request.auth!.account.id);
    reply.header('Cache-Control', 'private, no-store');
    return CriminalCaseFileService.page(fastify.prisma, round.id, player.id, parseBody(listQuery, request.query ?? {}));
  });

  fastify.get('/case-files/:caseId', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { caseId } = parseBody(caseParams, request.params);
    const { player } = await owner(request.auth!.account.id);
    reply.header('Cache-Control', 'private, no-store');
    return CriminalCaseFileService.get(fastify.prisma, player.id, caseId);
  });

  fastify.post('/case-files/:caseId/activate', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { caseId } = parseBody(caseParams, request.params);
    const { player } = await owner(request.auth!.account.id);
    reply.header('Cache-Control', 'private, no-store');
    return CriminalCaseFileService.activate(fastify.prisma, player.id, caseId);
  });

  fastify.post('/case-files/:caseId/close', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { caseId } = parseBody(caseParams, request.params);
    const { branchKey } = parseBody(closeBody, request.body);
    const { player } = await owner(request.auth!.account.id);
    reply.header('Cache-Control', 'private, no-store');
    return CriminalCaseFileService.close(fastify.prisma, player.id, caseId, branchKey);
  });
};

export default caseFileRoutes;
