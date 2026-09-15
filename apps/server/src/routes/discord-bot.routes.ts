import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { botTokenMatches, DiscordBotService } from '../services/discord-bot.service.js';
import { claimResyncRequests } from '../services/discord-resync.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const snowflake = z.string().regex(/^[0-9]{17,20}$/);
const citySlug = z.string().regex(/^[a-z0-9-]{1,60}$/);
const rolesSchema = z.object({ discordIds: z.array(snowflake).min(1).max(1000) }).strict();
const playerQuery = z.union([
  z.object({ discordId: snowflake }).strict(),
  z.object({ name: z.string().trim().min(1).max(40) }).strict(),
]);
const memberQuery = z.object({ discordId: snowflake }).strict();
const leaderboardQuery = z.object({ stat: z.enum(['raids', 'defenses', 'drive-bys', 'recon', 'rides', 'lures']) }).strict();
const alertSchema = z.object({ discordId: snowflake, type: z.enum(['attacks', 'round', 'rank', 'turns']), enabled: z.boolean() }).strict();
const newsSchema = z.object({
  discordId: snowflake,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  pinned: z.boolean(),
  scope: z.enum(['round', 'global']),
}).strict();

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
    player: await DiscordBotService.profileCard(fastify.prisma, parseBody(playerQuery, request.query)),
  }));

  fastify.get('/badges', async (request) => ({
    player: await DiscordBotService.badges(fastify.prisma, parseBody(playerQuery, request.query)),
  }));

  fastify.get('/history', async (request) => DiscordBotService.history(fastify.prisma, parseBody(playerQuery, request.query)));

  fastify.get('/rankings', async () => DiscordBotService.rankings(fastify.prisma));

  fastify.get('/leaderboard', async (request) => {
    const { stat } = parseBody(leaderboardQuery, request.query);
    return DiscordBotService.leaderboard(fastify.prisma, stat);
  });

  fastify.get('/cities', async () => ({ cities: await DiscordBotService.cities(fastify.prisma) }));

  fastify.get('/city-rankings', async (request) => {
    const { city } = parseBody(z.object({ city: citySlug }).strict(), request.query);
    return DiscordBotService.cityRankings(fastify.prisma, city);
  });

  fastify.get('/hall-of-fame', async () => DiscordBotService.hallOfFame(fastify.prisma));

  fastify.get('/member', async (request) => {
    const { discordId } = parseBody(memberQuery, request.query);
    return DiscordBotService.member(fastify.prisma, discordId);
  });

  fastify.get('/stats', async (request) => {
    const { discordId } = parseBody(memberQuery, request.query);
    return DiscordBotService.stats(fastify.prisma, discordId);
  });

  fastify.post('/news', async (request) => DiscordBotService.createNews(fastify.prisma, parseBody(newsSchema, request.body)));

  fastify.post('/news/claim', async () => ({ news: await DiscordBotService.claimNews(fastify.prisma) }));

  fastify.get('/alerts', async (request) => {
    const { discordId } = parseBody(memberQuery, request.query);
    return DiscordBotService.alertSettings(fastify.prisma, discordId);
  });

  fastify.put('/alerts', async (request) => {
    const { discordId, type, enabled } = parseBody(alertSchema, request.body);
    return DiscordBotService.setAlert(fastify.prisma, discordId, type, enabled);
  });

  fastify.post('/alerts/claim', async () => DiscordBotService.claimAlerts(fastify.prisma));

  /** 0.3.0-B: role resyncs an admin asked for from the panel, each handed out once. */
  fastify.post('/resync/claim', async () => claimResyncRequests(fastify.prisma));
};

export default discordBotRoutes;
