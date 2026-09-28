import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  archiveDirectMessageSchema,
  blockPlayerSchema,
  reportDirectMessageSchema,
  sendDirectMessageSchema,
} from '@streets/shared';
import { PimpConsoleService } from '../services/pimp-console.service.js';
import { parseBody } from '../utils/validate.js';

const consoleQuery = z.object({
  folder: z.enum(['inbox', 'sent', 'archived']).default('inbox'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
}).strict();

const consoleActivityQuery = z.object({
  filter: z.enum(['all', 'combat', 'turf', 'travel', 'market', 'progress', 'street', 'system']).default('all'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
}).strict();

const messageParams = z.object({
  messageId: z.string().trim().min(1).max(64),
}).strict();

const playerParams = z.object({
  publicPimpId: z.coerce.number().int().min(1).max(2_147_483_647),
}).strict();

/** 0.9.0-B1. Durable private messaging, archive/report controls, and account blocks. */
const pimpConsoleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/console/summary', { preHandler: app.requireAuth }, async (request) =>
    PimpConsoleService.summary(app.prisma, request.auth!.account.id));

  app.get('/console', { preHandler: app.requireAuth }, async (request) => {
    const query = parseBody(consoleQuery, request.query);
    return PimpConsoleService.page(
      app.prisma,
      request.auth!.account.id,
      query.folder,
      query.page,
    );
  });

  app.get('/console/activity', { preHandler: app.requireAuth }, async (request) => {
    const query = parseBody(consoleActivityQuery, request.query);
    return PimpConsoleService.activity(
      app.prisma,
      request.auth!.account.id,
      query.filter,
      query.page,
    );
  });

  app.post('/console/messages', { preHandler: app.requireAuth }, async (request) =>
    PimpConsoleService.send(
      app.prisma,
      request.auth!.account.id,
      parseBody(sendDirectMessageSchema, request.body ?? {}),
    ));

  app.post('/console/messages/:messageId/read', { preHandler: app.requireAuth }, async (request) => {
    const { messageId } = parseBody(messageParams, request.params);
    return PimpConsoleService.read(app.prisma, request.auth!.account.id, messageId);
  });

  app.post('/console/messages/:messageId/archive', { preHandler: app.requireAuth }, async (request) => {
    const { messageId } = parseBody(messageParams, request.params);
    return PimpConsoleService.archive(
      app.prisma,
      request.auth!.account.id,
      messageId,
      parseBody(archiveDirectMessageSchema, request.body ?? {}),
    );
  });

  app.post('/console/messages/:messageId/report', { preHandler: app.requireAuth }, async (request) => {
    const { messageId } = parseBody(messageParams, request.params);
    return PimpConsoleService.report(
      app.prisma,
      request.auth!.account.id,
      messageId,
      parseBody(reportDirectMessageSchema, request.body ?? {}),
    );
  });

  app.get('/console/blocks', { preHandler: app.requireAuth }, async (request) =>
    PimpConsoleService.blocks(app.prisma, request.auth!.account.id));

  app.post('/console/blocks', { preHandler: app.requireAuth }, async (request) => {
    const { targetPublicPimpId } = parseBody(blockPlayerSchema, request.body ?? {});
    return PimpConsoleService.block(
      app.prisma,
      request.auth!.account.id,
      targetPublicPimpId,
    );
  });

  app.post('/console/blocks/:publicPimpId/remove', { preHandler: app.requireAuth }, async (request) => {
    const { publicPimpId } = parseBody(playerParams, request.params);
    return PimpConsoleService.unblock(
      app.prisma,
      request.auth!.account.id,
      publicPimpId,
    );
  });

  /** 0.9.0-H: mute is private and one-sided; the muted player can still write, quietly archived. */
  app.post('/console/mutes', { preHandler: app.requireAuth }, async (request) => {
    const { targetPublicPimpId } = parseBody(blockPlayerSchema, request.body ?? {});
    return PimpConsoleService.mute(app.prisma, request.auth!.account.id, targetPublicPimpId);
  });

  app.post('/console/mutes/:publicPimpId/remove', { preHandler: app.requireAuth }, async (request) => {
    const { publicPimpId } = parseBody(playerParams, request.params);
    return PimpConsoleService.unmute(app.prisma, request.auth!.account.id, publicPimpId);
  });

  /** 0.9.0-H: delete a whole conversation from your own side. */
  app.post('/console/conversations/:publicPimpId/hide', { preHandler: app.requireAuth }, async (request) => {
    const { publicPimpId } = parseBody(playerParams, request.params);
    return PimpConsoleService.hideConversation(app.prisma, request.auth!.account.id, publicPimpId);
  });
};

export default pimpConsoleRoutes;
