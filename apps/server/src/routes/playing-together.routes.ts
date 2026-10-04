import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addContactSchema, businessBuildSchema, blockWarAnswerSchema, blockWarCallSchema, blockWarDeclareSchema, blockWarEndSchema, blockWarSendSchema, businessCollectSchema, businessRacketSchema, businessStaffSchema, businessTorchSchema, bossHitBackupSchema, bossHitCallSchema, bossHitSchema, heatBribeSchema, productTradeSchema, runOutpostEstablishSchema, runOutpostTransferSchema, sitDownAnswerSchema, sitDownProposeSchema, travelRoutesSchema, tripExtendSchema, tripHeadHomeSchema, tripLaunchSchema, tripOutpostVisitSchema, tripRentGunsSchema, turfClaimSchema, turfPostSchema, turfPullSchema, turfPushBackupSchema, turfPushCallSchema, turfPushSchema, updateContactKindSchema, updateContactSchema, wirePinSchema, wirePostSchema, workSupplyClearSchema, workSupplyPolicySchema, workSupplyPreviewSchema } from '@streets/shared';
import { CitiesService } from '../services/cities.service.js';
import { ConvoyService } from '../services/convoy.service.js';
import { RelocationService } from '../services/relocation.service.js';
import { BossTripService } from '../services/boss-trip.service.js';
import { BossHitService } from '../services/boss-hit.service.js';
import { BossPresenceService } from '../services/boss-presence.service.js';
import { TravelService } from '../services/travel.service.js';
import { ContactsService } from '../services/contacts.service.js';
import { ProductMarketService } from '../services/product-market.service.js';
import { RoundService } from '../services/round.service.js';
import { WireService } from '../services/wire.service.js';
import { WorkSupplyService } from '../services/work-supply.service.js';
import { HeatService, toHeatDto } from '../services/heat.service.js';
import { PlayerStateService } from '../services/player-state.service.js';
import { LawService } from '../services/law.service.js';
import { PlayerDirectoryService } from '../services/player-directory.service.js';
import { TurfActionService } from '../services/turf-action.service.js';
import { BusinessActionService } from '../services/business-action.service.js';
import { BlockWarService } from '../services/block-war.service.js';
import { TurfWarService } from '../services/turf-war.service.js';
import { TurfOutpostService } from '../services/turf-outpost.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const postParams = z.object({ postId: z.string().min(1).max(64) }).strict();
const pimpParams = z.object({ publicPimpId: z.coerce.number().int().min(1).max(2_147_483_647) }).strict();
const wireQuery = z.object({ before: z.string().min(1).max(64).optional() }).strict();
const playerDirectoryQuery = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  view: z.enum(['all', 'city', 'alliance', 'near', 'encountered', 'active']).default('all'),
}).strict();

/** 0.3.0-D: the alliance wire and the private contacts rolodex. */
const playingTogetherRoutes: FastifyPluginAsync = async (app) => {
  async function me(accountId: string) {
    const round = await RoundService.requireCurrent(app.prisma);
    const player = await app.prisma.roundPlayer.findUnique({ where: { roundId_accountId: { roundId: round.id, accountId } }, select: { id: true } });
    if (!player) throw AppError.notFound('NOT_IN_ROUND', `You have not entered ${round.name} yet.`);
    return player.id;
  }

  app.get('/alliance/wire', { preHandler: app.requireAuth }, async (request) => {
    const { before } = parseBody(wireQuery, request.query);
    return WireService.list(app.prisma, await me(request.auth!.account.id), before);
  });

  app.post('/alliance/wire', { preHandler: app.requireAuth }, async (request) =>
    WireService.post(app.prisma, await me(request.auth!.account.id), parseBody(wirePostSchema, request.body ?? {})));

  app.post('/alliance/wire/:postId/remove', { preHandler: app.requireAuth }, async (request) => {
    const { postId } = parseBody(postParams, request.params);
    return WireService.remove(app.prisma, await me(request.auth!.account.id), postId);
  });

  app.post('/alliance/wire/:postId/pin', { preHandler: app.requireAuth }, async (request) => {
    const { postId } = parseBody(postParams, request.params);
    return WireService.pin(app.prisma, await me(request.auth!.account.id), postId, parseBody(wirePinSchema, request.body ?? {}));
  });

  /** 0.5.0-A: every city's character, Pip's usual supply there and the roads, from home. */
  app.get('/cities', { preHandler: app.requireAuth }, async (request) =>
    CitiesService.page(app.prisma, await me(request.auth!.account.id)));

  /** 0.6.0-B: claim locals, reinforce a held corner, or pull thugs home. */
  app.post('/turf/claim', { preHandler: app.requireAuth }, async (request) =>
    TurfActionService.claim(app.prisma, await me(request.auth!.account.id), parseBody(turfClaimSchema, request.body ?? {})));
  app.post('/turf/post', { preHandler: app.requireAuth }, async (request) =>
    TurfActionService.post(app.prisma, await me(request.auth!.account.id), parseBody(turfPostSchema, request.body ?? {})));
  app.post('/turf/pull', { preHandler: app.requireAuth }, async (request) =>
    TurfActionService.pull(app.prisma, await me(request.auth!.account.id), parseBody(turfPullSchema, request.body ?? {})));

  /** 1.1.0-B: build or upgrade a business, open or close it, and collect the registers. */
  app.post('/business/build', { preHandler: app.requireAuth }, async (request) =>
    BusinessActionService.build(app.prisma, await me(request.auth!.account.id), parseBody(businessBuildSchema, request.body ?? {})));
  app.post('/business/staff', { preHandler: app.requireAuth }, async (request) =>
    BusinessActionService.staff(app.prisma, await me(request.auth!.account.id), parseBody(businessStaffSchema, request.body ?? {})));
  /** 1.1.0-D: block wars - declare, defend, break the siege, go again, allies, concede, withdraw, torch. */
  app.post('/block-war/declare', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.declare(app.prisma, await me(request.auth!.account.id), parseBody(blockWarDeclareSchema, request.body ?? {})));
  app.post('/block-war/defend', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.defend(app.prisma, await me(request.auth!.account.id), parseBody(blockWarSendSchema, request.body ?? {})));
  app.post('/block-war/break', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.breakSiege(app.prisma, await me(request.auth!.account.id), parseBody(blockWarSendSchema, request.body ?? {})));
  app.post('/block-war/assault', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.assault(app.prisma, await me(request.auth!.account.id), parseBody(blockWarSendSchema, request.body ?? {})));
  app.post('/block-war/call', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.callAlly(app.prisma, await me(request.auth!.account.id), parseBody(blockWarCallSchema, request.body ?? {})));
  app.post('/block-war/answer', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.answer(app.prisma, await me(request.auth!.account.id), parseBody(blockWarAnswerSchema, request.body ?? {})));
  app.post('/block-war/concede', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.concede(app.prisma, await me(request.auth!.account.id), parseBody(blockWarEndSchema, request.body ?? {})));
  app.post('/block-war/withdraw', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.withdraw(app.prisma, await me(request.auth!.account.id), parseBody(blockWarEndSchema, request.body ?? {})));
  app.post('/business/torch', { preHandler: app.requireAuth }, async (request) =>
    BlockWarService.torch(app.prisma, await me(request.auth!.account.id), parseBody(businessTorchSchema, request.body ?? {})));
  /** 1.1.0-C: run, switch or shut a business's racket. */
  app.post('/business/racket', { preHandler: app.requireAuth }, async (request) =>
    BusinessActionService.racket(app.prisma, await me(request.auth!.account.id), parseBody(businessRacketSchema, request.body ?? {})));
  app.post('/business/collect', { preHandler: app.requireAuth }, async (request) =>
    BusinessActionService.collect(app.prisma, await me(request.auth!.account.id), parseBody(businessCollectSchema, request.body ?? {})));

  /** 0.6.0-C: commit a squad to a delayed player-vs-player turf push. */
  app.post('/turf/push', { preHandler: app.requireAuth }, async (request) =>
    TurfWarService.start(app.prisma, await me(request.auth!.account.id), parseBody(turfPushSchema, request.body ?? {})));
  app.post('/turf/push/backup', { preHandler: app.requireAuth }, async (request) =>
    TurfWarService.backup(app.prisma, await me(request.auth!.account.id), parseBody(turfPushBackupSchema, request.body ?? {})));
  app.post('/turf/push/call', { preHandler: app.requireAuth }, async (request) =>
    TurfWarService.callAllies(app.prisma, await me(request.auth!.account.id), parseBody(turfPushCallSchema, request.body ?? {})));

  /** 0.5.0-B: runs. The map, what the crew knows and the run; the ways out; and the four moves. */
  app.get('/travel', { preHandler: app.requireAuth }, async (request) =>
    TravelService.page(app.prisma, await me(request.auth!.account.id)));
  app.get('/travel/routes', { preHandler: app.requireAuth }, async (request) => {
    const { to, runId } = parseBody(travelRoutesSchema, request.query);
    return TravelService.routes(app.prisma, await me(request.auth!.account.id), to, runId);
  });
  app.post('/travel/launch', { preHandler: app.requireAuth }, async (request) =>
    TravelService.launch(app.prisma, await me(request.auth!.account.id), request.body ?? {}));
  app.post('/travel/trade', { preHandler: app.requireAuth }, async (request) =>
    TravelService.trade(app.prisma, await me(request.auth!.account.id), request.body ?? {}));
  app.post('/travel/drive-on', { preHandler: app.requireAuth }, async (request) =>
    TravelService.driveOn(app.prisma, await me(request.auth!.account.id), request.body ?? {}));
  app.post('/travel/head-home', { preHandler: app.requireAuth }, async (request) =>
    TravelService.headHome(app.prisma, await me(request.auth!.account.id), request.body ?? {}));

  /** 0.6.0-D: establish and service an away outpost while a run is physically in town. */
  app.post('/travel/outpost/establish', { preHandler: app.requireAuth }, async (request) =>
    TurfOutpostService.establish(app.prisma, await me(request.auth!.account.id), parseBody(runOutpostEstablishSchema, request.body ?? {})));
  app.post('/travel/outpost/transfer', { preHandler: app.requireAuth }, async (request) =>
    TurfOutpostService.transfer(app.prisma, await me(request.auth!.account.id), parseBody(runOutpostTransferSchema, request.body ?? {})));

  /** 0.5.0-E: runs you can hit, and the tails you are part of. */
  app.get('/convoys', { preHandler: app.requireAuth }, async (request) =>
    ConvoyService.page(app.prisma, await me(request.auth!.account.id)));

  app.post('/convoys/recon', { preHandler: app.requireAuth }, async (request) =>
    ConvoyService.recon(app.prisma, await me(request.auth!.account.id), request.body ?? {}));

  app.post('/convoys/tail', { preHandler: app.requireAuth }, async (request) =>
    ConvoyService.tail(app.prisma, await me(request.auth!.account.id), request.body ?? {}));

  app.post('/convoys/backup', { preHandler: app.requireAuth }, async (request) =>
    ConvoyService.backup(app.prisma, await me(request.auth!.account.id), request.body ?? {}));

  app.post('/convoys/call', { preHandler: app.requireAuth }, async (request) =>
    ConvoyService.callAllies(app.prisma, await me(request.auth!.account.id), request.body ?? {}));

  /** Trips C: hit a boss visiting where you live, once a recon has spotted them. */
  app.post('/convoys/boss-hit', { preHandler: app.requireAuth }, async (request) =>
    BossHitService.hit(app.prisma, await me(request.auth!.account.id), parseBody(bossHitSchema, request.body ?? {})));
  /** Trips D2: the boss calls allies in town; an ally sends thugs to the fight. */
  app.post('/convoys/boss-hit/call', { preHandler: app.requireAuth }, async (request) =>
    BossHitService.callAllies(app.prisma, await me(request.auth!.account.id), parseBody(bossHitCallSchema, request.body ?? {})));
  app.post('/convoys/boss-hit/backup', { preHandler: app.requireAuth }, async (request) =>
    BossHitService.backup(app.prisma, await me(request.auth!.account.id), parseBody(bossHitBackupSchema, request.body ?? {})));

  /** 0.5.0-D: move the whole operation to another city. */
  app.post('/travel/move', { preHandler: app.requireAuth }, async (request) =>
    RelocationService.move(app.prisma, await me(request.auth!.account.id), request.body ?? {}));

  /** Trips A: the boss flies out for a stay, stays on, or checks out and flies home. */
  app.post('/travel/trip', { preHandler: app.requireAuth }, async (request) =>
    BossTripService.launch(app.prisma, await me(request.auth!.account.id), parseBody(tripLaunchSchema, request.body ?? {})));
  app.post('/travel/trip/extend', { preHandler: app.requireAuth }, async (request) =>
    BossTripService.extend(app.prisma, await me(request.auth!.account.id), parseBody(tripExtendSchema, request.body ?? {})));
  app.post('/travel/trip/home', { preHandler: app.requireAuth }, async (request) =>
    BossTripService.headHome(app.prisma, await me(request.auth!.account.id), parseBody(tripHeadHomeSchema, request.body ?? {})));
  app.post('/travel/trip/guns', { preHandler: app.requireAuth }, async (request) =>
    BossTripService.rentGuns(app.prisma, await me(request.auth!.account.id), parseBody(tripRentGunsSchema, request.body ?? {})));
  /** Trips D2: walk an outpost in person, and sit down with another boss in the same city. */
  app.post('/travel/trip/outpost', { preHandler: app.requireAuth }, async (request) =>
    BossPresenceService.visitOutpost(app.prisma, await me(request.auth!.account.id), parseBody(tripOutpostVisitSchema, request.body ?? {})));
  app.post('/travel/sit-down', { preHandler: app.requireAuth }, async (request) =>
    BossPresenceService.propose(app.prisma, await me(request.auth!.account.id), parseBody(sitDownProposeSchema, request.body ?? {}).targetPublicPimpId));
  app.post('/travel/sit-down/answer', { preHandler: app.requireAuth }, async (request) => {
    const body = parseBody(sitDownAnswerSchema, request.body ?? {});
    return BossPresenceService.answer(app.prisma, await me(request.auth!.account.id), body.sitDownId, body.accept);
  });

  /** 0.4.0-A: the round's product catalog with the player's stock; 0.4.0-D adds Pip's counter and recipes. */
  app.get('/products', { preHandler: app.requireAuth }, async (request) =>
    ProductMarketService.page(app.prisma, await me(request.auth!.account.id)));

  app.post('/products/trade', { preHandler: app.requireAuth }, async (request) =>
    ProductMarketService.trade(app.prisma, await me(request.auth!.account.id), parseBody(productTradeSchema, request.body ?? {})));

  /** 0.4.0-B: per-job supply policies and a preview of what a trip will burn. */
  app.get('/work-supply', { preHandler: app.requireAuth }, async (request) =>
    WorkSupplyService.overview(app.prisma, await me(request.auth!.account.id)));

  app.post('/work-supply/policy', { preHandler: app.requireAuth }, async (request) =>
    WorkSupplyService.setPolicy(app.prisma, await me(request.auth!.account.id), parseBody(workSupplyPolicySchema, request.body ?? {})));

  app.post('/work-supply/policy/clear', { preHandler: app.requireAuth }, async (request) => {
    const { job } = parseBody(workSupplyClearSchema, request.body ?? {});
    return WorkSupplyService.clearPolicy(app.prisma, await me(request.auth!.account.id), job);
  });

  app.get('/work-supply/preview', { preHandler: app.requireAuth }, async (request) => {
    const { job, turns } = parseBody(workSupplyPreviewSchema, request.query);
    return WorkSupplyService.preview(app.prisma, await me(request.auth!.account.id), job, turns);
  });

  /** 0.4.0-C: Heat as it stands, and paying it down. */
  app.get('/heat', { preHandler: app.requireAuth }, async (request) => {
    const settled = await PlayerStateService.settle(app.prisma, await me(request.auth!.account.id), { markActive: false });
    const heat = toHeatDto(settled.player.heat, settled.player.netWorthCents, settled.ruleset, settled.player.lockedUntil);
    if (!heat) throw AppError.conflict('HEAT_DISABLED', 'There is no Heat in this round.');
    return heat;
  });

  app.post('/heat/bribe', { preHandler: app.requireAuth }, async (request) =>
    HeatService.bribe(app.prisma, await me(request.auth!.account.id), parseBody(heatBribeSchema, request.body ?? {})));

  /** 1.3.0-A: what each city's police have on you. Only ever the asking player's own Case. */
  app.get('/law', { preHandler: app.requireAuth }, async (request) => {
    const settled = await PlayerStateService.settle(app.prisma, await me(request.auth!.account.id), { markActive: false });
    const page = await LawService.page(app.prisma, settled.player.id, settled.player.cityId, settled.ruleset);
    if (!page) throw AppError.conflict('LAW_DISABLED', 'The police keep no Case in this round.');
    return page;
  });

  /** 0.9.0-A: discover current-round players without exposing recon or precise activity timestamps. */
  app.get('/players', { preHandler: app.requireAuth }, async (request) =>
    PlayerDirectoryService.list(
      app.prisma,
      await me(request.auth!.account.id),
      parseBody(playerDirectoryQuery, request.query),
    ));

  app.get('/contacts', { preHandler: app.requireAuth }, async (request) =>
    ContactsService.list(app.prisma, await me(request.auth!.account.id)));

  app.get('/contacts/:publicPimpId', { preHandler: app.requireAuth }, async (request) => {
    const { publicPimpId } = parseBody(pimpParams, request.params);
    return ContactsService.lookup(app.prisma, await me(request.auth!.account.id), publicPimpId);
  });

  app.post('/contacts', { preHandler: app.requireAuth }, async (request) =>
    ContactsService.add(app.prisma, await me(request.auth!.account.id), parseBody(addContactSchema, request.body ?? {})));

  app.post('/contacts/:publicPimpId/note', { preHandler: app.requireAuth }, async (request) => {
    const { publicPimpId } = parseBody(pimpParams, request.params);
    return ContactsService.updateNote(app.prisma, await me(request.auth!.account.id), publicPimpId, parseBody(updateContactSchema, request.body ?? {}));
  });

  app.post('/contacts/:publicPimpId/kind', { preHandler: app.requireAuth }, async (request) => {
    const { publicPimpId } = parseBody(pimpParams, request.params);
    return ContactsService.updateKind(app.prisma, await me(request.auth!.account.id), publicPimpId, parseBody(updateContactKindSchema, request.body ?? {}));
  });

  app.post('/contacts/:publicPimpId/remove', { preHandler: app.requireAuth }, async (request) => {
    const { publicPimpId } = parseBody(pimpParams, request.params);
    return ContactsService.remove(app.prisma, await me(request.auth!.account.id), publicPimpId);
  });
};

export default playingTogetherRoutes;
