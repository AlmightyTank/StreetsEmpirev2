import type { FastifyPluginAsync } from 'fastify';
import { loadRulesetForRound } from '@streets/rules-engine';
import {
  casinoBlackjackActionSchema,
  casinoBlackjackDealSchema,
  casinoPoolPressSchema,
  casinoPoolRackSchema,
  casinoPoolShotSchema,
  casinoCashierSchema,
  casinoCompHotelSchema,
  casinoSessionCloseSchema,
  casinoSessionStartSchema,
  casinoSlotSpinSchema,
  casinoRouletteSpinSchema,
  casinoScratchCardPlaySchema,
  casinoHorseRaceBetSchema,
  casinoPokerActionSchema,
  casinoPokerStartSchema,
  casinoPokerTableCreateSchema,
  casinoPokerTableJoinSchema,
  casinoPokerTableActionSchema,
  casinoPokerTableStartSchema,
  casinoPokerTablePlaySchema,
  sportsbookBetSchema,
} from '@streets/shared';
import { BlackjackService } from '../services/blackjack.service.js';
import { PoolService } from '../services/pool.service.js';
import { CasinoService } from '../services/casino.service.js';
import { RouletteService } from '../services/roulette.service.js';
import { CasinoInstantGamesService } from '../services/casino-instant-games.service.js';
import { CasinoPokerService } from '../services/casino-poker.service.js';
import { CasinoTournamentsService } from '../services/casino-tournaments.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundService } from '../services/round.service.js';
import { env } from '../config/env.js';
import { accountTrust, assertTrustGate } from '../services/communication-guard.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';
import { SportsbookService } from '../services/sportsbook.service.js';

const casinoRoutes: FastifyPluginAsync = async (fastify) => {
  async function requirePlayer(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const player = await RoundPlayerService.find(fastify.prisma, round.id, accountId);
    if (!player) throw AppError.notFound('NOT_IN_ROUND', 'You have not entered the current round yet.');
    return player;
  }

  // Account level unlocks: new accounts reach the casino and the sportsbook after a few levels
  // of play. Ways out (cashing chips, closing a session, leaving a table) always stay open.
  const ALWAYS_OPEN = new Set(['/chips/redeem', '/sessions/:sessionId/close', '/poker/tables/:tableId/leave', '/poker/tables/:tableId/timeout']);
  fastify.addHook('preHandler', async (request) => {
    if (request.method !== 'POST' || !request.auth) return;
    const url = request.routeOptions.url ?? '';
    const path = url.slice(url.indexOf('/game/casino') + '/game/casino'.length);
    if (ALWAYS_OPEN.has(path)) return;
    const gate = path.startsWith('/sportsbook') ? 'sportsbook' : 'casino';
    assertTrustGate(await accountTrust(fastify.prisma, request.auth.account.id), gate);
  });

  fastify.get('/', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoService.page(fastify.prisma, player.id);
  });

  fastify.get('/sportsbook', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    const [board, tickets, limits] = await Promise.all([
      SportsbookService.board(fastify.prisma, { configured: true, pollMinutes: env.SPORTSBOOK_POLL_MINUTES }),
      SportsbookService.tickets(fastify.prisma, player.id),
      SportsbookService.limits(fastify.prisma, player.id),
    ]);
    return { ...board, tickets, limits };
  });

  fastify.post('/sportsbook/bets', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(sportsbookBetSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    return SportsbookService.placeBet(fastify.prisma, player.id, input);
  });

  fastify.get('/tournaments', { preHandler: fastify.requireAuth }, async (request) => {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const player = await requirePlayer(request.auth!.account.id);
    const ruleset = loadRulesetForRound(round);
    if (!ruleset.casino?.status) {
      return { available: false, weekStartsAt: new Date().toISOString(), weekEndsAt: new Date().toISOString(), serverTime: new Date().toISOString(), standings: [], yourEntries: 0, records: [] };
    }
    return CasinoTournamentsService.page(fastify.prisma, round.id, player.id);
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

  fastify.get('/pool', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return PoolService.state(fastify.prisma, player.id);
  });

  fastify.post('/pool/rack', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPoolRackSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const game = await PoolService.rack(fastify.prisma, player.id, input);
    return { page: await CasinoService.page(fastify.prisma, player.id), pool: await PoolService.state(fastify.prisma, player.id), game };
  });

  fastify.post('/pool/shot', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPoolShotSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const game = await PoolService.shoot(fastify.prisma, player.id, input);
    return { page: await CasinoService.page(fastify.prisma, player.id), pool: await PoolService.state(fastify.prisma, player.id), game };
  });

  fastify.post('/pool/press', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPoolPressSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const game = await PoolService.press(fastify.prisma, player.id, input);
    return { page: await CasinoService.page(fastify.prisma, player.id), pool: await PoolService.state(fastify.prisma, player.id), game };
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

  fastify.get('/scratch-cards', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoInstantGamesService.scratchState(fastify.prisma, player.id);
  });

  fastify.post('/scratch-cards/play', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoScratchCardPlaySchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const card = await CasinoInstantGamesService.playScratch(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      scratchCards: await CasinoInstantGamesService.scratchState(fastify.prisma, player.id),
      card,
    };
  });

  fastify.get('/horse-racing', { preHandler: fastify.requireAuth }, async (request) => {
    const player = await requirePlayer(request.auth!.account.id);
    return CasinoInstantGamesService.horseState(fastify.prisma, player.id);
  });

  fastify.post('/horse-racing/races', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoHorseRaceBetSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const race = await CasinoInstantGamesService.runHorseRace(fastify.prisma, player.id, input);
    return {
      page: await CasinoService.page(fastify.prisma, player.id),
      horseRacing: await CasinoInstantGamesService.horseState(fastify.prisma, player.id),
      race,
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
  fastify.post('/poker/tables/:tableId/timeout', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoPokerTableActionSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const { tableId } = request.params as { tableId: string };
    return { ...(await CasinoPokerService.timeoutTableTurn(fastify.prisma, player.id, tableId, input.actionId)), page: await CasinoService.page(fastify.prisma, player.id) };
  });

  fastify.post('/sessions/:sessionId/close', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(casinoSessionCloseSchema, request.body);
    const player = await requirePlayer(request.auth!.account.id);
    const { sessionId } = request.params as { sessionId: string };
    return CasinoService.closeSession(fastify.prisma, player.id, sessionId, input.actionId);
  });
};

export default casinoRoutes;
