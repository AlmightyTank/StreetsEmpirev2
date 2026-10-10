import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { botTokenMatches } from '../services/discord-bot.service.js';
import { PatchNotesService } from '../services/patch-notes.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const patchNotesSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
}).strict();

/** Server-to-server API for scripts/ops/patch-notes.mjs, run on the VPS after a deploy. */
const patchNotesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    // Hidden entirely until patch notes are configured.
    if (!env.patchNotes.enabled) throw AppError.notFound('NOT_FOUND', 'Not found.');
    if (!botTokenMatches(request.headers.authorization, env.patchNotes.apiToken)) {
      throw AppError.unauthenticated('A valid patch notes token is required.');
    }
  });

  fastify.post('/', async (request, reply) => {
    const held = await PatchNotesService.hold(fastify.prisma, parseBody(patchNotesSchema, request.body));
    return reply.status(held.duplicate ? 200 : 201).send(held);
  });
};

export default patchNotesRoutes;
