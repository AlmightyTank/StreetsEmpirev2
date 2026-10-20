import type { FastifyPluginAsync } from 'fastify';
import { RivalryService } from '../services/rivalry.service.js';
import { RivalryFeudService } from '../services/rivalry-feud.service.js';
import { RivalrySettlementService } from '../services/rivalry-settlement.service.js';

const rivalryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:roundId/rivalries/:relationshipId/awards/:awardKey/claim', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId, relationshipId, awardKey } = request.params as { roundId: string; relationshipId: string; awardKey: string };
    const player = await fastify.prisma.roundPlayer.findFirst({ where: { roundId, accountId: request.auth!.account.id }, select: { id: true } });
    if (!player) return reply.code(404).send({ error: 'Not found' });
    return RivalryService.claimFairPlayAward(fastify.prisma, player.id, relationshipId, awardKey);
  });

  fastify.get('/:roundId/rivalries', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId } = request.params as { roundId: string };
    const player = await fastify.prisma.roundPlayer.findFirst({ where: { roundId, accountId: request.auth!.account.id }, select: { id: true } });
    if (!player) return reply.code(404).send({ error: 'Not found' });
    return RivalryService.listForPlayer(fastify.prisma, roundId, player.id);
  });

  fastify.post('/:roundId/rivalries/:relationshipId/feuds', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId, relationshipId } = request.params as { roundId: string; relationshipId: string };
    const player = await fastify.prisma.roundPlayer.findFirst({ where: { roundId, accountId: request.auth!.account.id }, select: { id: true } });
    if (!player) return reply.code(404).send({ error: 'Not found' });
    const contract = await RivalryFeudService.propose(fastify.prisma, player.id, { ...(request.body as object), relationshipId });
    return reply.code(201).send(contract);
  });

  fastify.post('/:roundId/rivalries/:relationshipId/feuds/:contractId/accept', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId, relationshipId, contractId } = request.params as { roundId: string; relationshipId: string; contractId: string };
    const player = await fastify.prisma.roundPlayer.findFirst({ where: { roundId, accountId: request.auth!.account.id }, select: { id: true } });
    if (!player) return reply.code(404).send({ error: 'Not found' });
    const contract = await RivalryFeudService.accept(fastify.prisma, player.id, { ...(request.body as object), relationshipId, contractId });
    return contract;
  });

  fastify.post('/:roundId/rivalries/:relationshipId/settle', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId, relationshipId } = request.params as { roundId: string; relationshipId: string };
    const player = await fastify.prisma.roundPlayer.findFirst({ where: { roundId, accountId: request.auth!.account.id }, select: { id: true } });
    if (!player) return reply.code(404).send({ error: 'Not found' });
    return RivalrySettlementService.settle(fastify.prisma, player.id, { ...(request.body as object), relationshipId });
  });

  fastify.post('/:roundId/rivalries/:relationshipId/feuds/:contractId/decline', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId, contractId } = request.params as { roundId: string; contractId: string };
    const player = await fastify.prisma.roundPlayer.findFirst({ where: { roundId, accountId: request.auth!.account.id }, select: { id: true } });
    if (!player) return reply.code(404).send({ error: 'Not found' });
    return RivalrySettlementService.decline(fastify.prisma, player.id, contractId);
  });

  fastify.get('/:roundId/rivalries/:relationshipId/public', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId, relationshipId } = request.params as { roundId: string; relationshipId: string };
    const history = await RivalryService.publicHistory(fastify.prisma, roundId, relationshipId);
    if (!history) return reply.code(404).send({ error: 'Not found' });
    return history;
  });

  fastify.get('/:roundId/rivalries/:relationshipId/public/cards', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId, relationshipId } = request.params as { roundId: string; relationshipId: string };
    const relationship = await fastify.prisma.rivalryRelationship.findFirst({ where: { id: relationshipId, roundId, suppressedAt: null }, select: { id: true } });
    if (!relationship) return reply.code(404).send({ error: 'Not found' });
    return RivalryService.publicCards(fastify.prisma, roundId, relationshipId);
  });

  fastify.get('/:roundId/rivalries/:relationshipId', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { roundId, relationshipId } = request.params as { roundId: string; relationshipId: string };
    const player = await fastify.prisma.roundPlayer.findFirst({
      where: { roundId, accountId: request.auth!.account.id },
      select: { id: true },
    });
    if (!player) return reply.code(404).send({ error: 'Not found' });
    const history = await RivalryService.history(fastify.prisma, player.id, relationshipId);
    if (!history || history.roundId !== roundId) return reply.code(404).send({ error: 'Not found' });
    return history;
  });
};

export default rivalryRoutes;
