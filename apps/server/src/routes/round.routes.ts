import type { FastifyPluginAsync } from 'fastify';
import { loadRulesetForRound } from '@streets/rules-engine';
import { toRoundDto, toRoundPlayerDto } from '../game/dto.js';
import { PlayerStateService } from '../services/player-state.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { isJoinable, RoundService } from '../services/round.service.js';

const roundRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * The round the player is sent to, plus their player in it if they have
   * one. Returns nulls rather than a 404 so the client can render "no game
   * running" without treating it as an error.
   *
   * Loading this page counts as being at the keyboard, and settles turns.
   */
  fastify.get('/current', async (request) => {
    const round = await RoundService.getCurrent(fastify.prisma);
    if (!round) return { round: null, me: null, canJoin: false };

    const playerCount = await RoundService.playerCount(fastify.prisma, round.id);

    const existing = request.auth
      ? await RoundPlayerService.find(fastify.prisma, round.id, request.auth.account.id)
      : null;

    if (!existing) {
      return {
        round: toRoundDto(round, playerCount),
        me: null,
        canJoin: Boolean(request.auth) && isJoinable(round),
      };
    }

    const settled = await PlayerStateService.settle(fastify.prisma, existing.id);

    return {
      round: toRoundDto(settled.round, playerCount),
      me: toRoundPlayerDto(settled.player, settled.ruleset, settled.turns),
      canJoin: false,
    };
  });

  fastify.post(
    '/current/join',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const round = await RoundService.requireCurrent(fastify.prisma);

      const created = await RoundPlayerService.join(
        fastify.prisma,
        round,
        request.auth!.account,
      );

      const [settled, playerCount] = await Promise.all([
        PlayerStateService.settle(fastify.prisma, created.id),
        RoundService.playerCount(fastify.prisma, round.id),
      ]);

      return reply.status(201).send({
        round: toRoundDto(settled.round, playerCount),
        me: toRoundPlayerDto(settled.player, settled.ruleset, settled.turns),
        canJoin: false,
      });
    },
  );

  /** Section 40. Public facts about the running game. */
  fastify.get('/current/status', async () => {
    const round = await RoundService.getCurrent(fastify.prisma);
    if (!round) return { round: null, ruleset: null, turns: null };

    const playerCount = await RoundService.playerCount(fastify.prisma, round.id);
    const ruleset = loadRulesetForRound(round);

    return {
      round: toRoundDto(round, playerCount),
      ruleset: {
        id: ruleset.meta.id,
        version: ruleset.meta.version,
        name: ruleset.meta.name,
      },
      turns: {
        amountPerInterval: ruleset.turns.amountPerInterval,
        intervalMinutes: ruleset.turns.intervalMinutes,
        cap: ruleset.turns.cap,
        awayBonus: ruleset.turns.awayBonus,
      },
    };
  });
};

export default roundRoutes;
