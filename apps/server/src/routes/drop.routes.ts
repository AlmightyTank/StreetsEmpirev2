import type { FastifyPluginAsync } from 'fastify';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { DropWalletDetailDto } from '@streets/shared';
import { z } from 'zod';
import { CrownEarnService } from '../services/crown-earn.service.js';
import { CrownPackService } from '../services/crown-pack.service.js';
import { CrownWalletService } from '../services/crown-wallet.service.js';
import { DropCatalogService } from '../services/drop-catalog.service.js';
import { DropPurchaseService } from '../services/drop-purchase.service.js';
import { DropSettingsService, requireDropEnabled, switchesFor } from '../services/drop-settings.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundService } from '../services/round.service.js';
import { StreetPassSkipService } from '../services/street-pass-skip.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const slugParams = z.object({ slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/) }).strict();
const purchaseSchema = z.object({
  offerId: z.string().trim().min(1).max(160),
  actionId: z.string().trim().min(8).max(80),
}).strict();
const checkoutSchema = z.object({
  packId: z.string().trim().min(1).max(40),
  platform: z.string().trim().max(20).optional(),
}).strict();
const skipSchema = z.object({
  tiers: z.number().int().min(1).max(30),
  actionId: z.string().trim().min(8).max(80),
}).strict();
const platformQuery = z.object({ platform: z.string().trim().max(20).optional() }).passthrough();

/**
 * The Drop (docs/THE-DROP.md). Browsing works signed out with no private
 * data; the wallet, purchases, Crown packs and Street Pass skips need an
 * account. Nothing here answers while the Drop is off by environment.
 */
const dropRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async () => requireDropEnabled());

  async function requirePlayer(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const player = await RoundPlayerService.find(fastify.prisma, round.id, accountId);
    if (!player) throw AppError.notFound('NOT_IN_ROUND', `You have not entered ${round.name} yet.`);
    return { round, player };
  }

  /** Cheap check for the game menu: answers 404 while the Drop is off by environment. */
  fastify.get('/status', async () => {
    const settings = await DropSettingsService.get(fastify.prisma);
    return { enabled: switchesFor(settings).storefront };
  });

  fastify.get('/', async (request) =>
    DropCatalogService.storefront(fastify.prisma, request.auth?.account.id ?? null));

  fastify.get('/items/:slug', async (request) => {
    const { slug } = parseBody(slugParams, request.params);
    return DropCatalogService.detail(fastify.prisma, request.auth?.account.id ?? null, slug);
  });

  fastify.get('/wallet', { preHandler: fastify.requireAuth }, async (request): Promise<DropWalletDetailDto> => {
    const accountId = request.auth!.account.id;
    const [settings, round] = await Promise.all([DropSettingsService.get(fastify.prisma), RoundService.getCurrent(fastify.prisma)]);
    const player = round ? await RoundPlayerService.find(fastify.prisma, round.id, accountId) : null;
    const [wallet, opportunities, history, orders, packOrders] = await Promise.all([
      CrownWalletService.view(fastify.prisma, accountId, round?.id ?? null, settings.roundEarnCap),
      CrownEarnService.opportunities(fastify.prisma, accountId, round?.id ?? null, player?.id ?? null),
      CrownWalletService.history(fastify.prisma, accountId),
      DropPurchaseService.orders(fastify.prisma, accountId),
      CrownPackService.orders(fastify.prisma, accountId),
    ]);
    return { wallet, opportunities, history, orders, packOrders };
  });

  fastify.post('/purchase', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(purchaseSchema, request.body ?? {});
    return DropPurchaseService.purchase(fastify.prisma, request.auth!.account.id, body);
  });

  fastify.get('/crowns', async (request) => {
    const { platform } = parseBody(platformQuery, request.query ?? {});
    return CrownPackService.packs(fastify.prisma, platform ?? null);
  });

  fastify.post('/crowns/checkout', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(checkoutSchema, request.body ?? {});
    if (body.platform === 'android') {
      throw AppError.conflict('CROWN_PACKS_ANDROID', 'Crown packs are not sold in the Android app yet.');
    }
    return CrownPackService.startCheckout(fastify.prisma, request.auth!.account, body.packId);
  });

  fastify.get('/street-pass-skip', { preHandler: fastify.requireAuth }, async (request) => {
    const { round, player } = await requirePlayer(request.auth!.account.id);
    return StreetPassSkipService.quote(fastify.prisma, request.auth!.account.id, player.id, loadRulesetForRound(round));
  });

  fastify.post('/street-pass-skip', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(skipSchema, request.body ?? {});
    const { player } = await requirePlayer(request.auth!.account.id);
    return StreetPassSkipService.skip(fastify.prisma, player.id, body);
  });
};

export default dropRoutes;
