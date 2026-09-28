import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

/**
 * 1.0.0-F. Maintenance mode (MAINTENANCE_MODE=true): every player request is turned
 * away with 503 and the maintenance message, so nothing writes to the database while
 * it is being migrated, restored or repaired. Admins keep full access to check the
 * game before reopening it; health checks, the status page, the banner and sign-in
 * keep working so players see why and admins can get in.
 */
const OPEN_PATHS = [
  '/api/health', '/api/ready', '/api/meta', '/api/metrics',
  '/api/site/banner', '/api/public/status',
  '/api/auth/login', '/api/auth/logout', '/api/auth/me',
];

export function maintenanceAllows(path: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (OPEN_PATHS.includes(path)) return true;
  // The bot's server-to-server API authenticates on its own and only reads/claims.
  return path.startsWith('/api/internal/');
}

/** Requests turned away on purpose: monitoring counts them as refusals, not server errors. */
export const maintenanceRefusals = new WeakSet<FastifyRequest>();

const maintenancePlugin: FastifyPluginAsync = async (fastify) => {
  if (!env.maintenance.enabled) return;
  fastify.log.warn('MAINTENANCE_MODE is on: player requests are refused with 503.');
  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?', 1)[0] ?? request.url;
    if (!path.startsWith('/api/') || maintenanceAllows(path, Boolean(request.auth?.account.isAdmin))) return;
    maintenanceRefusals.add(request);
    reply.header('retry-after', '300');
    return reply.status(503).send({ error: { code: 'MAINTENANCE', message: env.maintenance.message } });
  });
};

export default fp(maintenancePlugin, { name: 'maintenance', dependencies: ['auth'] });
