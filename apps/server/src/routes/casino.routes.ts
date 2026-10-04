import type { FastifyPluginAsync } from 'fastify';
import {
  casinoBlackjackActionSchema,
  casinoBlackjackDealSchema,
  casinoCashierSchema,
  casinoCompHotelSchema,
  casinoSessionCloseSchema,
  casinoSessionStartSchema,
  casinoSlotSpinSchema,
  casinoRouletteSpinSchema,
  casinoStreetDiceOddsSchema,
  casinoStreetDiceRollSchema,
  casinoStreetDiceStartSchema,
  casinoPokerActionSchema,
  casinoPokerStartSchema,
  casinoPokerTableCreateSchema,
  casinoPokerTableJoinSchema,
  casinoPokerTableActionSchema,
  casinoPokerTableStartSchema,
  casinoPokerTablePlaySchema,
} from '@streets/shared';
import { BlackjackService } from '../services/blackjack.service.js';
import { CasinoService } from '../services/casino.service.js';
import { RouletteService } from '../services/roulette.service.js';
import { StreetDiceService } from '../services/street-dice.service.js';
import { CasinoPokerService } from '../services/casino-poker.service.js';
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

  fastify.post('/comps/hotel', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoCompHotelSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoService.compHotel(fastify.prisma, player.id, input);
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

  fastify.post('/blackjack/hit', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoBlackjackActionSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const hand = await BlackjackService.hit(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      blackjack: await BlackjackService.state(fastify.prisma, player.id),
      hand,
    };
  });

  fastify.post('/blackjack/stand', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoBlackjackActionSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const hand = await BlackjackService.stand(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      blackjack: await BlackjackService.state(fastify.prisma, player.id),
      hand,
    };
  });

  fastify.post('/blackjack/double', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoBlackjackActionSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const hand = await BlackjackService.double(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      blackjack: await BlackjackService.state(fastify.prisma, player.id),
      hand,
    };
  });

  fastify.post('/blackjack/split', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoBlackjackActionSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const hand = await BlackjackService.split(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      blackjack: await BlackjackService.state(fastify.prisma, player.id),
      hand,
    };
  });

  fastify.get('/roulette', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return RouletteService.state(fastify.prisma, player.id);
  });

  fastify.post('/roulette/spin', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoRouletteSpinSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const spin = await RouletteService.spin(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      roulette: await RouletteService.state(fastify.prisma, player.id),
      spin,
    };
  });

  fastify.get('/street-dice', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return StreetDiceService.state(fastify.prisma, player.id);
  });

  fastify.post('/street-dice/start', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoStreetDiceStartSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const round = await StreetDiceService.start(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      streetDice: await StreetDiceService.state(fastify.prisma, player.id),
      round,
    };
  });

  fastify.post('/street-dice/roll', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoStreetDiceRollSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const round = await StreetDiceService.roll(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      streetDice: await StreetDiceService.state(fastify.prisma, player.id),
      round,
    };
  });

  fastify.post('/street-dice/odds', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoStreetDiceOddsSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const round = await StreetDiceService.addOdds(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      streetDice: await StreetDiceService.state(fastify.prisma, player.id),
      round,
    };
  });

  fastify.get('/poker', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoPokerService.state(fastify.prisma, player.id);
  });

  fastify.post('/poker/deal', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPokerStartSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const result = await CasinoPokerService.start(fastify.prisma, player.id, input);
    return { ...result, page: await CasinoService.page(fastify.prisma, player.id) };
  });

  fastify.post('/poker/action', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPokerActionSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const result = await CasinoPokerService.action(fastify.prisma, player.id, input);
    return { ...result, page: await CasinoService.page(fastify.prisma, player.id) };
  });

  fastify.post('/poker/tables', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPokerTableCreateSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    return { ...(await CasinoPokerService.createTable(fastify.prisma, player.id, input)), page: await CasinoService.page(fastify.prisma, player.id) };
  });
  fastify.post('/poker/tables/:tableId/join', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPokerTableJoinSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const { tableId } = request.params as { tableId: string };
    return { ...(await CasinoPokerService.joinTable(fastify.prisma, player.id, tableId, input)), page: await CasinoService.page(fastify.prisma, player.id) };
  });
  fastify.post('/poker/tables/:tableId/leave', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPokerTableActionSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const { tableId } = request.params as { tableId: string };
    await CasinoPokerService.leaveTable(fastify.prisma, player.id, tableId, input.actionId);
    return { page: await CasinoService.page(fastify.prisma, player.id), poker: await CasinoPokerService.state(fastify.prisma, player.id) };
  });
  fastify.get('/poker/tables/:tableId', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    const { tableId } = request.params as { tableId: string };
    return CasinoPokerService.table(fastify.prisma, player.id, tableId);
  });
  fastify.post('/poker/tables/:tableId/start', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPokerTableStartSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const { tableId } = request.params as { tableId: string };
    return { ...(await CasinoPokerService.startTableHand(fastify.prisma, player.id, tableId, input)), page: await CasinoService.page(fastify.prisma, player.id) };
  });
  fastify.post('/poker/tables/:tableId/action', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPokerTablePlaySchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const { tableId } = request.params as { tableId: string };
    return { ...(await CasinoPokerService.playTableAction(fastify.prisma, player.id, tableId, input)), page: await CasinoService.page(fastify.prisma, player.id) };
  });

  fastify.post('/sessions/:sessionId/close', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoSessionCloseSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const { sessionId } = request.params as { sessionId: string };
    return CasinoService.closeSession(fastify.prisma, player.id, sessionId, input.actionId);
  });
};

export default casinoRoutes;
