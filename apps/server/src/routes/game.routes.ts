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
  crewDealerMembersSchema,
  crewTurfMembersSchema,
  crewTurfMoveMembersSchema,
  supplyOrderSchema,
  loanAcceptSchema,
  loanPaymentSchema,
  crewCornerJobSchema,
  crewRosterQuerySchema,
  crewTrainingSchema,
  crewNicknameSchema,
  crewMentorLinkSchema,
  crewMentorEndSchema,
  crewAssignmentSchema,
  crewStaffingOrderSchema,
  dealerStaffAssignSchema,
  dealerStaffReleaseSchema,
  dealerCrewRunnerReserveSchema,
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
import { SupplyOrderService } from '../services/supply-order.service.js';
import { LoanService } from '../services/loan.service.js';
import { LoanSharkService } from '../services/loan-shark.service.js';
import { loadLoan, loanPaymentPreview } from '../services/loan-ledger.service.js';
import { SupplyPickupService } from '../services/supply-pickup.service.js';
import { SupplyPropertyService } from '../services/supply-property.service.js';
import { SupplyLedgerService } from '../services/supply-ledger.service.js';
import { SupplyLaneService } from '../services/supply-lane.service.js';
import { DealerStaffService } from '../services/dealer-staff.service.js';
import { DealerCrewService } from '../services/dealer-crew.service.js';
import { CrewAssignmentService } from '../services/crew-assignment.service.js';
import { CrewRosterService } from '../services/crew-roster.service.js';
import { CrewBondService } from '../services/crew-bonds.service.js';
import { CrewLegendService } from '../services/crew-legends.service.js';
import { CrewTrainingService } from '../services/crew-training.service.js';
import { CrewStaffingOrderService } from '../services/crew-staffing-order.service.js';
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
    const { player } = await requirePlayer(request.auth!.account.id);
    await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    return SalvageYardService.page(fastify.prisma, player.id);
  });

  fastify.post('/stores/salvage/trade', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(z.object({ key: z.string().trim().min(1).max(64), quantity: z.number().int().min(1).max(MAX_SALVAGE_TRADE) }).strict(), request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    await PlayerStateService.settle(fastify.prisma, player.id, { markActive: true });
    return SalvageYardService.trade(fastify.prisma, player.id, body.key, body.quantity);
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

  fastify.post('/supply/lanes', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return SupplyLaneService.ship(fastify.prisma, player.id, request.body);
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

  // 1.6.5-B: the loan shark. Settled first, so installments that are due have been collected.
  fastify.get('/loans', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    return LoanSharkService.page(fastify.prisma, settled.ruleset, settled.player, now);
  });

  fastify.post('/loans/accept', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(loanAcceptSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return LoanService.acceptOffer(fastify.prisma, player.id, body);
  });

  // 1.6.5-D: what a payment would do, then the payment itself. Payments only ever spend cash.
  const loanParams = z.object({ loanId: z.string().trim().min(1).max(64) }).strict();
  fastify.get('/loans/:loanId/preview', { preHandler: fastify.requireAuth }, async (request) => {
    const { loanId } = parseBody(loanParams, request.params);
    const { amountCents } = parseBody(z.object({ amountCents: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict(), request.query);
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    // Settled first, so anything due is collected and the preview starts where a payment would.
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    const loan = await loadLoan(fastify.prisma, loanId);
    if (!loan || loan.roundPlayerId !== player.id) throw AppError.notFound('LOAN_NOT_FOUND', 'That loan is not yours.');
    return loanPaymentPreview(loan, BigInt(amountCents), now, { debtCents: settled.player.loanDebtCents, cashCents: settled.player.cashCents });
  });

  fastify.post('/loans/:loanId/pay', { preHandler: fastify.requireAuth }, async (request) => {
    const { loanId } = parseBody(loanParams, request.params);
    const body = parseBody(loanPaymentSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return LoanService.repay(fastify.prisma, player.id, { loanId, requestKey: body.requestKey, actionId: body.actionId, amountCents: BigInt(body.amountCents) });
  });

  // 1.7.0-A: the crew as individual members, in step with the counts.
  fastify.get('/crew', { preHandler: fastify.requireAuth }, async (request) => {
    const query = parseBody(crewRosterQuerySchema, request.query);
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    return CrewRosterService.view(fastify.prisma, player.id, settled.ruleset, query, now);
  });

  // 2.1.0-D. Owner-scoped, optional mentor relationships; neither endpoint
  // grants game resources, XP or combat advantage.
  fastify.post('/crew/mentors', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewMentorLinkSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    return CrewBondService.link(fastify.prisma, player.id, settled.ruleset, body, now);
  });
  fastify.post('/crew/mentors/end', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewMentorEndSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    await CrewBondService.end(fastify.prisma, player.id, body.bondId, settled.ruleset, now);
    return { ok: true };
  });

  fastify.post('/crew/nickname', { preHandler: fastify.requireAuth }, async (request) => {
    const input = parseBody(crewNicknameSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false });
    await CrewLegendService.select(fastify.prisma, player.id, settled.ruleset, input);
    return { ok: true };
  });

  fastify.post('/crew/train', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewTrainingSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewTrainingService.train(fastify.prisma, player.id, body);
  });
  fastify.post('/crew/exchange', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewAssignmentSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    return CrewRosterService.exchange(fastify.prisma, player.id, body.memberId, body.replaceMemberId, body.actionId, settled.ruleset, now);
  });

  fastify.post('/crew/corner-jobs/assign', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewCornerJobSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    return CrewRosterService.assignCornerJob(fastify.prisma, player.id, body, settled.ruleset, now);
  });

  fastify.post('/crew/corner-jobs/release', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewCornerJobSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    return CrewRosterService.releaseCornerJob(fastify.prisma, player.id, body, settled.ruleset, now);
  });

  fastify.get('/crew/staffing-orders', { preHandler: fastify.requireAuth }, async (request) => {
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewStaffingOrderService.list(fastify.prisma, player.id);
  });

  fastify.post('/crew/staffing-orders', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewStaffingOrderSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    const now = new Date();
    const settled = await PlayerStateService.settle(fastify.prisma, player.id, { markActive: false, now });
    return CrewStaffingOrderService.set(fastify.prisma, player.id, body, settled.ruleset, now);
  });

  const crewDealerParams = z.object({ crewId: z.string().trim().min(1).max(64) }).strict();
  fastify.post('/crew/dealers/:crewId/assign', { preHandler: fastify.requireAuth }, async (request) => {
    const { crewId } = parseBody(crewDealerParams, request.params);
    const body = parseBody(crewDealerMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.assignDealer(fastify.prisma, player.id, crewId, body);
  });

  fastify.post('/crew/dealers/release', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewDealerMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.releaseDealers(fastify.prisma, player.id, body);
  });

  fastify.post('/crew/dealers/:crewId/move', { preHandler: fastify.requireAuth }, async (request) => {
    const { crewId } = parseBody(crewDealerParams, request.params);
    const body = parseBody(crewDealerMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.moveDealers(fastify.prisma, player.id, crewId, body);
  });

  fastify.post('/crew/runners/:crewId/assign', { preHandler: fastify.requireAuth }, async (request) => {
    const { crewId } = parseBody(crewDealerParams, request.params);
    const body = parseBody(crewDealerMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.assignRunners(fastify.prisma, player.id, crewId, body);
  });

  fastify.post('/crew/runners/release', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewDealerMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.releaseRunners(fastify.prisma, player.id, body);
  });

  fastify.post('/crew/runners/:crewId/move', { preHandler: fastify.requireAuth }, async (request) => {
    const { crewId } = parseBody(crewDealerParams, request.params);
    const body = parseBody(crewDealerMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.moveRunners(fastify.prisma, player.id, crewId, body);
  });

  fastify.post('/crew/turf/post', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewTurfMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.postTurf(fastify.prisma, player.id, body);
  });

  fastify.post('/crew/turf/pull', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewTurfMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.pullTurf(fastify.prisma, player.id, body);
  });

  fastify.post('/crew/turf/move', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(crewTurfMoveMembersSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return CrewAssignmentService.moveTurf(fastify.prisma, player.id, body);
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
    ['runner-reserve', DealerCrewService.runnerReserve],
    ['manage', DealerCrewService.manage],
  ] as const) {
    fastify.post(`/dealers/:crewId/${path}`, { preHandler: fastify.requireAuth }, async (request) => {
      const { crewId } = parseBody(z.object({ crewId: z.string().trim().min(1).max(64) }).strict(), request.params);
      if (path === 'runner-reserve') parseBody(dealerCrewRunnerReserveSchema, request.body);
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
    const { player } = await requirePlayer(request.auth!.account.id);
    return ScavengingService.page(fastify.prisma, player.id);
  });

  fastify.post('/hideout/scavenging/:cacheId/open', { preHandler: fastify.requireAuth }, async (request) => {
    const { cacheId } = parseBody(z.object({ cacheId: z.string().trim().min(1).max(64) }).strict(), request.params);
    const { player } = await requirePlayer(request.auth!.account.id);
    return ScavengingService.open(fastify.prisma, player.id, cacheId);
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
    const { player } = await requirePlayer(request.auth!.account.id);
    return GeneratorService.update(fastify.prisma, player.id, body);
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
    return ArmoryService.catalog(fastify.prisma, player.id, request.auth!.account.id, settled.ruleset);
  });

  fastify.post('/armory/look', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(armoryLookActionSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return ArmoryService.setLook(fastify.prisma, player.id, request.auth!.account.id, body);
  });

  fastify.post('/armory/feature', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(armoryFeatureItemSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return ArmoryService.feature(fastify.prisma, player.id, request.auth!.account.id, body);
  });

  fastify.post('/armory/actions', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(armoryBulkActionSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
    return ArmoryService.update(fastify.prisma, player.id, body);
  });

  fastify.post('/armory/mod-actions', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(armoryModActionSchema, request.body);
    const { player } = await requirePlayer(request.auth!.account.id);
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
