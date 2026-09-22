import type { FastifyPluginAsync } from 'fastify';
import { loadRulesetForRound } from '@streets/rules-engine';
import {
  payoutSchema,
  produceCrackSchema,
  questAcceptSchema,
  questAbandonSchema,
  questClaimSchema,
  questTrackSchema,
  scoutSchema,
  storeTradeSchema,
  hideoutUpgradeSchema,
  hideoutSpecializationSchema,
  hideoutWeaponPrioritySchema,
  favorActivateSchema,
} from '@streets/shared';
import { toGameSnapshotDto } from '../game/dto.js';
import { PayoutService } from '../services/payout.service.js';
import { ProductionService } from '../services/production.service.js';
import { HandcraftedQuestService } from '../services/handcrafted-quest.service.js';
import { TimedFavorService } from '../services/timed-favor.service.js';
import { ScoutService } from '../services/scout.service.js';
import { toState } from '../services/action.service.js';
import { StoreService } from '../services/store.service.js';
import { HideoutService } from '../services/hideout.service.js';
import { parseBody } from '../utils/validate.js';
import { ActivityService } from '../services/activity.service.js';
import { PlayerStateService } from '../services/player-state.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundService } from '../services/round.service.js';
import { AppError } from '../utils/errors.js';

const RECENT_ACTIVITY_LIMIT = 10;

const gameRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * The player's RoundPlayer for the running round, or a player-facing 404.
   * Every action route starts here.
   */
  async function requirePlayer(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);

    const player = await RoundPlayerService.find(fastify.prisma, round.id, accountId);
    if (!player) {
      throw AppError.notFound(
        'NOT_IN_ROUND',
        `You have not entered ${round.name} yet.`,
      );
    }

    return { round, player };
  }

  /**
   * Section 45. The whole dashboard in one request.
   *
   * `?background=1` marks the request as a keep-alive poll rather than the
   * player being at the keyboard, which is what keeps a tab left open
   * overnight eligible for the away bonus.
   */
  fastify.get('/me', { preHandler: fastify.requireAuth }, async (request) => {
    const query = request.query as { background?: string };
    const isBackground = query.background === '1' || query.background === 'true';

    const { round, player: existing } = await requirePlayer(request.auth!.account.id);

    const settled = await PlayerStateService.settle(fastify.prisma, existing.id, {
      markActive: !isBackground,
    });

    const [playerCount, recentActivity] = await Promise.all([
      RoundService.playerCount(fastify.prisma, round.id),
      ActivityService.recent(fastify.prisma, existing.id, RECENT_ACTIVITY_LIMIT),
    ]);

    return toGameSnapshotDto({
      round: settled.round,
      playerCount,
      player: settled.player,
      ruleset: settled.ruleset,
      turns: settled.turns,
      products: settled.products,
      run: settled.run,
      moving: settled.moving,
      convoyAlert: settled.convoyAlert,
      turf: settled.turf,
      recentActivity,
    });
  });

  /**
   * Section 25. The districts this round's ruleset offers, with the rates the
   * player would actually get at their current crew size.
   */
  fastify.get('/districts', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return ScoutService.districts(loadRulesetForRound(round), player, player.city.slug);
  });

  fastify.get('/stores', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    return StoreService.catalog(
      settled.ruleset,
      toState(settled.player),
      settled.stock,
      settled.standings,
    );
  });

  fastify.post('/stores/trade', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(storeTradeSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return StoreService.trade(fastify.prisma, player.id, body);
  });

  fastify.get('/hideout', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    return HideoutService.page(
      fastify.prisma,
      settled.ruleset,
      settled.player,
      toState(settled.player),
      settled.products,
    );
  });

  fastify.post('/hideout/upgrade', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(hideoutUpgradeSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return HideoutService.upgrade(fastify.prisma, player.id, body);
  });

  fastify.post('/hideout/armory/priority', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(hideoutWeaponPrioritySchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return HideoutService.setWeaponPriority(fastify.prisma, player.id, body);
  });

  fastify.post('/hideout/specialization', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(hideoutSpecializationSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return HideoutService.setSpecialization(fastify.prisma, player.id, body);
  });

  fastify.get('/quests', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return HandcraftedQuestService.page(fastify.prisma, player.id, loadRulesetForRound(round));
  });

  fastify.post('/quests/:key/accept', { preHandler: fastify.requireAuth }, async (request) => {
    parseBody(questAcceptSchema, request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    return HandcraftedQuestService.accept(fastify.prisma, player.id, loadRulesetForRound(round), key);
  });

  fastify.post('/quests/:key/abandon', { preHandler: fastify.requireAuth }, async (request) => {
    parseBody(questAbandonSchema, request.body ?? {});
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    return HandcraftedQuestService.abandon(fastify.prisma, player.id, loadRulesetForRound(round), key);
  });

  fastify.post('/quests/:key/track', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(questTrackSchema, request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    return HandcraftedQuestService.track(fastify.prisma, player.id, loadRulesetForRound(round), key, body.tracked);
  });

  fastify.post('/quests/:key/claim', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(questClaimSchema, request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    return HandcraftedQuestService.claim(fastify.prisma, player.id, loadRulesetForRound(round), key, body);
  });

  fastify.post('/favors/:key/activate', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(favorActivateSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    return TimedFavorService.activate(fastify.prisma, player.id, key, body);
  });

  /** Section 26. */
  fastify.post('/scout', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(scoutSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);

    return ScoutService.scout(fastify.prisma, player.id, body);
  });

  fastify.post('/work', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(scoutSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);

    return ScoutService.scout(fastify.prisma, player.id, body);
  });


  /** Section 29. */
  fastify.post(
    '/produce-crack',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const body = parseBody(produceCrackSchema, request.body);
      const { player } = await requirePlayer(request.auth!.account.id);

      return ProductionService.produceCrack(fastify.prisma, player.id, body);
    },
  );

  /** Section 31. */
  fastify.put('/payout', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(payoutSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);

    return PayoutService.setPayout(fastify.prisma, player.id, body);
  });
};

export default gameRoutes;
