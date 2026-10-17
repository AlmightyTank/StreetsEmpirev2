import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../utils/validate.js';
import { AdminAuditService } from '../services/admin-audit.service.js';
import { AdminLivingStoriesService } from '../services/admin-living-stories.service.js';
import { LIVING_CASE_KEYS } from '@streets/rulesets';
import { LIVING_STORY_MEMORY_KINDS } from '../services/living-story-trigger.service.js';

const identifier = z.string().trim().min(1).max(128);
const key = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const overviewQuery = z.object({ roundId: identifier }).strict();
const diagnose = z.object({
  roundId: identifier, ownerId: identifier, memoryId: identifier, storyKey: key,
}).strict();
const simulate = z.object({
  roundId: identifier, ownerId: identifier, storyKey: key,
  eventKind: z.enum(LIVING_STORY_MEMORY_KINDS),
  publicSource: z.boolean(), participant: z.boolean(),
  reason: z.string().trim().min(5).max(500),
}).strict();
const draft = z.object({
  roundId: identifier,
  key, title: z.string().trim().min(3).max(120),
  caseKey: z.enum(LIVING_CASE_KEYS),
  eventKinds: z.array(z.enum(LIVING_STORY_MEMORY_KINDS)).min(1).max(6)
    .refine((items) => new Set(items).size === items.length, 'Duplicate trigger kinds'),
  audience: z.enum(['ACTORS', 'CITY_PLAYERS']),
  visibility: z.enum(['OWNER_ONLY', 'PUBLIC_SUMMARY']),
  expiresAfterActiveMinutes: z.number().int().min(5).max(7 * 24 * 60),
  rewardBudgetCents: z.number().int().min(0).max(2500),
  reason: z.string().trim().min(5).max(500),
  expectedRevision: z.number().int().min(1).optional(),
}).strict();

const adminLivingStoriesRoutes: FastifyPluginAsync = async (fastify) => {
  // Own hook, not contingent on the unrelated admin.routes.ts plugin scope.
  fastify.addHook('onRequest', fastify.requireAdmin);

  fastify.get('/living-stories', async (request, reply) => {
    const { roundId } = parseBody(overviewQuery, request.query);
    reply.header('Cache-Control', 'private, no-store');
    return AdminLivingStoriesService.overview(fastify.prisma, roundId);
  });

  fastify.post('/living-stories/diagnose', async (request, reply) => {
    const input = parseBody(diagnose, request.body);
    reply.header('Cache-Control', 'private, no-store');
    return AdminLivingStoriesService.diagnose(fastify.prisma, input);
  });

  /** Hypothetical source preview; not a live event trigger. Every attempt audited. */
  fastify.post('/living-stories/simulate', async (request, reply) => {
    const { reason, ...input } = parseBody(simulate, request.body);
    reply.header('Cache-Control', 'private, no-store');
    return fastify.prisma.$transaction(async (tx) => {
      const result = await AdminLivingStoriesService.simulate(tx, input);
      await AdminAuditService.record(tx, request.auth!.account, {
        action: 'living-story.qa-simulate', targetType: 'round', targetId: input.roundId,
        reason, after: { storyKey: input.storyKey, eventKind: input.eventKind,
          dryRun: true, result: result.reason },
      });
      return result;
    });
  });

  /** Never enables a definition or changes a round-pinned catalog. */
  fastify.post('/living-stories/drafts', async (request, reply) => {
    const input = parseBody(draft, request.body);
    reply.header('Cache-Control', 'private, no-store');
    return fastify.prisma.$transaction((tx) =>
      AdminLivingStoriesService.writeDraft(tx, request.auth!.account, input));
  });
};
export default adminLivingStoriesRoutes;
