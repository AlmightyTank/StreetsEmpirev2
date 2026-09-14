import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { botTokenMatches, DiscordBotService } from '../services/discord-bot.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const snowflake = z.string().regex(/^[0-9]{17,20}$/);
const citySlug = z.string().regex(/^[a-z0-9-]{1,60}$/);
const rolesSchema = z.object({ discordIds: z.array(snowflake).min(1).max(1000) }).strict();
const profileQuery = z.union([
  z.object({ discordId: snowflake }).strict(),
  z.object({ name: z.string().trim().min(1).max(40) }).strict(),
]);

/** Server-to-server API for apps/discord-bot. Not for browsers: no cookies, no CORS use. */
const discordBotRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    // Hidden entirely until the bot is configured.
    if (!env.discordBot.enabled) throw AppError.notFound('NOT_FOUND', 'Not found.');
    if (!botTokenMatches(request.headers.authorization, env.discordBot.apiToken)) {
      throw AppError.unauthenticated('A valid bot token is required.');
    }
  });

  fastify.post('/roles', async (request) => {
    const { discordIds } = parseBody(rolesSchema, request.body);
    return { members: await DiscordBotService.rolesFor(fastify.prisma, discordIds) };
  });

  fastify.get('/profile', async (request) => ({
    player: await DiscordBotService.profileCard(fastify.prisma, parseBody(profileQuery, request.query)),
  }));

  fastify.get('/rankings', async () => DiscordBotService.rankings(fastify.prisma));

  fastify.get('/cities', async () => ({ cities: await DiscordBotService.cities(fastify.prisma) }));

  fastify.get('/city-rankings', async (request) => {
    const { city } = parseBody(z.object({ city: citySlug }).strict(), request.query);
    return DiscordBotService.cityRankings(fastify.prisma, city);
  });

  fastify.get('/hall-of-fame', async () => DiscordBotService.hallOfFame(fastify.prisma));

  fastify.get('/member', async (request) => {
    const { discordId } = parseBody(z.object({ discordId: snowflake }).strict(), request.query);
    return DiscordBotService.member(fastify.prisma, discordId);
  });
};

export default discordBotRoutes;
