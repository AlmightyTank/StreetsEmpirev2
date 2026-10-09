import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { loadRulesetForRound } from '@streets/rules-engine';
import {
  payoutSchema,
  produceCrackSchema,
  questAcceptSchema,
  questAbandonSchema,
  questAutoAcceptSchema,
  questClaimSchema,
  questTrackSchema,
  randomEncounterChoiceSchema,
  scoutSchema,
  storeTradeSchema,
  storeCheckoutSchema,
  storeSpecialOrderSchema,
  supplyOrderSchema,
  dealerStaffAssignSchema,
  dealerStaffReleaseSchema,
  hideoutUpgradeSchema,
  hideoutSpecializationSchema,
  hideoutWeaponPrioritySchema,
  favorActivateSchema,
  favorArmSchema,
  streetPassClaimSchema,
} from '@streets/shared';
import { toGameSnapshotDto } from '../game/dto.js';
import { PayoutService } from '../services/payout.service.js';
import { ProductionService } from '../services/production.service.js';
import { HandcraftedQuestService } from '../services/handcrafted-quest.service.js';
import { StreetPassService } from '../services/street-pass.service.js';
import { TimedFavorService } from '../services/timed-favor.service.js';
import { SingleUseFavorService } from '../services/single-use-favor.service.js';
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
import { onboardingActionSchema } from '@streets/shared';
import { OnboardingService } from '../services/onboarding.service.js';
import { PlayerExperienceService } from '../services/player-experience.service.js';
import { LawService } from '../services/law.service.js';
import { SupplyOrderService } from '../services/supply-order.service.js';
import { SupplyPickupService } from '../services/supply-pickup.service.js';
import { SupplyPropertyService } from '../services/supply-property.service.js';
import { SupplyLedgerService } from '../services/supply-ledger.service.js';
import { DealerStaffService } from '../services/dealer-staff.service.js';
import { DealerCrewService } from '../services/dealer-crew.service.js';
import { RandomEncounterChoiceService } from '../services/random-encounter-choice.service.js';
import { RandomEncounterService } from '../services/random-encounter.service.js';

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
  /** Account-wide XP is available even between seasons. */
  fastify.get('/experience', { preHandler: fastify.requireAuth }, async (request) => {
    const accountId = request.auth!.account.id;
    const [experience, events] = await Promise.all([
      PlayerExperienceService.view(fastify.prisma, accountId),
      PlayerExperienceService.recentEvents(fastify.prisma, accountId),
    ]);
    return { experience, events };
  });

  fastify.get('/me', { preHandler: fastify.requireAuth }, async (request) => {
    const query = request.query as { background?: string };
    const isBackground = query.background === '1' || query.background === 'true';

    const { round, player: existing } = await requirePlayer(request.auth!.account.id);

    const settled = await PlayerStateService.settle(fastify.prisma, existing.id, {
      markActive: !isBackground,
    });

    const [playerCount, recentActivity, streetPass, law, pendingEncounters] = await Promise.all([
      RoundService.playerCount(fastify.prisma, round.id),
      ActivityService.recent(fastify.prisma, existing.id, RECENT_ACTIVITY_LIMIT),
      StreetPassService.summary(fastify.prisma, existing.id, settled.ruleset),
      LawService.summary(fastify.prisma, existing.id, settled.ruleset),
      RandomEncounterService.pendingForPlayer(fastify.prisma, existing.id),
    ]);

    const snapshot = toGameSnapshotDto({
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
      pendingEncounters,
      recentActivity,
    });
    const experience = await PlayerExperienceService.view(fastify.prisma, settled.player.accountId);
    return { ...snapshot, player: { ...snapshot.player, streetPass, experience, ...(law ? { law } : {}) } };
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
      fastify.prisma,
      player.id,
      settled.ruleset,
      toState(settled.player),
      settled.stock,
      settled.standings,
      {
        now: new Date(),
        round: settled.round,
        playerRow: settled.player,
        turfBlocksHeld: settled.turf?.blocksHeld ?? 0,
      },
    );
  });

  fastify.post('/stores/trade', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(storeTradeSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return StoreService.trade(fastify.prisma, player.id, body);
  });

  fastify.post('/stores/checkout', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(storeCheckoutSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return StoreService.checkout(fastify.prisma, player.id, body);
  });

  fastify.post('/stores/special-order', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(storeSpecialOrderSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return StoreService.specialOrder(fastify.prisma, player.id, body);
  });

  fastify.get('/supply', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    // 1.6.0-C: settled first, so a pickup run that is due home has delivered.
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    const page = await SupplyOrderService.page(fastify.prisma, settled.round, settled.player);
    if (!page.enabled) return { ...page, pickups: null, ledger: null, history: [] };
    const [pickups, ledger, history] = await Promise.all([
      SupplyPickupService.planning(fastify.prisma, settled.ruleset, settled.player, now),
      SupplyLedgerService.ledger(fastify.prisma, settled.player.id),
      SupplyLedgerService.history(fastify.prisma, settled.ruleset, settled.player.id),
    ]);
    return { ...page, pickups, ledger, history };
  });

  fastify.post('/supply/pickups', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return SupplyPickupService.dispatch(fastify.prisma, player.id, request.body);
  });

  fastify.post('/supply/shipments', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return SupplyPickupService.ship(fastify.prisma, player.id, request.body);
  });

  fastify.post('/supply/properties', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return SupplyPropertyService.buy(fastify.prisma, player.id, request.body);
  });

  fastify.post('/supply/properties/close', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return SupplyPropertyService.close(fastify.prisma, player.id, request.body);
  });

  fastify.post('/supply/orders', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(supplyOrderSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return SupplyOrderService.place(fastify.prisma, player.id, body);
  });

  // 1.6.0-E: dealer crews.
  fastify.get('/dealers', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    return DealerCrewService.page(fastify.prisma, settled.ruleset, settled.player, now);
  });

  fastify.post('/dealers', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return DealerCrewService.establish(fastify.prisma, player.id, request.body);
  });

  for (const [path, run] of [
    ['offer', DealerCrewService.offer],
    ['stock', DealerCrewService.stock],
    ['manage', DealerCrewService.manage],
  ] as const) {
    fastify.post(`/dealers/:crewId/${path}`, { preHandler: fastify.requireAuth }, async (request) => {
      const { crewId } = parseBody(z.object({ crewId: z.string().trim().min(1).max(64) }).strict(), request.params);
      const { player } = await requirePlayer(request.auth!.account.id);
      return run(fastify.prisma, player.id, crewId, request.body);
    });
  }

  fastify.post('/supply/dealer-crews/:crewId/staff', { preHandler: fastify.requireAuth }, async (request) => {
    const { crewId } = parseBody(z.object({ crewId: z.string().trim().min(1).max(64) }).strict(), request.params);
    const body = parseBody(dealerStaffAssignSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return DealerStaffService.assign(fastify.prisma, player.id, crewId, body);
  });

  fastify.post('/supply/dealer-staff/:staffId/release', { preHandler: fastify.requireAuth }, async (request) => {
    const { staffId } = parseBody(z.object({ staffId: z.string().trim().min(1).max(64) }).strict(), request.params);
    const body = parseBody(dealerStaffReleaseSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return DealerStaffService.release(fastify.prisma, player.id, staffId, body);
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

  fastify.put('/quests/auto-accept', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(questAutoAcceptSchema, request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return HandcraftedQuestService.setAutoAccept(fastify.prisma, player.id, loadRulesetForRound(round), body.enabled);
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

  /** Street Pass: the round's track and this player's Cred and claims. `pass` is null on rounds without one. */
  fastify.get('/street-pass', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return { pass: await StreetPassService.view(fastify.prisma, player.id, loadRulesetForRound(round)) };
  });

  fastify.post('/street-pass/claim', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(streetPassClaimSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return StreetPassService.claim(fastify.prisma, player.id, body);
  });

  fastify.post('/favors/:key/activate', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(favorActivateSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    return TimedFavorService.activate(fastify.prisma, player.id, key, body);
  });

  fastify.post('/favors/:key/arm', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(favorArmSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    return SingleUseFavorService.arm(fastify.prisma, player.id, key, body);
  });

  fastify.post('/favors/:key/disarm', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(favorArmSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    return SingleUseFavorService.disarm(fastify.prisma, player.id, key, body);
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

  fastify.post('/encounters/:id/resolve', { preHandler: fastify.requireAuth }, async (request) => {
    const { id } = parseBody(z.object({ id: z.string().trim().min(1).max(80) }).strict(), request.params);
    const body = parseBody(randomEncounterChoiceSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);

    return RandomEncounterChoiceService.resolve(fastify.prisma, player.id, id, body);
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

  /** 1.0.0-B: tutorial progress and the early getting-started goals. */
  fastify.get('/onboarding', { preHandler: fastify.requireAuth }, async (request) =>
    OnboardingService.state(fastify.prisma, request.auth!.account.id));

  fastify.post('/onboarding', { preHandler: fastify.requireAuth }, async (request) =>
    OnboardingService.update(fastify.prisma, request.auth!.account.id, parseBody(onboardingActionSchema, request.body ?? {})));
};

export default gameRoutes;
