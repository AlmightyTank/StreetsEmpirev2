import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addContactSchema, updateContactSchema, wirePostSchema } from '@streets/shared';
import { ContactsService } from '../services/contacts.service.js';
import { ProductInventoryService } from '../services/product-inventory.service.js';
import { RoundService } from '../services/round.service.js';
import { WireService } from '../services/wire.service.js';
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

  /** 0.4.0-A: the round's product catalog with the player's stock. */
  app.get('/products', { preHandler: app.requireAuth }, async (request) =>
    ProductInventoryService.page(app.prisma, await me(request.auth!.account.id)));

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
