import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BUG_REPORT_REPLY_MAX, BUG_REPORT_RESOLUTIONS, bugReportSchema } from '@streets/shared';
import { env } from '../config/env.js';
import { botTokenMatches, DiscordBotService } from '../services/discord-bot.service.js';
import { claimResyncRequests } from '../services/discord-resync.service.js';
import { AdminModerationService } from '../services/admin-moderation.service.js';
import { DiscordStaffService, staffMessageReport } from '../services/discord-staff.service.js';
import { BugReportService } from '../services/support.service.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

const snowflake = z.string().regex(/^[0-9]{17,20}$/);
const citySlug = z.string().regex(/^[a-z0-9-]{1,60}$/);
const rolesSchema = z.object({ discordIds: z.array(snowflake).min(1).max(1000) }).strict();
const playerQuery = z.union([
  z.object({ discordId: snowflake }).strict(),
  z.object({ name: z.string().trim().min(1).max(40) }).strict(),
]);
const allianceQuery = z.union([
  z.object({ discordId: snowflake }).strict(),
  z.object({ tag: z.string().trim().regex(/^[A-Za-z0-9]{2,5}$/) }).strict(),
]);
const memberQuery = z.object({ discordId: snowflake }).strict();
const leaderboardQuery = z.object({ stat: z.enum(['raids', 'defenses', 'drive-bys', 'recon', 'rides', 'lures']) }).strict();
const alertSchema = z.object({ discordId: snowflake, type: z.enum(['attacks', 'round', 'rank', 'turns', 'turf', 'alliance']), enabled: z.boolean() }).strict();
const newsSchema = z.object({
  discordId: snowflake,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  pinned: z.boolean(),
  scope: z.enum(['round', 'global']),
}).strict();

const newsParams = z.object({ newsId: z.string().min(1).max(64) }).strict();
const bugReportFromDiscordSchema = z.object({
  discordId: snowflake,
  report: bugReportSchema.omit({ pagePath: true }),
}).strict();
const bugReportParams = z.object({ reportId: z.string().min(1).max(64) }).strict();
const resolveFromDiscordSchema = z.object({
  discordId: snowflake,
  resolution: z.enum(BUG_REPORT_RESOLUTIONS),
  note: z.string().trim().min(5, 'Write a staff note of at least 5 characters.').max(500),
  playerReply: z.string().trim().max(BUG_REPORT_REPLY_MAX).optional(),
}).strict();
const messageReportParams = z.object({ reportId: z.string().min(1).max(64) }).strict();
const messageReportActionSchema = z.object({
  discordId: snowflake,
  action: z.enum(['mute-1d', 'dismiss']),
  note: z.string().trim().min(5, 'Write a note of at least 5 characters.').max(500),
}).strict();
const staffPostParams = z.object({ postId: z.string().min(1).max(64) }).strict();
const staffPostedSchema = z.object({ messageId: snowflake }).strict();
const newsFailedSchema = z.object({ error: z.string().trim().min(1).max(500) }).strict();
const alertsClaimSchema = z.object({ feed: z.boolean().optional() }).strict();
const newsStatusSchema = z.object({
  channel: z.string().trim().min(1).max(100).nullable(),
  problem: z.string().trim().min(1).max(500).nullable(),
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

  /** 0.3.0-C: live alliances in the current round, so the bot keeps one role per alliance. */
  fastify.get('/alliances', async () => ({ alliances: await DiscordBotService.alliances(fastify.prisma) }));

  fastify.get('/profile', async (request) => ({
    player: await DiscordBotService.profileCard(fastify.prisma, parseBody(playerQuery, request.query)),
  }));

  fastify.get('/badges', async (request) => ({
    player: await DiscordBotService.badges(fastify.prisma, parseBody(playerQuery, request.query)),
  }));

  fastify.get('/turf', async (request) => {
    const { city } = parseBody(z.object({ city: citySlug }).strict(), request.query);
    return DiscordBotService.turfCity(fastify.prisma, city);
  });

  fastify.get('/alliance', async (request) =>
    DiscordBotService.allianceCard(fastify.prisma, parseBody(allianceQuery, request.query)));

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

  /** /bug: a report from the member's linked account, with the game form's hourly limit. */
  fastify.post('/bug-reports', async (request, reply) => {
    const { discordId, report } = parseBody(bugReportFromDiscordSchema, request.body);
    return reply.status(201).send(await BugReportService.createFromDiscord(fastify.prisma, discordId, report));
  });

  /** A staff button: the member must be a linked game admin. */
  fastify.post('/bug-reports/:reportId/resolve', async (request) => {
    const { reportId } = parseBody(bugReportParams, request.params);
    const { discordId, ...input } = parseBody(resolveFromDiscordSchema, request.body);
    return { report: await BugReportService.resolveFromDiscord(fastify.prisma, discordId, reportId, input) };
  });

  /** A staff button on a message report: mute the sender for a day, or dismiss. Linked game admins only. */
  fastify.post('/message-reports/:reportId/act', async (request) => {
    const { reportId } = parseBody(messageReportParams, request.params);
    const { discordId, action, note } = parseBody(messageReportActionSchema, request.body);
    await AdminModerationService.actFromDiscord(fastify.prisma, discordId, reportId, action, note);
    return { report: await staffMessageReport(fastify.prisma, reportId) };
  });

  /** Staff channel posts, claimed once like news. */
  fastify.post('/staff-posts/claim', async () => ({ posts: await DiscordStaffService.claim(fastify.prisma) }));

  fastify.post('/staff-posts/:postId/posted', async (request) => {
    const { postId } = parseBody(staffPostParams, request.params);
    await DiscordStaffService.posted(fastify.prisma, postId, parseBody(staffPostedSchema, request.body).messageId);
    return { ok: true };
  });

  fastify.post('/staff-posts/:postId/failed', async (request) => {
    const { postId } = parseBody(staffPostParams, request.params);
    await DiscordStaffService.failed(fastify.prisma, postId, parseBody(newsFailedSchema, request.body ?? {}).error);
    return { ok: true };
  });

  fastify.post('/news/:newsId/failed', async (request) => {
    const { newsId } = parseBody(newsParams, request.params);
    const { error } = parseBody(newsFailedSchema, request.body ?? {});
    await DiscordBotService.newsFailed(fastify.prisma, newsId, error);
    return { ok: true };
  });

  fastify.post('/news/status', async (request) => {
    await DiscordBotService.reportNewsChannel(fastify.prisma, parseBody(newsStatusSchema, request.body ?? {}));
    return { ok: true };
  });

  fastify.get('/alerts', async (request) => {
    const { discordId } = parseBody(memberQuery, request.query);
    return DiscordBotService.alertSettings(fastify.prisma, discordId);
  });

  fastify.put('/alerts', async (request) => {
    const { discordId, type, enabled } = parseBody(alertSchema, request.body);
    return DiscordBotService.setAlert(fastify.prisma, discordId, type, enabled);
  });

  // Bots from before the raid-feed check send no body, and always had their feed claimed.
  fastify.post('/alerts/claim', async (request) =>
    DiscordBotService.claimAlerts(fastify.prisma, parseBody(alertsClaimSchema, request.body ?? {})));

  /** 0.3.0-B: role resyncs an admin asked for from the panel, each handed out once. */
  fastify.post('/resync/claim', async () => claimResyncRequests(fastify.prisma));
};

export default discordBotRoutes;
