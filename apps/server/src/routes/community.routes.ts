import type { FastifyPluginAsync } from 'fastify';
import { toActivityDto } from '../game/dto.js';
import { ActivityService } from '../services/activity.service.js';
import { CommunityService } from '../services/community.service.js';
import { PlayerStateService } from '../services/player-state.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { RoundService } from '../services/round.service.js';
import { AppError } from '../utils/errors.js';

const MAX_ACTIVITY = 100;

const communityRoutes: FastifyPluginAsync = async (fastify) => {
  async function requireSettledPlayer(accountId: string) {
    const round = await RoundService.requireCurrent(fastify.prisma);
    const existing = await RoundPlayerService.find(fastify.prisma, round.id, accountId);

    if (!existing) {
      throw AppError.notFound('NOT_IN_ROUND', `You have not entered ${round.name} yet.`);
    }

    const settled = await PlayerStateService.settle(fastify.prisma, existing.id, {
      markActive: true,
    });

    return { round, settled };
  }

  /** 0.1.0-E: national and current-city leaderboards. */
  fastify.get('/rankings', { preHandler: fastify.requireAuth }, async (request) => {
    const { settled } = await requireSettledPlayer(request.auth!.account.id);

    return CommunityService.rankings(
      fastify.prisma,
      settled.player,
      settled.ruleset.rankings.topCount,
      settled.ruleset,
    );
  });

  /** 0.1.0-E: public, deliberately non-sensitive player profile. */
  fastify.get('/players/:publicPimpId', { preHandler: fastify.requireAuth }, async (request) => {
    const params = request.params as { publicPimpId?: string };
    const publicPimpId = Number(params.publicPimpId);

    if (!Number.isSafeInteger(publicPimpId) || publicPimpId < 1) {
      throw AppError.badRequest('INVALID_PIMP_ID', 'That pimp number is not valid.');
    }

    const { round, settled } = await requireSettledPlayer(request.auth!.account.id);
    const player = await CommunityService.profile(
      fastify.prisma,
      round.id,
      publicPimpId,
      settled.player.publicPimpId,
      settled.ruleset,
    );

    return { player };
  });

  /** 0.1.0-E: the player's full recent history rather than the dashboard's ten rows. */
  fastify.get('/activity', { preHandler: fastify.requireAuth }, async (request) => {
    const query = request.query as { limit?: string };
    const requested = Number(query.limit ?? 50);
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(MAX_ACTIVITY, Math.floor(requested)))
      : 50;

    const { settled } = await requireSettledPlayer(request.auth!.account.id);
    const activity = await ActivityService.recent(fastify.prisma, settled.player.id, limit);

    return { activity: activity.map(toActivityDto) };
  });
};

export default communityRoutes;
