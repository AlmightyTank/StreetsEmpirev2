import type { FastifyPluginAsync } from 'fastify';
import { BirthdayService } from '../services/birthday.service.js';

/**
 * Birthdays (docs/BIRTHDAYS.md). The signed-in account's own birthday only:
 * nothing here reveals anyone else's date, age or year.
 */
const birthdayRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request) =>
    BirthdayService.status(fastify.prisma, request.auth!.account.id));

  fastify.post('/claim', { preHandler: fastify.requireAuth }, async (request) =>
    BirthdayService.claim(fastify.prisma, request.auth!.account.id));
};

export default birthdayRoutes;
