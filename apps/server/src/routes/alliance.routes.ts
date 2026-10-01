import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allianceForumPostSchema, allianceInviteAnswerSchema, alliancePlayerSchema, allianceSettingsSchema, allianceTagSchema, createAllianceSchema } from '@streets/shared';
import { AllianceService } from '../services/alliance.service.js';
import { wakeDiscordBot } from '../services/discord-bot-push.service.js';
import { RoundService } from '../services/round.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

/** 0.3.0-C alliances. Membership changes lock the alliance, then its players, and re-check the cap. */
const allianceRoutes: FastifyPluginAsync = async (app) => {
  async function me(accountId: string) {
    const round = await RoundService.requireCurrent(app.prisma);
    const player = await app.prisma.roundPlayer.findUnique({ where: { roundId_accountId: { roundId: round.id, accountId } }, include: { round: true } });
    if (!player) throw AppError.notFound('NOT_IN_ROUND', `You have not entered ${round.name} yet.`);
    return player;
  }

  app.get('/alliance', { preHandler: app.requireAuth }, async (request) => {
    const player = await me(request.auth!.account.id);
    return AllianceService.mine(app.prisma, player.id);
  });

  app.get('/alliances', { preHandler: app.requireAuth }, async (request) => {
    const player = await me(request.auth!.account.id);
    return AllianceService.rankings(app.prisma, player, 50);
  });

  app.get('/alliances/:tag', { preHandler: app.requireAuth }, async (request) => {
    const { tag } = parseBody(z.object({ tag: allianceTagSchema }).strict(), request.params);
    const player = await me(request.auth!.account.id);
    return { alliance: await AllianceService.publicDetail(app.prisma, player, tag) };
  });

  const post = (path: string, action: (playerId: string, body: unknown) => Promise<unknown>) => {
    app.post(path, { preHandler: app.requireAuth }, async (request) => {
      const player = await me(request.auth!.account.id);
      const result = await action(player.id, request.body ?? {});
      wakeDiscordBot('resync');
      return result;
    });
  };

  post('/alliance/create', (id, body) => AllianceService.create(app.prisma, id, parseBody(createAllianceSchema, body)));
  post('/alliance/invite', (id, body) => AllianceService.invite(app.prisma, id, parseBody(alliancePlayerSchema, body)));
  post('/alliance/revoke', (id, body) => AllianceService.revokeInvite(app.prisma, id, parseBody(alliancePlayerSchema, body)));
  post('/alliance/accept', (id, body) => AllianceService.accept(app.prisma, id, parseBody(allianceInviteAnswerSchema, body)));
  post('/alliance/decline', (id, body) => AllianceService.decline(app.prisma, id, parseBody(allianceInviteAnswerSchema, body)));
  post('/alliance/kick', (id, body) => AllianceService.kick(app.prisma, id, parseBody(alliancePlayerSchema, body)));
  post('/alliance/transfer', (id, body) => AllianceService.transferLeadership(app.prisma, id, parseBody(alliancePlayerSchema, body)));
  post('/alliance/settings', (id, body) => AllianceService.updateSettings(app.prisma, id, parseBody(allianceSettingsSchema, body)));
  post('/alliance/forum-thread', (id, body) => AllianceService.postForumThread(app.prisma, id, parseBody(allianceForumPostSchema, body)));
  post('/alliance/leave', (id, body) => {
    parseBody(z.object({}).strict(), body);
    return AllianceService.leave(app.prisma, id);
  });
};

export default allianceRoutes;
