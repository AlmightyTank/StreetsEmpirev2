import type { FastifyPluginAsync } from 'fastify';
import { ADMIN_GRANT_CAPS, ADMIN_SUSPENSION_LENGTHS, usernameSchema, type AdminSuspensionLength } from '@streets/shared';
import { z } from 'zod';
import { AdminAccountService } from '../services/admin-account.service.js';
import { AdminAuditService } from '../services/admin-audit.service.js';
import { AllianceBalanceService } from '../services/alliance-balance.service.js';
import { AllianceService } from '../services/alliance.service.js';
import { WireService } from '../services/wire.service.js';
import { AdminBattleService } from '../services/admin-battle.service.js';
import { AdminDevBotsService } from '../services/admin-dev-bots.service.js';
import { AdminDiscordService } from '../services/admin-discord.service.js';
import { AdminGrantService } from '../services/admin-grant.service.js';
import { AdminHealthService } from '../services/admin-health.service.js';
import { AdminNewsService } from '../services/admin-news.service.js';
import { AdminPlayerService } from '../services/admin-player.service.js';
import { AdminRoundService } from '../services/admin-round.service.js';
import { AdminRulesetService } from '../services/admin-ruleset.service.js';
import { AdminSignalsService } from '../services/admin-signals.service.js';
import { SiteBannerService } from '../services/site-banner.service.js';
import { parseBody } from '../utils/validate.js';

const isoDate = z.coerce.date();
const id = z.string().min(1).max(64);
const reason = z.string().trim().min(5, 'Give a reason of at least 5 characters.').max(500);
const grantAmount = (cap: number) => z.number().int().min(0).max(cap, `At most ${cap} per grant.`).optional();

const scheduleRoundSchema = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes.').optional(),
  rulesetId: z.string().trim().min(1).max(64),
  startsAt: isoDate,
  endsAt: isoDate.optional(),
  registrationOpensAt: isoDate.nullable().optional(),
}).strict();

const updateRoundSchema = z.object({
  reason,
  name: z.string().trim().min(3).max(80).optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
  registrationOpensAt: isoDate.nullable().optional(),
}).strict();

const roundParams = z.object({ roundId: id }).strict();
const accountParams = z.object({ accountId: id }).strict();
const playerParams = z.object({ roundPlayerId: id }).strict();
const battleParams = z.object({ battleId: id }).strict();
const allianceParams = z.object({ allianceId: id }).strict();
const wirePostParams = z.object({ postId: id }).strict();
const renameAllianceSchema = z.object({ reason, name: z.string().optional(), tag: z.string().optional() }).strict();
const newsParams = z.object({ newsId: id }).strict();
const bannerParams = z.object({ bannerId: id }).strict();
const rulesetParams = z.object({ rulesetId: id }).strict();
const emptyBody = z.object({}).strict();
const reasonBody = z.object({ reason }).strict();
const startRoundSchema = z.object({ confirmHandoff: z.boolean().optional() }).strict();
const revokeSessionsSchema = z.object({ reason, sessionId: id.optional() }).strict();
const renameSchema = z.object({ reason, username: usernameSchema }).strict();
const adminRoleSchema = z.object({ reason, isAdmin: z.boolean() }).strict();
const resyncSchema = z.object({ accountId: id.optional(), reason: reason.optional() }).strict();
const rulesetQuery = z.object({ compare: id.optional() }).strict();

const grantSchema = z.object({
  reason,
  turns: z.number().int().min(0).max(10_000).optional(),
  cashCents: grantAmount(ADMIN_GRANT_CAPS.cashCents),
  whores: grantAmount(ADMIN_GRANT_CAPS.whores),
  thugs: grantAmount(ADMIN_GRANT_CAPS.thugs),
  condoms: grantAmount(ADMIN_GRANT_CAPS.condoms),
  medicine: grantAmount(ADMIN_GRANT_CAPS.medicine),
  crack: grantAmount(ADMIN_GRANT_CAPS.crack),
  beer: grantAmount(ADMIN_GRANT_CAPS.beer),
  pistols: grantAmount(ADMIN_GRANT_CAPS.pistols),
  shotguns: grantAmount(ADMIN_GRANT_CAPS.shotguns),
  tek9s: grantAmount(ADMIN_GRANT_CAPS.tek9s),
  ak47s: grantAmount(ADMIN_GRANT_CAPS.ak47s),
  lowRiders: grantAmount(ADMIN_GRANT_CAPS.lowRiders),
}).strict();

const createNewsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  pinned: z.boolean(),
  roundId: id.nullable(),
  publishedAt: isoDate.optional(),
  mirrorToForum: z.boolean(),
}).strict();

const updateNewsSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  pinned: z.boolean().optional(),
}).strict();

const createBannerSchema = z.object({
  message: z.string().trim().min(3).max(280),
  tone: z.enum(['info', 'warning', 'critical']),
  startsAt: isoDate.optional(),
  endsAt: isoDate,
}).strict();

const accountSearchQuery = z.object({
  query: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'active', 'inactive', 'admin', 'suspended']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

const playerSearchQuery = z.object({
  query: z.string().trim().min(1, 'Type a pimp name or public id.').max(80),
  roundId: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

const suspendSchema = z.object({
  reason,
  length: z.enum(ADMIN_SUSPENSION_LENGTHS.map((option) => option.key) as [string, ...string[]]),
}).strict();

const battlesQuery = z.object({ before: id.optional() }).strict();

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  actor: z.string().trim().min(1).max(40).optional(),
  action: z.string().trim().min(1).max(60).optional(),
  targetType: z.string().trim().min(1).max(40).optional(),
  targetId: z.string().trim().min(1).max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  before: id.optional(),
}).strict();

const auditExportQuery = auditQuery.omit({ before: true }).strict();

/**
 * 0.3.0-B admin API. The admin guard is a hook on this whole plugin, so a
 * route added here cannot forget it. Every change writes an audit record.
 */
const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireAdmin);

  // Rounds

  fastify.get('/rounds', async () => AdminRoundService.list(fastify.prisma));

  fastify.post('/rounds', async (request, reply) => {
    const input = parseBody(scheduleRoundSchema, request.body);
    const round = await AdminRoundService.schedule(fastify.prisma, request.auth!.account, input);
    return reply.status(201).send({ round });
  });

  fastify.post('/rounds/close-expired', async (request) => {
    parseBody(emptyBody, request.body ?? {});
    return { closed: await AdminRoundService.closeExpiredNow(fastify.prisma, request.auth!.account) };
  });

  fastify.get('/rounds/:roundId/health', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminHealthService.roundHealth(fastify.prisma, roundId);
  });

  fastify.post('/rounds/:roundId/update', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const input = parseBody(updateRoundSchema, request.body ?? {});
    return { round: await AdminRoundService.update(fastify.prisma, request.auth!.account, roundId, input) };
  });

  fastify.post('/rounds/:roundId/open-registration', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return { round: await AdminRoundService.openRegistration(fastify.prisma, request.auth!.account, roundId) };
  });

  fastify.post('/rounds/:roundId/start', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const { confirmHandoff } = parseBody(startRoundSchema, request.body ?? {});
    return { round: await AdminRoundService.start(fastify.prisma, request.auth!.account, roundId, { confirmHandoff: confirmHandoff ?? false }) };
  });

  fastify.post('/rounds/:roundId/end-early', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return { round: await AdminRoundService.endEarly(fastify.prisma, request.auth!.account, roundId, body.reason) };
  });

  fastify.post('/rounds/:roundId/archive', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return { round: await AdminRoundService.archive(fastify.prisma, request.auth!.account, roundId) };
  });

  // Alliances (0.3.0-C)

  fastify.get('/rounds/:roundId/alliance-balance', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AllianceBalanceService.report(fastify.prisma, roundId);
  });

  fastify.get('/rounds/:roundId/alliances', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AllianceService.adminList(fastify.prisma, roundId);
  });

  fastify.post('/alliances/:allianceId/rename', async (request) => {
    const { allianceId } = parseBody(allianceParams, request.params);
    const input = parseBody(renameAllianceSchema, request.body ?? {});
    await AllianceService.adminRename(fastify.prisma, request.auth!.account, allianceId, input);
    return { ok: true };
  });

  fastify.get('/alliances/:allianceId/wire', async (request) => {
    const { allianceId } = parseBody(allianceParams, request.params);
    return WireService.adminList(fastify.prisma, allianceId);
  });

  fastify.post('/wire/:postId/remove', async (request) => {
    const { postId } = parseBody(wirePostParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    await WireService.adminRemove(fastify.prisma, request.auth!.account, postId, body.reason);
    return { ok: true };
  });

  fastify.post('/alliances/:allianceId/disband', async (request) => {
    const { allianceId } = parseBody(allianceParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    await AllianceService.adminDisband(fastify.prisma, request.auth!.account, allianceId, body.reason);
    return { ok: true };
  });

  // News and the site banner

  fastify.get('/news', async () => AdminNewsService.list(fastify.prisma));

  fastify.post('/news', async (request, reply) => {
    const input = parseBody(createNewsSchema, request.body ?? {});
    return reply.status(201).send(await AdminNewsService.create(fastify.prisma, request.auth!.account, input));
  });

  fastify.post('/news/:newsId/update', async (request) => {
    const { newsId } = parseBody(newsParams, request.params);
    const input = parseBody(updateNewsSchema, request.body ?? {});
    return AdminNewsService.update(fastify.prisma, request.auth!.account, newsId, input);
  });

  fastify.post('/news/:newsId/delete', async (request) => {
    const { newsId } = parseBody(newsParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminNewsService.remove(fastify.prisma, request.auth!.account, newsId, body.reason);
  });

  fastify.post('/news/:newsId/mirror', async (request) => {
    const { newsId } = parseBody(newsParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return AdminNewsService.retryMirror(fastify.prisma, request.auth!.account, newsId);
  });

  fastify.get('/banners', async () => SiteBannerService.adminList(fastify.prisma));

  fastify.post('/banners', async (request, reply) => {
    const input = parseBody(createBannerSchema, request.body ?? {});
    return reply.status(201).send(await SiteBannerService.create(fastify.prisma, request.auth!.account, input));
  });

  fastify.post('/banners/:bannerId/end', async (request) => {
    const { bannerId } = parseBody(bannerParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return SiteBannerService.end(fastify.prisma, request.auth!.account, bannerId);
  });

  // Integrations

  fastify.get('/discord', async () => AdminDiscordService.status(fastify.prisma));

  fastify.post('/discord/resync', async (request) => {
    const body = parseBody(resyncSchema, request.body ?? {});
    return AdminDiscordService.requestResync(fastify.prisma, request.auth!.account, body.accountId, body.reason);
  });

  fastify.get('/rulesets/:rulesetId', async (request) => {
    const { rulesetId } = parseBody(rulesetParams, request.params);
    const { compare } = parseBody(rulesetQuery, request.query);
    return AdminRulesetService.view(rulesetId, compare);
  });

  fastify.get('/dev-bots', async () => AdminDevBotsService.status(fastify.prisma));

  fastify.post('/dev-bots/seed', async (request) => {
    parseBody(emptyBody, request.body ?? {});
    return AdminDevBotsService.seed(fastify.prisma, request.auth!.account);
  });

  fastify.post('/dev-bots/remove', async (request) => {
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminDevBotsService.remove(fastify.prisma, request.auth!.account, body.reason);
  });

  // Accounts

  fastify.get('/accounts', async (request) => AdminAccountService.search(fastify.prisma, parseBody(accountSearchQuery, request.query)));

  fastify.get('/accounts/:accountId', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    return AdminAccountService.detail(fastify.prisma, accountId);
  });

  fastify.post('/accounts/:accountId/deactivate', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.setActive(fastify.prisma, request.auth!.account, accountId, false, body.reason);
  });

  fastify.post('/accounts/:accountId/reactivate', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.setActive(fastify.prisma, request.auth!.account, accountId, true, body.reason);
  });

  fastify.post('/accounts/:accountId/suspend', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(suspendSchema, request.body ?? {});
    return AdminAccountService.suspend(fastify.prisma, request.auth!.account, accountId, body.length as AdminSuspensionLength, body.reason);
  });

  fastify.post('/accounts/:accountId/suspend/lift', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.liftSuspension(fastify.prisma, request.auth!.account, accountId, body.reason);
  });

  fastify.post('/accounts/:accountId/sessions/revoke', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(revokeSessionsSchema, request.body ?? {});
    return AdminAccountService.revokeSessions(fastify.prisma, request.auth!.account, accountId, body.reason, body.sessionId);
  });

  fastify.post('/accounts/:accountId/rename', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(renameSchema, request.body ?? {});
    return AdminAccountService.rename(fastify.prisma, request.auth!.account, accountId, body.username, body.reason);
  });

  fastify.post('/accounts/:accountId/reset-profile', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.resetProfile(fastify.prisma, request.auth!.account, accountId, body.reason);
  });

  fastify.post('/accounts/:accountId/admin', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(adminRoleSchema, request.body ?? {});
    return AdminAccountService.setAdmin(fastify.prisma, request.auth!.account, accountId, body.isAdmin, body.reason);
  });

  fastify.post('/accounts/:accountId/email/resend', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.resendVerification(fastify.prisma, request.auth!.account, accountId, body.reason, fastify.log);
  });

  fastify.post('/accounts/:accountId/email/verify', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.markEmailVerified(fastify.prisma, request.auth!.account, accountId, body.reason);
  });

  fastify.post('/accounts/:accountId/forum/unlink', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.unlinkForum(fastify.prisma, request.auth!.account, accountId, body.reason);
  });

  // Player inspector and corrections

  fastify.get('/players', async (request) => AdminPlayerService.search(fastify.prisma, parseBody(playerSearchQuery, request.query)));

  fastify.get('/players/:roundPlayerId', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    return AdminPlayerService.inspect(fastify.prisma, roundPlayerId);
  });

  fastify.get('/players/:roundPlayerId/battles', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const { before } = parseBody(battlesQuery, request.query);
    return AdminPlayerService.battles(fastify.prisma, roundPlayerId, before);
  });

  fastify.post('/players/:roundPlayerId/grant', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const input = parseBody(grantSchema, request.body ?? {});
    return AdminGrantService.grant(fastify.prisma, request.auth!.account, roundPlayerId, input);
  });

  fastify.post('/battles/:battleId/void', async (request) => {
    const { battleId } = parseBody(battleParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminBattleService.voidBattle(fastify.prisma, request.auth!.account, battleId, body.reason);
  });

  fastify.get('/signals', async () => AdminSignalsService.clusters(fastify.prisma));

  // Audit

  fastify.get('/audit', async (request) => AdminAuditService.list(fastify.prisma, parseBody(auditQuery, request.query)));

  fastify.get('/audit/retention', async () => AdminAuditService.retention(fastify.prisma));

  /** The rows on screen as a spreadsheet, downloaded rather than rendered. */
  fastify.get('/audit/export', async (request, reply) => {
    const filters = parseBody(auditExportQuery, request.query);
    const { csv, rows, truncated } = await AdminAuditService.exportCsv(fastify.prisma, filters);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="streetsempire-audit-${stamp}.csv"`)
      .header('x-audit-rows', String(rows))
      .header('x-audit-truncated', String(truncated))
      .send(csv);
  });

  fastify.post('/audit/purge', async (request) => {
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAuditService.purge(fastify.prisma, request.auth!.account, body.reason);
  });
};

export default adminRoutes;
