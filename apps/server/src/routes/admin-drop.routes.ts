import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DropAdminService } from '../services/drop-admin.service.js';
import { DropCatalogService } from '../services/drop-catalog.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const reason = z.string().trim().min(4).max(500);
const settingsSchema = z.object({
  storefront: z.boolean().optional(),
  purchases: z.boolean().optional(),
  earning: z.boolean().optional(),
  checkout: z.boolean().optional(),
  streetPassSkips: z.boolean().optional(),
  dailyOfferCount: z.number().int().optional(),
  dailyResetHourUtc: z.number().int().optional(),
  autoFeatured: z.boolean().optional(),
  roundEarnCap: z.number().int().optional(),
  largeAdjustmentThreshold: z.number().int().optional(),
  reason,
}).strict();
const entrySchema = z.object({
  state: z.string().optional(),
  priceCrowns: z.number().int().nullable().optional(),
  returnPolicy: z.string().optional(),
  inDailyPool: z.boolean().optional(),
  homepageSlot: z.number().int().nullable().optional(),
  confirmIrreversible: z.boolean().optional(),
  reason,
}).strict();
const offerSchema = z.object({
  refKey: z.string().trim().min(1).max(120),
  slot: z.string(),
  badge: z.string(),
  priceCrowns: z.number().int().nullable().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  reason,
}).strict();
const reasonOnly = z.object({ reason }).strict();
const adjustSchema = z.object({ delta: z.number().int(), reason }).strict();
const decideSchema = z.object({ approve: z.boolean(), reason }).strict();
const keyParams = z.object({ key: z.string().min(1).max(120) }).strict();
const idParams = z.object({ id: z.string().min(1).max(80) }).strict();
const accountParams = z.object({ accountId: z.string().min(1).max(80) }).strict();
const lookupQuery = z.object({ username: z.string().trim().min(1).max(40) }).strict();
const statusQuery = z.object({ status: z.string().max(20).optional() }).strict();

/** Admin → The Drop. Every write needs a reason and is audited. */
const adminDropRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireAdmin);
  const actor = (request: { auth: { account: { id: string; username: string } } | null }) =>
    ({ id: request.auth!.account.id, username: request.auth!.account.username });

  fastify.get('/drop', async () => DropAdminService.dashboard(fastify.prisma));

  fastify.get('/drop/preview/:key', async (request) => {
    const { key } = parseBody(keyParams, request.params);
    return DropCatalogService.preview(fastify.prisma, key);
  });

  fastify.patch('/drop/settings', async (request) => {
    const { reason: why, ...patch } = parseBody(settingsSchema, request.body ?? {});
    return DropAdminService.updateSettings(fastify.prisma, actor(request), patch, why);
  });

  fastify.patch('/drop/catalog/:key', async (request) => {
    const { key } = parseBody(keyParams, request.params);
    const { reason: why, ...patch } = parseBody(entrySchema, request.body ?? {});
    return DropAdminService.updateEntry(fastify.prisma, actor(request), key, patch, why);
  });

  fastify.post('/drop/offers', async (request) => {
    const { reason: why, ...input } = parseBody(offerSchema, request.body ?? {});
    return DropAdminService.createOffer(fastify.prisma, actor(request), input, why);
  });

  fastify.post('/drop/offers/:id/cancel', async (request) => {
    const { id } = parseBody(idParams, request.params);
    const { reason: why } = parseBody(reasonOnly, request.body ?? {});
    return DropAdminService.cancelOffer(fastify.prisma, actor(request), id, why);
  });

  fastify.get('/drop/wallets', async (request) => {
    const { username } = parseBody(lookupQuery, request.query ?? {});
    const account = await fastify.prisma.account.findUnique({ where: { usernameNormalized: username.toLowerCase() }, select: { id: true } });
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'No account has that username.');
    return DropAdminService.wallet(fastify.prisma, account.id);
  });

  fastify.get('/drop/wallets/:accountId', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    return DropAdminService.wallet(fastify.prisma, accountId);
  });

  fastify.post('/drop/wallets/:accountId/adjust', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(adjustSchema, request.body ?? {});
    return DropAdminService.requestAdjustment(fastify.prisma, actor(request), accountId, body.delta, body.reason);
  });

  fastify.post('/drop/wallets/:accountId/release', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const { reason: why } = parseBody(reasonOnly, request.body ?? {});
    await DropAdminService.releaseHold(fastify.prisma, actor(request), accountId, why);
    return DropAdminService.wallet(fastify.prisma, accountId);
  });

  fastify.post('/drop/adjustments/:id/decide', async (request) => {
    const { id } = parseBody(idParams, request.params);
    const body = parseBody(decideSchema, request.body ?? {});
    return DropAdminService.decideAdjustment(fastify.prisma, actor(request), id, body.approve, body.reason);
  });

  fastify.get('/drop/pack-orders', async (request) => {
    const { status } = parseBody(statusQuery, request.query ?? {});
    return { orders: await DropAdminService.packOrders(fastify.prisma, status) };
  });

  fastify.post('/drop/pack-orders/:id/reconcile', async (request) => {
    const { id } = parseBody(idParams, request.params);
    const { reason: why } = parseBody(reasonOnly, request.body ?? {});
    return DropAdminService.reconcilePackOrder(fastify.prisma, actor(request), id, why);
  });
};

export default adminDropRoutes;
