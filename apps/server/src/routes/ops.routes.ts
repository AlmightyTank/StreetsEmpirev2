import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { botTokenMatches } from '../services/discord-bot.service.js';
import { wakeDiscordBot } from '../services/discord-bot-push.service.js';
import { DiscordStaffService, type StaffPostKind } from '../services/discord-staff.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const deploySchema = z.object({
  phase: z.enum(['started', 'finished', 'failed']),
  commit: z.string().regex(/^[0-9a-f]{7,40}$/, 'commit must be a hexadecimal SHA.'),
}).strict();

const DEPLOY_KINDS: Record<z.infer<typeof deploySchema>['phase'], StaffPostKind> = {
  started: 'STATUS_DEPLOY_STARTED',
  finished: 'STATUS_DEPLOY_FINISHED',
  failed: 'STATUS_DEPLOY_FAILED',
};

/**
 * Server-to-server API for scripts/ops/deploy-status.mjs, run on the VPS around a
 * deploy. It shares the patch notes token: both are the deploy talking to the game.
 */
const opsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    // Hidden entirely until the deploy token is configured.
    if (!env.patchNotes.enabled) throw AppError.notFound('NOT_FOUND', 'Not found.');
    if (!botTokenMatches(request.headers.authorization, env.patchNotes.apiToken)) {
      throw AppError.unauthenticated('A valid deploy token is required.');
    }
  });

  /** A deploy starting, finishing or failing: the Discord status channel says so, editing one post per deploy. */
  fastify.post('/deploy', async (request) => {
    const { phase, commit } = parseBody(deploySchema, request.body);
    await DiscordStaffService.queue(fastify.prisma, DEPLOY_KINDS[phase], commit);
    wakeDiscordBot('staff');
    return { ok: true };
  });
};

export default opsRoutes;
