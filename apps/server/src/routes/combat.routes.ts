import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { combatReconSchema, combatTreatmentSchema, driveBySchema, raidSchema, specialRaidSchema } from '@streets/shared';
import { CombatService } from '../services/combat.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundService } from '../services/round.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const combatRoutes: FastifyPluginAsync = async (app) => {
  async function player(accountId: string, roundId?: string) {
    const id = roundId ?? (await RoundService.requireCurrent(app.prisma)).id;
    const found = await RoundPlayerService.find(app.prisma, id, accountId);
    if (!found) throw AppError.notFound('NOT_IN_ROUND', 'You have not entered this round.');
    return found;
  }
  app.get('/combat', { preHandler: app.requireAuth }, async (request) => {
    const query = parseBody(z.object({ after: z.coerce.number().int().min(0).max(2_147_483_647).default(0), background: z.enum(['0', '1']).optional() }), request.query);
    const me = await player(request.auth!.account.id);
    return CombatService.page(app.prisma, me.id, query.after, query.background === '1');
  });
  app.post('/combat/raid', { preHandler: app.requireAuth }, async (request) => {
    const input = parseBody(raidSchema, request.body);
    // Explicit round pins retries to the original player if the current round changes.
    const me = await player(request.auth!.account.id, input.roundId);
    return CombatService.raid(app.prisma, me.id, input);
  });
  app.post('/combat/drive-by', { preHandler: app.requireAuth }, async (request) => {
    const input = parseBody(driveBySchema, request.body);
    const me = await player(request.auth!.account.id, input.roundId);
    return CombatService.driveBy(app.prisma, me.id, input);
  });
  app.post('/combat/special', { preHandler: app.requireAuth }, async (request) => {
    const input = parseBody(specialRaidSchema, request.body);
    const me = await player(request.auth!.account.id, input.roundId);
    return CombatService.specialRaid(app.prisma, me.id, input);
  });
  app.post('/combat/recon', { preHandler: app.requireAuth }, async (request) => {
    const input = parseBody(combatReconSchema, request.body);
    const me = await player(request.auth!.account.id, input.roundId);
    return CombatService.recon(app.prisma, me.id, input);
  });
  app.post('/combat/treat', { preHandler: app.requireAuth }, async (request) => {
    const input = parseBody(combatTreatmentSchema, request.body);
    const me = await player(request.auth!.account.id, input.roundId);
    return CombatService.treat(app.prisma, me.id, input);
  });
  app.get('/combat/reports', { preHandler: app.requireAuth }, async (request) => {
    const query = parseBody(z.object({ before: z.string().uuid().optional(), roundId: z.string().min(1).max(64).optional() }), request.query);
    const me = await player(request.auth!.account.id, query.roundId);
    return CombatService.reports(app.prisma, me.id, query.before);
  });
};
export default combatRoutes;
