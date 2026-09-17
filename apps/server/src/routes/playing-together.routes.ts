import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addContactSchema, heatBribeSchema, productTradeSchema, workSupplyClearSchema, updateContactSchema, wirePostSchema, workSupplyPolicySchema, workSupplyPreviewSchema } from '@streets/shared';
import { ContactsService } from '../services/contacts.service.js';
import { ProductMarketService } from '../services/product-market.service.js';
import { RoundService } from '../services/round.service.js';
import { WireService } from '../services/wire.service.js';
import { WorkSupplyService } from '../services/work-supply.service.js';
import { HeatService, toHeatDto } from '../services/heat.service.js';
import { PlayerStateService } from '../services/player-state.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const postParams = z.object({ postId: z.string().min(1).max(64) }).strict();
const pimpParams = z.object({ publicPimpId: z.coerce.number().int().min(1).max(2_147_483_647) }).strict();
const wireQuery = z.object({ before: z.string().min(1).max(64).optional() }).strict();

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
    const heat = toHeatDto(settled.player.heat, settled.player.netWorthCents, settled.ruleset);
    if (!heat) throw AppError.conflict('HEAT_DISABLED', 'There is no Heat in this round.');
    return heat;
  });

  app.post('/heat/bribe', { preHandler: app.requireAuth }, async (request) =>
    HeatService.bribe(app.prisma, await me(request.auth!.account.id), parseBody(heatBribeSchema, request.body ?? {})));

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

  app.post('/contacts/:publicPimpId/remove', { preHandler: app.requireAuth }, async (request) => {
    const { publicPimpId } = parseBody(pimpParams, request.params);
    return ContactsService.remove(app.prisma, await me(request.auth!.account.id), publicPimpId);
  });
};

export default playingTogetherRoutes;
