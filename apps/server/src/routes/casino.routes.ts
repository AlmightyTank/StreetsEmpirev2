import type { FastifyPluginAsync } from 'fastify';
import {
  casinoBlackjackActionSchema,
  casinoBlackjackDealSchema,
  casinoCashierSchema,
  casinoSessionCloseSchema,
  casinoSessionStartSchema,
  casinoSlotSpinSchema,
} from '@streets/shared';
import { BlackjackService } from '../services/blackjack.service.js';
import { CasinoService } from '../services/casino.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundService } from '../services/round.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const casinoRoutes: FastifyPluginAsync = async (fastify) => {
  async function requirePlayer(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const player = await RoundPlayerService.find(fastify.prisma, round.id, accountId);
    if (!player) throw AppError.notFound('NOT_IN_ROUND', 'You have not entered the current round yet.');
    return player;
  }

  fastify.get('/', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoService.page(fastify.prisma, player.id);
  });

  fastify.post('/chips/buy', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoCashierSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoService.buyChips(fastify.prisma, player.id, input);
  });

  fastify.post('/chips/redeem', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoCashierSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoService.redeemChips(fastify.prisma, player.id, input);
  });

  fastify.post('/sessions', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoSessionStartSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoService.startSession(fastify.prisma, player.id, input);
  });

  fastify.post('/slots/spin', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoSlotSpinSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoService.spinSlot(fastify.prisma, player.id, input);
  });

  fastify.get('/blackjack', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return BlackjackService.state(fastify.prisma, player.id);
  });

  fastify.post('/blackjack/deal', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoBlackjackDealSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const hand = await BlackjackService.deal(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      blackjack: await BlackjackService.state(fastify.prisma, player.id),
      hand,
    };
  });

  for (const [path, action] of [
    ['hit', BlackjackService.hit],
    ['stand', BlackjackService.stand],
    ['double', BlackjackService.double],
    ['split', BlackjackService.split],
  ] as const) {
    fastify.post('/blackjack/' + path, { preHandler: fastify.requireAuth }, async (request) => {
      const input = parseBody(casinoBlackjackActionSchema, request.body);
      const player = await requirePlayer(request.auth!.account.id);
      const hand = await action(fastify.prisma, player.id, input);
      return {
        page: await CasinoService.page(fastify.prisma, player.id),
        blackjack: await BlackjackService.state(fastify.prisma, player.id),
        hand,
      };
    });
  }

  fastify.post('/sessions/:sessionId/close', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoSessionCloseSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const { sessionId } = request.params as { sessionId: string };
    return CasinoService.closeSession(fastify.prisma, player.id, sessionId, input.actionId);
  });
};

export default casinoRoutes;
