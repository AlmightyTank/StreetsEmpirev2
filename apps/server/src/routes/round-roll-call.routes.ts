import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../utils/errors.js';
import { RoundService } from '../services/round.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundRollCallService } from '../services/round-roll-call.service.js';

/** Slice A: attendance only. Nothing here grants gameplay rewards or cosmetics. */
const roundRollCallRoutes: FastifyPluginAsync = async (fastify) => {
  async function requireCurrentPlayer(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const player = await RoundPlayerService.find(fastify.prisma, round.id, accountId);
    if (!player) throw AppError.notFound('NOT_IN_ROUND', 'Join this round before checking in.');
    return { round, player };
  }

  fastify.get('/round-roll-call', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requireCurrentPlayer(request.auth!.account.id);
    return RoundRollCallService.view(fastify.prisma, round, player.id);
  });

  fastify.post('/round-roll-call/check-in', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requireCurrentPlayer(request.auth!.account.id);
    return RoundRollCallService.checkIn(fastify.prisma, round.id, player.id);
  });
};

export default roundRollCallRoutes;
