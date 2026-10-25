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
  questSceneResponseSchema,
  questTrackSchema,
  randomEncounterChoiceSchema,
  scoutSchema,
  storeTradeSchema,
  storeCheckoutSchema,
  storeSpecialOrderSchema,
  hideoutUpgradeSchema,
  hideoutSpecializationSchema,
  hideoutWeaponPrioritySchema,
  armoryBulkActionSchema,
  armoryLookActionSchema,
  armoryFeatureItemSchema,
  armoryModActionSchema,
  favorActivateSchema,
  favorArmSchema,
  streetPassClaimSchema,
  CLIENT_EASTER_EGG_IDS,
  profitIntelligenceGoalsSchema,
} from '@streets/shared';
import { toGameSnapshotDto } from '../game/dto.js';
import { PayoutService } from '../services/payout.service.js';
import { ProductionService } from '../services/production.service.js';
import { HandcraftedQuestService } from '../services/handcrafted-quest.service.js';
import { StreetPassService } from '../services/street-pass.service.js';
import { RoundRollCallService } from '../services/round-roll-call.service.js';
import { TimedFavorService } from '../services/timed-favor.service.js';
import { SingleUseFavorService } from '../services/single-use-favor.service.js';
import { ScoutService } from '../services/scout.service.js';
import { toState } from '../services/action.service.js';
import { StoreService } from '../services/store.service.js';
import { HideoutService } from '../services/hideout.service.js';
import { StashService } from '../services/stash.service.js';
import { ScavengingService } from '../services/scavenging.service.js';
import { MAX_SALVAGE_TRADE, SalvageYardService } from '../services/salvage-yard.service.js';
import { PlayerBoardService } from '../services/player-board.service.js';
import { GeneratorService, type GeneratorUpdate } from '../services/generator.service.js';
import { WorkshopService } from '../services/workshop.service.js';
import { HideoutCosmeticService } from '../services/hideout-cosmetic.service.js';
import { ArmoryService } from '../services/armory.service.js';
import { parseBody } from '../utils/validate.js';
import { ActivityService } from '../services/activity.service.js';
import { PlayerStateService } from '../services/player-state.service.js';
import { recordPlayerPresence } from '../services/player-presence.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundService } from '../services/round.service.js';
import { AppError } from '../utils/errors.js';
import { onboardingActionSchema } from '@streets/shared';
import { OnboardingService } from '../services/onboarding.service.js';
import { PlayerExperienceService } from '../services/player-experience.service.js';
import { LawService } from '../services/law.service.js';
import { RandomEncounterChoiceService } from '../services/random-encounter-choice.service.js';
import { RandomEncounterService } from '../services/random-encounter.service.js';
import { EasterEggService } from '../services/easter-egg.service.js';
import { RingService } from '../services/ring.service.js';
import { CityHoldingsService } from '../services/city-holdings.service.js';
import { ProfitIntelligenceService } from '../services/profit-intelligence.service.js';
import { PlayerSkillService } from '../services/player-skill.service.js';

const RECENT_ACTIVITY_LIMIT = 10;

const easterEggParams = z.object({ id: z.enum(CLIENT_EASTER_EGG_IDS) });
const streetSkillParams = z.object({ skill: z.string().min(1) });
const streetSkillChoiceBody = z.object({ threshold: z.number().int(), choice: z.string().min(1) });

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

  function assertFeatureAvailable(
    ruleset: ReturnType<typeof loadRulesetForRound>,
    feature: keyof NonNullable<ReturnType<typeof loadRulesetForRound>['retiredFeatures']>,
    label: string,
  ) {
    if (ruleset.retiredFeatures?.[feature]) {
      throw AppError.notFound('FEATURE_RETIRED', `${label} is no longer available.`);
    }
  }

  /**
   * The Board: parts count toward rank while the Board is on, so a part or cash change made outside
   * the action pipeline refreshes stored net worth and ranks straight away. Rounds without the Board
   * keep settling on the next read, as before.
   */
  async function settleAfterParts(round: Parameters<typeof loadRulesetForRound>[0], roundPlayerId: string) {
    if (loadRulesetForRound(round).playerBoard?.enabled) await PlayerStateService.settle(fastify.prisma, roundPlayerId);
  }

  fastify.get('/profit-intelligence', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).safeParse(request.query);
    if (!query.success) throw AppError.badRequest('INVALID_REPORT_PERIOD', 'Choose a report window from 1 to 90 days.');
    const { round, player } = await requirePlayer(request.auth!.account.id);
    reply.header('Cache-Control', 'private, no-store');
    return ProfitIntelligenceService.get(fastify.prisma, {
      roundId: round.id, roundPlayerId: player.id, roundStartsAt: round.startsAt,
      ruleset: loadRulesetForRound(round), days: query.data.days,
    });
  });

  fastify.get('/profit-intelligence/receipts', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = z.object({
      days: z.coerce.number().int().min(1).max(90).default(30),
      city: z.string().min(1).max(80).optional(),
      source: z.string().min(1).max(80).optional(),
      cursor: z.string().min(1).max(128).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).safeParse(request.query);
    if (!query.success) throw AppError.badRequest('INVALID_RECEIPT_QUERY', 'Choose a valid receipt filter.');
    const { round, player } = await requirePlayer(request.auth!.account.id);
    reply.header('Cache-Control', 'private, no-store');
    return ProfitIntelligenceService.receipts(fastify.prisma, {
      roundPlayerId: player.id, roundStartsAt: round.startsAt, ruleset: loadRulesetForRound(round),
      days: query.data.days, citySlug: query.data.city, source: query.data.source,
      cursor: query.data.cursor, limit: query.data.limit,
    });
  });

  fastify.put('/profit-intelligence/goals', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(profitIntelligenceGoalsSchema, request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return ProfitIntelligenceService.saveGoals(fastify.prisma, player.id, loadRulesetForRound(round), body);
  });

  fastify.get('/holdings', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const holding = await CityHoldingsService.read(fastify.prisma, loadRulesetForRound(round), round.id, player.id);
    if (!holding) throw AppError.notFound('HOLDINGS_UNAVAILABLE', 'City holdings are unavailable in this round.');
    return holding;
  });

  /**
   * Section 45. The whole dashboard in one request.
   *
   * `?background=1` marks the request as a keep-alive poll rather than the
   * player being at the keyboard, which is what keeps a tab left open
   * overnight eligible for the away bonus.
   */
  /**
   * Easter eggs the browser finds (the Konami code, a 404, the joke days).
   * The answer only says whether this was the first find; it never lists eggs.
   */
  fastify.post('/easter-eggs/:id', { preHandler: fastify.requireAuth }, async (request) => {
    const { id } = parseBody(easterEggParams, request.params);
    const found = await EasterEggService.discoverFromClient(fastify.prisma, request.auth!.account.id, id);
    return { isNew: found.isNew, title: found.egg.title, description: found.egg.description, ...(found.collection ? { collection: found.collection.label } : {}) };
  });

  /**
   * The Ring. GET reads this viewer's status (surfacing it first when the
   * round is old enough); POST destroys it at the Detroit foundry for the
   * reward plus the Ring-bearer title. Neither ever names an unfound egg.
   */
  fastify.get('/ring', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    await fastify.prisma.$transaction((tx) => RingService.maybeSurface(tx, round.id, now));
    return RingService.status(fastify.prisma, round.id, player.id, now);
  });
  fastify.post('/ring/destroy', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    return fastify.prisma.$transaction((tx) => RingService.destroy(tx, player.id, now));
  });

  /** Account-wide XP is available even between seasons. */
  fastify.get('/experience', { preHandler: fastify.requireAuth }, async (request) => {
    const accountId = request.auth!.account.id;
    const [experience, events] = await Promise.all([
      PlayerExperienceService.view(fastify.prisma, accountId),
      PlayerExperienceService.recentEvents(fastify.prisma, accountId),
    ]);
    return { experience, events };
  });

  /**
   * Presence is not dashboard settlement. A tiny authenticated check-in lets the
   * directory identify genuinely engaged players without keeping every player's
   * away-bonus clock alive through passive dashboard polling.
   *
   * Throttle the DB write across multiple tabs for the same player.
   */
  fastify.post('/presence/heartbeat', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    await recordPlayerPresence(fastify.prisma, player.id);
    return { ok: true };
  });

  fastify.get('/me', { preHandler: fastify.requireAuth }, async (request) => {
    const query = request.query as { background?: string };
    const isBackground = query.background === '1' || query.background === 'true';

    const { round, player: existing } = await requirePlayer(request.auth!.account.id);

    const settled = await PlayerStateService.settle(fastify.prisma, existing.id, {
      markActive: !isBackground,
    });

    const [playerCount, recentActivity, streetPass, roundRollCall, law, pendingEncounters] = await Promise.all([
      RoundService.playerCount(fastify.prisma, round.id),
      ActivityService.recent(fastify.prisma, existing.id, RECENT_ACTIVITY_LIMIT),
      StreetPassService.summary(fastify.prisma, existing.id, settled.ruleset),
      RoundRollCallService.summary(fastify.prisma, settled.round, existing.id),
      LawService.summary(fastify.prisma, existing.id, settled.ruleset),
      RandomEncounterService.pendingForPlayer(fastify.prisma, existing.id, new Date(), settled.ruleset),
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
    return { ...snapshot, player: { ...snapshot.player, streetPass, roundRollCall, experience, ...(law ? { law } : {}) } };
  });

  /** 2.3.0-C. Server-authoritative street skill milestones and choices. */
  fastify.get('/skills', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const ruleset = loadRulesetForRound(round);
    if (!ruleset.streetSkills) throw AppError.notFound('STREET_SKILLS_UNAVAILABLE', 'Street skills are unavailable in this round.');
    return await PlayerSkillService.view(fastify.prisma, player.id, ruleset.streetSkills);
  });

  fastify.post('/skills/:skill/choice', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const ruleset = loadRulesetForRound(round);
    if (!ruleset.streetSkills) throw AppError.notFound('STREET_SKILLS_UNAVAILABLE', 'Street skills are unavailable in this round.');
    const { skill } = parseBody(streetSkillParams, request.params);
    const body = parseBody(streetSkillChoiceBody, request.body);
    return fastify.prisma.$transaction((tx) => PlayerSkillService.choose(tx, {
      roundPlayerId: player.id,
      rules: ruleset.streetSkills!,
      skill,
      threshold: body.threshold,
      choice: body.choice,
    }));
  });

  fastify.post('/skills/:skill/respec', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const ruleset = loadRulesetForRound(round);
    if (!ruleset.streetSkills) throw AppError.notFound('STREET_SKILLS_UNAVAILABLE', 'Street skills are unavailable in this round.');
    const { skill } = parseBody(streetSkillParams, request.params);
    return fastify.prisma.$transaction((tx) => PlayerSkillService.respec(tx, {
      roundPlayerId: player.id,
      rules: ruleset.streetSkills!,
      skill,
      now: new Date(),
    }));
  });

  /**
   * Section 25. The districts this round's ruleset offers, with the rates the
   * player would actually get at their current crew size.
   */
  fastify.get('/districts', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return ScoutService.districts(fastify.prisma, player.id, loadRulesetForRound(round), player, player.city.slug);
  });

  // The Salvage Yard: hideout building materials for cash or barter.
  fastify.get('/stores/salvage', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const ruleset = loadRulesetForRound(round);
    assertFeatureAvailable(ruleset, 'salvageYard', 'The Salvage Yard');
    await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    return SalvageYardService.page(fastify.prisma, player.id, ruleset);
  });

  fastify.post('/stores/salvage/trade', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(z.object({ key: z.string().trim().min(1).max(64), quantity: z.number().int().min(1).max(MAX_SALVAGE_TRADE) }).strict(), request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const ruleset = loadRulesetForRound(round);
    assertFeatureAvailable(ruleset, 'salvageYard', 'The Salvage Yard');
    await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    const trade = await SalvageYardService.trade(fastify.prisma, player.id, body.key, body.quantity, new Date(), ruleset);
    await settleAfterParts(round, player.id);
    return trade;
  });

  // The Board D: the city-wide book, your offers and what you could list. Hidden while the flag is off.
  fastify.get('/stores/board', { preHandler: fastify.requireAuth }, async (request) => {
    const query = parseBody(z.object({ filter: z.enum(['ALL', 'PARTS', 'PRODUCTS', 'KEEPER']).default('ALL') }).strict(), request.query ?? {});
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return PlayerBoardService.book(fastify.prisma, round, loadRulesetForRound(round), player.id, query.filter);
  });

  // The Board C: escrow a stack of parts, take it down, and read your own offers. Fills arrive in E.
  fastify.get('/stores/board/mine', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return PlayerBoardService.mine(fastify.prisma, round, player.id);
  });

  fastify.post('/stores/board/offers', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(z.object({
      itemKey: z.string().trim().min(1).max(64),
      quantity: z.number().int().min(1).max(1_000_000),
      priceKind: z.enum(['CASH', 'BARTER']).default('CASH'),
      unitPriceCents: z.number().int().min(1).max(2_000_000_000).optional(),
      askItems: z.array(z.object({ key: z.string().trim().min(1).max(64), quantity: z.number().int().min(1).max(1_000_000) }).strict()).max(10).optional(),
      lotSize: z.number().int().min(1).max(1_000_000).optional(),
      durationHours: z.number().int().min(1).max(168),
    }).strict(), request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    const posted = await PlayerBoardService.post(fastify.prisma, round, loadRulesetForRound(round), player.id, body);
    await settleAfterParts(round, player.id);
    return posted;
  });

  // The Board E: buy a whole offer. Both sides' rank refreshes straight away.
  fastify.post('/stores/board/offers/:offerId/buy', { preHandler: fastify.requireAuth }, async (request) => {
    const params = z.object({ offerId: z.string().trim().min(1).max(64) }).safeParse(request.params);
    if (!params.success) throw AppError.notFound('OFFER_NOT_FOUND', 'That offer is gone.');
    const body = parseBody(z.object({ actionId: z.string().trim().min(1).max(80).optional(), quantity: z.number().int().min(1).max(1_000_000).optional() }).strict(), request.body ?? {});
    const { round, player } = await requirePlayer(request.auth!.account.id);
    await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    const filled = await PlayerBoardService.fill(fastify.prisma, round, loadRulesetForRound(round), player.id, params.data.offerId, body.actionId, new Date(), body.quantity);
    await settleAfterParts(round, player.id);
    const sold = await fastify.prisma.playerBoardOffer.findUnique({ where: { id: filled.offerId }, select: { sellerId: true } });
    if (sold) await settleAfterParts(round, sold.sellerId);
    return filled;
  });

  fastify.post('/stores/board/offers/:offerId/cancel', { preHandler: fastify.requireAuth }, async (request) => {
    const params = z.object({ offerId: z.string().trim().min(1).max(64) }).safeParse(request.params);
    if (!params.success) throw AppError.badRequest('OFFER_NOT_FOUND', 'That offer is not yours.');
    const { round, player } = await requirePlayer(request.auth!.account.id);
    await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    const cancelled = await PlayerBoardService.cancel(fastify.prisma, round, player.id, params.data.offerId);
    await settleAfterParts(round, player.id);
    return cancelled;
  });

  fastify.get('/stores', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    const catalog = await StoreService.catalog(
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
    // The Board D: the tab exists only on rounds that switched the Board on.
    return settled.ruleset.playerBoard?.enabled ? { ...catalog, playerBoard: true } : catalog;
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

  fastify.get('/hideout/stash', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return StashService.page(fastify.prisma, player.id);
  });

  fastify.put('/hideout/stash/layout', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(z.object({ items: z.array(z.object({
      key: z.enum(['CONDOM', 'MEDICINE', 'BEER', 'AMMO_BOX', 'PARTS_BOX', 'PISTOL', 'SHOTGUN', 'TEK9', 'AK47', 'LOW_RIDER', 'SEDAN', 'VAN', 'SCRAP_METAL', 'WIRING', 'TOOL_KIT', 'BOTTLES', 'LABELS', 'PACKAGING', 'LUMBER', 'FASTENERS', 'CLOTH', 'BASIC_MEDICINE', 'FUEL_CAN', 'RADIO', 'MOTOR_ASSEMBLY', 'REPAIR_SUPPLIES', 'SPECIALTY_CONTAINER', 'PRECISION_PARTS', 'ADVANCED_MEDICAL', 'HIGH_CAPACITY_FUEL_CELL', 'SPECIALIST_CIRCUITRY']),
      x: z.number().int().min(0).max(9),
      y: z.number().int().min(0).max(5),
    }).strict()).max(12) }).strict(), request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return StashService.saveLayout(fastify.prisma, player.id, body);
  });

  fastify.get('/hideout/scavenging', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    assertFeatureAvailable(loadRulesetForRound(round), 'scavenging', 'Scavenging');
    return ScavengingService.page(fastify.prisma, player.id);
  });

  fastify.post('/hideout/scavenging/:cacheId/open', { preHandler: fastify.requireAuth }, async (request) => {
    const { cacheId } = parseBody(z.object({ cacheId: z.string().trim().min(1).max(64) }).strict(), request.params);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    assertFeatureAvailable(loadRulesetForRound(round), 'scavenging', 'Scavenging');
    const opened = await ScavengingService.open(fastify.prisma, player.id, cacheId);
    await settleAfterParts(round, player.id);
    return opened;
  });

  fastify.get('/hideout/generator', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return GeneratorService.page(fastify.prisma, player.id);
  });

  fastify.post('/hideout/generator', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(z.object({
      powered: z.boolean().optional(),
      refuelCans: z.number().int().min(0).max(100).optional(),
      upgrade: z.enum(['CAPACITY', 'EFFICIENCY']).optional(),
    }).strict(), request.body) as GeneratorUpdate;
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const generator = await GeneratorService.update(fastify.prisma, player.id, body);
    await settleAfterParts(round, player.id);
    return generator;
  });

  fastify.get('/hideout/workshop', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return WorkshopService.page(fastify.prisma, player.id);
  });

  fastify.post('/hideout/workshop/craft', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(z.object({ recipeKey: z.string().trim().min(1).max(64), actionId: z.string().trim().min(1).max(128).optional() }).strict(), request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return WorkshopService.craft(fastify.prisma, player.id, body.recipeKey, body.actionId);
  });

  fastify.get('/armory', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    assertFeatureAvailable(settled.ruleset, 'armory', 'The Armory');
    return ArmoryService.catalog(fastify.prisma, player.id, request.auth!.account.id, settled.ruleset);
  });

  fastify.post('/armory/look', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(armoryLookActionSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    assertFeatureAvailable(loadRulesetForRound(await RoundService.requireCurrent(fastify.prisma)), 'armory', 'The Armory');
    return ArmoryService.setLook(fastify.prisma, player.id, request.auth!.account.id, body);
  });

  fastify.post('/armory/feature', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(armoryFeatureItemSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    assertFeatureAvailable(loadRulesetForRound(await RoundService.requireCurrent(fastify.prisma)), 'armory', 'The Armory');
    return ArmoryService.feature(fastify.prisma, player.id, request.auth!.account.id, body);
  });

  fastify.post('/armory/actions', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(armoryBulkActionSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    assertFeatureAvailable(loadRulesetForRound(await RoundService.requireCurrent(fastify.prisma)), 'armory', 'The Armory');
    return ArmoryService.update(fastify.prisma, player.id, body);
  });

  fastify.post('/armory/mod-actions', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(armoryModActionSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    assertFeatureAvailable(loadRulesetForRound(await RoundService.requireCurrent(fastify.prisma)), 'armory', 'The Armory');
    return ArmoryService.customize(fastify.prisma, player.id, body);
  });

  fastify.get('/hideout/cosmetics', { preHandler: fastify.requireAuth }, async (request) =>
    HideoutCosmeticService.catalog(fastify.prisma, request.auth!.account.id));

  fastify.post('/hideout/cosmetics', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(z.object({ decorationKey: z.string().trim().min(1).max(120).nullable(), streetSignKey: z.string().trim().min(1).max(120).nullable() }).strict(), request.body);
    return HideoutCosmeticService.update(fastify.prisma, request.auth!.account.id, body);
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

  fastify.get('/quests/history', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return { quests: await HandcraftedQuestService.history(fastify.prisma, player.id, loadRulesetForRound(round)) };
  });

  fastify.get('/quests/tracked', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return HandcraftedQuestService.tracked(fastify.prisma, player.id, loadRulesetForRound(round));
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

  fastify.post('/quests/:key/scenes/:sceneKey', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(questSceneResponseSchema, request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const params = request.params as { key: string; sceneKey: string };
    return HandcraftedQuestService.respondToScene(fastify.prisma, player.id, loadRulesetForRound(round), {
      questKey: String(params.key).trim().toUpperCase(),
      sceneKey: String(params.sceneKey).trim().toLowerCase(),
      responseKey: body.responseKey,
    });
  });

  fastify.post('/quests/:key/claim', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(questClaimSchema, request.body);
    const { round, player } = await requirePlayer(request.auth!.account.id);
    const key = String((request.params as { key: string }).key).trim().toUpperCase();
    const ruleset = loadRulesetForRound(round);
    // Return the paid claim receipt immediately. The client refreshes the board
    // in the background so it does not wait for a second full quest-page read.
    return HandcraftedQuestService.claim(fastify.prisma, player.id, ruleset, key, body);
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
