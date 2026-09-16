import type { FastifyPluginAsync } from 'fastify';
import { pushSubscribeSchema, updateNotificationSettingsSchema } from '@streets/shared';
import { z } from 'zod';
import { NotificationService } from '../services/notification.service.js';
import { PushService } from '../services/push.service.js';
import { parseBody } from '../utils/validate.js';

const deviceParams = z.object({ id: z.string().min(1).max(40) });
const endpointBody = z.object({ endpoint: z.string().url().max(1000) }).strict();

/** Alert preferences and push devices for the signed-in account. */
const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/settings', async (request) => NotificationService.settings(fastify.prisma, request.auth!.account.id));

  fastify.put('/settings', async (request) =>
    NotificationService.update(fastify.prisma, request.auth!.account.id, parseBody(updateNotificationSettingsSchema, request.body)));

  fastify.post('/push/subscriptions', async (request) => {
    const accountId = request.auth!.account.id;
    await PushService.subscribe(fastify.prisma, accountId, parseBody(pushSubscribeSchema, request.body), request.headers['user-agent'] ?? null);
    return NotificationService.settings(fastify.prisma, accountId);
  });

  fastify.delete('/push/subscriptions/:id', async (request) => {
    const accountId = request.auth!.account.id;
    await PushService.removeDevice(fastify.prisma, accountId, parseBody(deviceParams, request.params).id);
    return NotificationService.settings(fastify.prisma, accountId);
  });

  // A POST body, not a query string: the endpoint is a capability URL and stays out of logs.
  fastify.post('/push/forget', async (request) => {
    await PushService.removeEndpoint(fastify.prisma, request.auth!.account.id, parseBody(endpointBody, request.body).endpoint);
    return { ok: true };
  });

  fastify.post('/push/test', async (request) => {
    const result = await PushService.sendTest(fastify.prisma, request.auth!.account.id);
    return { ok: true, ...result };
  });
};

export default notificationRoutes;
