import type { FastifyPluginAsync } from 'fastify';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { AdminSeasonChecklistItemDto } from '@streets/shared';
import { toRoundDto, toRoundOverDto, toRoundPlayerDto } from '../game/dto.js';
import { legacyAchievements, loadAccountLegacy } from '../services/community.service.js';
import { PlayerStateService } from '../services/player-state.service.js';
import { RoundPlayerService } from '../services/round-player.service.js';
import { isJoinable, RoundService } from '../services/round.service.js';

const roundRoutes: FastifyPluginAsync = async (fastify) => {
  const requireAdmin = fastify.requireAdmin;

  function item(input: AdminSeasonChecklistItemDto): AdminSeasonChecklistItemDto {
    return input;
  }

  async function latestRoundOver(accountId: string) {
    const player = await fastify.prisma.roundPlayer.findFirst({
      where: { accountId, round: { status: { in: ['ENDED', 'ARCHIVED'] } } },
      orderBy: { round: { endsAt: 'desc' } },
      include: { city: true, round: true },
    });
    if (!player) return null;
    const { round, ...rest } = player;
    const [legacy, previousLegacy] = await Promise.all([
      loadAccountLegacy(fastify.prisma, accountId, null),
      loadAccountLegacy(fastify.prisma, accountId, round.id),
    ]);
    const previousKeys = new Set(
      legacyAchievements(previousLegacy)
        .filter((award) => award.unlocked)
        .map((award) => award.key),
    );
    const earnedLegacyBadges = legacyAchievements(legacy)
      .filter((award) => award.unlocked)
      .map((award) => ({
        key: award.key,
        title: award.title,
        description: award.description,
        rarity: award.rarity,
      }));
    return toRoundOverDto({
      round,
      player: rest,
      playerCount: await RoundService.playerCount(fastify.prisma, round.id),
      legacy,
      earnedLegacyBadges,
      newLegacyBadges: earnedLegacyBadges.filter((badge) => !previousKeys.has(badge.key)),
    });
  }

  /**
   * The round the player is sent to, plus their player in it if they have
   * one. Returns nulls rather than a 404 so the client can render "no game
   * running" without treating it as an error.
   *
   * Loading this page counts as being at the keyboard, and settles turns.
   */
  fastify.get('/current', async (request) => {
    const roundOver = request.auth ? await latestRoundOver(request.auth.account.id) : null;
    const round = await RoundService.getCurrent(fastify.prisma);
    if (!round) return { round: null, me: null, canJoin: false, roundOver };

    const playerCount = await RoundService.playerCount(fastify.prisma, round.id);

    const existing = request.auth
      ? await RoundPlayerService.find(fastify.prisma, round.id, request.auth.account.id)
      : null;

    if (!existing) {
      return {
        round: toRoundDto(round, playerCount),
        me: null,
        canJoin: Boolean(request.auth) && isJoinable(round),
        roundOver,
      };
    }

    const settled = await PlayerStateService.settle(fastify.prisma, existing.id);

    return {
      round: toRoundDto(settled.round, playerCount),
      me: toRoundPlayerDto(settled.player, settled.ruleset, settled.turns),
      canJoin: false,
      roundOver,
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
        roundOver: null,
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

  fastify.get('/admin/season-checklist', { preHandler: requireAdmin }, async () => {
    const now = new Date();
    await RoundService.closeExpired(fastify.prisma, now);

    const [current, latestEnded, nextScheduled, activeRoundCount, openExpiredRounds] = await Promise.all([
      RoundService.getCurrent(fastify.prisma, now),
      fastify.prisma.round.findFirst({
        where: { status: { in: ['ENDED', 'ARCHIVED'] } },
        orderBy: { endsAt: 'desc' },
      }),
      fastify.prisma.round.findFirst({
        where: {
          status: { in: ['SCHEDULED', 'REGISTRATION', 'ACTIVE'] },
          startsAt: { gt: now },
        },
        orderBy: { startsAt: 'asc' },
      }),
      fastify.prisma.round.count({ where: { status: 'ACTIVE', endsAt: { gt: now } } }),
      fastify.prisma.round.count({ where: { status: { in: ['REGISTRATION', 'ACTIVE'] }, endsAt: { lte: now } } }),
    ]);

    const currentDto = current ? toRoundDto(current, await RoundService.playerCount(fastify.prisma, current.id)) : null;
    const latestEndedDto = latestEnded ? toRoundDto(latestEnded, await RoundService.playerCount(fastify.prisma, latestEnded.id)) : null;
    const nextRound = current ?? nextScheduled;
    const nextRoundDto = nextRound ? toRoundDto(nextRound, await RoundService.playerCount(fastify.prisma, nextRound.id)) : null;

    const [latestEndedPlayers, latestEndedUnranked, latestEndedPodium, latestEndedNews] = latestEnded
      ? await Promise.all([
        RoundService.playerCount(fastify.prisma, latestEnded.id),
        fastify.prisma.roundPlayer.count({
          where: {
            roundId: latestEnded.id,
            account: { isActive: true },
            OR: [{ nationalRank: null }, { localRank: null }],
          },
        }),
        fastify.prisma.roundPlayer.count({
          where: {
            roundId: latestEnded.id,
            account: { isActive: true },
            nationalRank: { not: null, lte: 3 },
          },
        }),
        fastify.prisma.gameNews.count({
          where: {
            roundId: latestEnded.id,
            publishedAt: { lte: now },
          },
        }),
      ])
      : [0, 0, 0, 0];

    const items: AdminSeasonChecklistItemDto[] = [
      item({
        key: 'expired-rounds-closed',
        label: 'Expired open rounds closed',
        status: openExpiredRounds === 0 ? 'done' : 'todo',
        detail: openExpiredRounds === 0
          ? 'No registration or active rounds are past their end time.'
          : `${openExpiredRounds} open round${openExpiredRounds === 1 ? '' : 's'} still need closing.`,
        action: openExpiredRounds === 0 ? null : 'Run the round close job or load current round status to close expired rounds.',
        href: '/game/status',
      }),
      item({
        key: 'single-active-round',
        label: 'Only one active season',
        status: activeRoundCount <= 1 ? 'done' : 'warning',
        detail: `${activeRoundCount} active round${activeRoundCount === 1 ? '' : 's'} currently open.`,
        action: activeRoundCount <= 1 ? null : 'Close superseded active rounds before promoting the next season.',
        href: '/game/status',
      }),
      item({
        key: 'final-ranks-frozen',
        label: 'Final ranks frozen',
        status: !latestEnded ? 'warning' : latestEndedUnranked === 0 ? 'done' : 'todo',
        detail: !latestEnded
          ? 'No ended season exists yet.'
          : latestEndedUnranked === 0
            ? `${latestEndedPlayers} player${latestEndedPlayers === 1 ? '' : 's'} have final local and national ranks.`
            : `${latestEndedUnranked} player${latestEndedUnranked === 1 ? '' : 's'} are missing final ranks.`,
        action: latestEnded && latestEndedUnranked > 0 ? 'Re-run season close to freeze final standings.' : null,
        href: latestEnded ? '/game/hall-of-fame' : null,
      }),
      item({
        key: 'hall-of-fame-ready',
        label: 'Season archive ready',
        status: !latestEnded ? 'warning' : latestEndedPlayers === 0 || latestEndedPodium > 0 ? 'done' : 'todo',
        detail: !latestEnded
          ? 'No ended season exists yet.'
          : latestEndedPlayers === 0
            ? `${latestEnded.name} ended with no active players.`
            : `${latestEndedPodium} podium entr${latestEndedPodium === 1 ? 'y' : 'ies'} visible for ${latestEnded.name}.`,
        action: latestEnded && latestEndedPlayers > 0 && latestEndedPodium === 0 ? 'Check final rankings before announcing results.' : null,
        href: '/game/hall-of-fame',
      }),
      item({
        key: 'round-end-post',
        label: 'Round-end post claimed',
        status: !latestEnded ? 'warning' : latestEnded.discordEndedAt ? 'done' : 'todo',
        detail: !latestEnded
          ? 'No ended season exists yet.'
          : latestEnded.discordEndedAt
            ? `Discord round-end post claimed ${latestEnded.discordEndedAt.toISOString()}.`
            : `${latestEnded.name} has not been claimed for the Discord round-end feed.`,
        action: latestEnded && !latestEnded.discordEndedAt ? 'Run the Discord claim job so the round-end feed posts once.' : null,
        href: null,
      }),
      item({
        key: 'news-post',
        label: 'Season news posted',
        status: !latestEnded ? 'warning' : latestEndedNews > 0 ? 'done' : 'todo',
        detail: !latestEnded
          ? 'No ended season exists yet.'
          : latestEndedNews > 0
            ? `${latestEndedNews} published news post${latestEndedNews === 1 ? '' : 's'} attached to ${latestEnded.name}.`
            : `No published news post is attached to ${latestEnded.name}.`,
        action: latestEndedNews > 0 ? null : 'Post a season wrap-up or patch note for the archive/news page.',
        href: '/game/news',
      }),
      item({
        key: 'next-round-ready',
        label: 'Next round handoff ready',
        status: nextRoundDto ? 'done' : 'todo',
        detail: nextRoundDto
          ? `${nextRoundDto.name} is ${nextRoundDto.status.toLowerCase()} with ${nextRoundDto.playerCount} player${nextRoundDto.playerCount === 1 ? '' : 's'}.`
          : 'No scheduled, registration, or active next round found.',
        action: nextRoundDto ? null : 'Create or schedule the next fair season.',
        href: nextRoundDto ? '/join' : null,
      }),
    ];

    return {
      now: now.toISOString(),
      currentRound: currentDto,
      latestEndedRound: latestEndedDto,
      nextRound: nextRoundDto,
      openExpiredRounds,
      activeRoundCount,
      items,
    };
  });
};

export default roundRoutes;
