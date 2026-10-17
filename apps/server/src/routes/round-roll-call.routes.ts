import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../utils/validate.js';
import { RoundRollCallRewardService } from '../services/round-roll-call-reward.service.js';
import { AppError } from '../utils/errors.js';
import { RoundService } from '../services/round.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundRollCallService } from '../services/round-roll-call.service.js';
import { RoundRollCallRecoveryService } from '../services/round-roll-call-recovery.service.js';

/** Slice B: attendance plus independently claimed, bounded gameplay rewards. */
const claimSchema = z.object({
  tier: z.number().int().min(1).max(10_000),
  actionId: z.string().uuid().optional(),
}).strict();
const recoverSchema = z.object({ actionId: z.string().uuid() }).strict();
const roundRollCallRoutes: FastifyPluginAsync = async (fastify) => {
  async function requireCurrentPlayer(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const player = await RoundPlayerService.find(fastify.prisma, round.id, accountId);
    if (!player) throw AppError.notFound('NOT_IN_ROUND', 'Join this round before checking in.');
    return { round, player };
  }

  fastify.get('/round-roll-call', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requireCurrentPlayer(request.auth!.account.id);
    return RoundRollCallRewardService.board(fastify.prisma, round, player.id);
  });

  fastify.post('/round-roll-call/check-in', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requireCurrentPlayer(request.auth!.account.id);
    return RoundRollCallService.checkIn(fastify.prisma, round.id, player.id);
  });

  /** One authenticated, auditable catch-up. Never a premium purchase or admin backdoor. */
  fastify.post('/round-roll-call/recover', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { actionId } = parseBody(recoverSchema, request.body);
    const { round, player } = await requireCurrentPlayer(request.auth!.account.id);
    reply.header('Cache-Control', 'private, no-store');
    return RoundRollCallRecoveryService.recover(fastify.prisma, round.id, player.id, request.auth!.account.id, actionId);
  });

  /** Rewards are paid only when explicitly claimed; no hidden auto-payouts. */
  fastify.post('/round-roll-call/claim', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(claimSchema, request.body);
    const { player } = await requireCurrentPlayer(request.auth!.account.id);
    return RoundRollCallRewardService.claim(fastify.prisma, player.id, body);
  });
};

export default roundRollCallRoutes;
