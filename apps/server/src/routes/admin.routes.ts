import type { FastifyPluginAsync } from 'fastify';
import {
  ADMIN_COMMS_MUTE_LENGTHS,
  ADMIN_GRANT_CAPS,
  ADMIN_NOTE_MAX,
  ADMIN_PRODUCT_GRANT_CAP,
  ADMIN_SUSPENSION_LENGTHS,
  BUG_REPORT_RESOLUTIONS,
  adminSurveyCloseSchema,
  adminSurveyDefinitionSchema,
  adminSurveyResultsQuerySchema,
  usernameSchema,
  type AdminCommsMuteLength,
  type AdminSuspensionLength,
} from '@streets/shared';
import { z } from 'zod';
import { AdminAccountService } from '../services/admin-account.service.js';
import { AdminAuditService } from '../services/admin-audit.service.js';
import { AdminModerationService } from '../services/admin-moderation.service.js';
import { AllianceBalanceService } from '../services/alliance-balance.service.js';
import { AllianceService } from '../services/alliance.service.js';
import { WireService } from '../services/wire.service.js';
import { AdminBattleService } from '../services/admin-battle.service.js';
import { AdminConvoyService } from '../services/admin-convoy.service.js';
import { AdminDevBotsService } from '../services/admin-dev-bots.service.js';
import { AdminNpcGangService } from '../services/admin-npc-gang.service.js';
import { NpcGangTelemetryService } from '../services/npc-gang-telemetry.service.js';
import { AdminDiscordService } from '../services/admin-discord.service.js';
import { AdminGrantService } from '../services/admin-grant.service.js';
import { AdminHealthService } from '../services/admin-health.service.js';
import { AdminNewsService } from '../services/admin-news.service.js';
import { AdminPlayerService } from '../services/admin-player.service.js';
import { AdminQuestService } from '../services/admin-quest.service.js';
import { AdminRoundService } from '../services/admin-round.service.js';
import { AdminRulesetService } from '../services/admin-ruleset.service.js';
import { AdminSignalsService } from '../services/admin-signals.service.js';
import { AdminSurveyService } from '../services/admin-survey.service.js';
import { AdminSurveyResultsService } from '../services/admin-survey-results.service.js';
import { wakeDiscordBot } from '../services/discord-bot-push.service.js';
import { SiteBannerService } from '../services/site-banner.service.js';
import { AdminEconomyService } from '../services/admin-economy.service.js';
import { AdminSupplyService } from '../services/admin-supply.service.js';
import { AdminSupplyCorrectionService } from '../services/admin-supply-correction.service.js';
import { AdminLoansService } from '../services/admin-loans.service.js';
import { AdminLoanCorrectionService } from '../services/admin-loan-correction.service.js';
import { AdminCasinoService } from '../services/admin-casino.service.js';
import { AdminFactionService } from '../services/admin-faction.service.js';
import { ADMIN_VEHICLE_MAX, AdminVehicleService } from '../services/admin-vehicle.service.js';
import { AdminLawService } from '../services/admin-law.service.js';
import { AdminTurfService } from '../services/admin-turf.service.js';
import { BugReportService } from '../services/support.service.js';
import { ExploitFlagService } from '../services/exploit-flag.service.js';
import { MonitoringService } from '../services/monitoring.service.js';
import { parseBody } from '../utils/validate.js';

const isoDate = z.coerce.date();
const id = z.string().min(1).max(64);
const reason = z.string().trim().min(5, 'Give a reason of at least 5 characters.').max(500);
const grantAmount = (cap: number) => z.number().int().min(0).max(cap, `At most ${cap} per grant.`).optional();
const STREET_PASS_REWARD_AMOUNT_MAX = 2_147_483_647;

const scheduleRoundSchema = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes.').optional(),
  rulesetId: z.string().trim().min(1).max(64),
  startsAt: isoDate,
  endsAt: isoDate.optional(),
  registrationOpensAt: isoDate.nullable().optional(),
}).strict();

const streetPassRewardSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CASH'), amount: z.number().int().min(1).max(STREET_PASS_REWARD_AMOUNT_MAX) }).strict(),
  z.object({ kind: z.literal('TURNS'), amount: z.number().int().min(1).max(STREET_PASS_REWARD_AMOUNT_MAX) }).strict(),
  z.object({ kind: z.literal('ITEM'), key: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/), amount: z.number().int().min(1).max(STREET_PASS_REWARD_AMOUNT_MAX) }).strict(),
  z.object({ kind: z.literal('PRODUCT'), key: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/), amount: z.number().int().min(1).max(STREET_PASS_REWARD_AMOUNT_MAX) }).strict(),
  z.object({ kind: z.literal('FAVOR_ITEM'), key: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/), amount: z.number().int().min(1).max(STREET_PASS_REWARD_AMOUNT_MAX) }).strict(),
  z.object({ kind: z.literal('COSMETIC_UNLOCK'), key: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/) }).strict(),
]);
const updateStreetPassSchema = z.object({
  reason,
  tiers: z.array(z.object({
    tier: z.number().int().min(1).max(100),
    rewards: z.array(streetPassRewardSchema).min(1).max(8),
  }).strict()).min(1).max(100),
}).strict();

const updateRoundSchema = z.object({
  reason,
  name: z.string().trim().min(3).max(80).optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
  registrationOpensAt: isoDate.nullable().optional(),
}).strict();

const rulesetChangeQuery = z.object({ rulesetId: z.string().trim().min(1).max(64).optional() }).strict();
const changeRulesetSchema = z.object({
  reason,
  rulesetId: z.string().trim().min(1).max(64),
  confirm: z.boolean().optional(),
}).strict();

const roundParams = z.object({ roundId: id }).strict();
const accountParams = z.object({ accountId: id }).strict();
const playerParams = z.object({ roundPlayerId: id }).strict();
const battleParams = z.object({ battleId: id }).strict();
const tailParams = z.object({ tailId: id }).strict();
const allianceParams = z.object({ allianceId: id }).strict();
const wirePostParams = z.object({ postId: id }).strict();
const renameAllianceSchema = z.object({ reason, name: z.string().optional(), tag: z.string().optional() }).strict();
const newsParams = z.object({ newsId: id }).strict();
const bannerParams = z.object({ bannerId: id }).strict();
const surveyParams = z.object({ surveyId: id }).strict();
const rulesetParams = z.object({ rulesetId: id }).strict();
const emptyBody = z.object({}).strict();
// Phase O: NPC gang controls. Every action carries a reason for the audit log.
const npcGangParams = z.object({ roundPlayerId: id }).strict();
const npcTelemetryQuery = z.object({ window: z.enum(['24h', '7d', 'season']).default('7d') }).strict();
const devBotSlugParams = z.object({ slug: z.string().trim().regex(/^[a-z][a-z0-9-]{1,40}$/) }).strict();
const trait = z.number().int().min(0).max(100);
const npcGangControlBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ACT_NOW'), reason }).strict(),
  z.object({ action: z.literal('DELAY'), minutes: z.number().int().min(5).max(7 * 24 * 60), reason }).strict(),
  z.object({ action: z.literal('PAUSE'), hours: z.number().int().min(1).max(24 * 30).optional(), reason }).strict(),
  z.object({ action: z.literal('WAKE'), reason }).strict(),
  z.object({
    action: z.literal('TUNE'),
    aggression: trait.optional(),
    ambition: trait.optional(),
    discipline: trait.optional(),
    tier: z.string().trim().min(1).max(20).optional(),
    archetype: z.string().trim().min(1).max(60).optional(),
    reason,
  }).strict(),
  z.object({ action: z.literal('RESET'), scope: z.enum(['MOMENTUM', 'GRUDGES', 'MIGRATION']), reason }).strict(),
]);
const reasonBody = z.object({ reason }).strict();
// 1.0.0-E: resuming extends the season by the pause unless told not to.
const resumeRoundSchema = z.object({ extend: z.boolean().optional(), reason: reason.optional() }).strict();
// 0.9.0-H moderation.
const commsMuteSchema = z.object({
  length: z.enum(ADMIN_COMMS_MUTE_LENGTHS.map((option) => option.key) as [AdminCommsMuteLength, ...AdminCommsMuteLength[]]),
  reason,
}).strict();
const noteSchema = z.object({ body: z.string().trim().min(3, 'Write a note of at least 3 characters.').max(ADMIN_NOTE_MAX) }).strict();
const reportParams = z.object({ reportId: z.string().min(1).max(64) });
const reportQuery = z.object({
  status: z.enum(['open', 'resolved']).default('open'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
const resolveReportSchema = z.object({ resolution: z.enum(['DISMISSED', 'ACTIONED']), note: reason }).strict();
const resolveBugReportSchema = z.object({ resolution: z.enum(BUG_REPORT_RESOLUTIONS), note: reason }).strict();
const startRoundSchema = z.object({ confirmHandoff: z.boolean().optional() }).strict();
const revokeSessionsSchema = z.object({ reason, sessionId: id.optional() }).strict();
const renameSchema = z.object({ reason, username: usernameSchema }).strict();
const adminRoleSchema = z.object({ reason, isAdmin: z.boolean() }).strict();
const betaAccessSchema = z.object({ reason, approved: z.boolean() }).strict();
const deleteAccountSchema = z.object({
  reason,
  confirmation: z.string().trim().min(1).max(80),
}).strict();
const resyncSchema = z.object({ accountId: id.optional(), reason: reason.optional() }).strict();
const rulesetQuery = z.object({ compare: id.optional() }).strict();
const contentKey = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
const questContentQuery = z.object({ roundId: id }).strict();
const questContentParams = z.object({ key: contentKey }).strict();
const questContentToggleSchema = z.object({ reason, enabled: z.boolean() }).strict();
const playerQuestParams = z.object({ roundPlayerId: id, playerQuestId: id }).strict();
const supportQuestGrantSchema = z.object({ reason, key: contentKey }).strict();
const supportFavorSchema = z.object({
  reason,
  key: contentKey,
  delta: z.number().int().min(-1000).max(1000).refine((value) => value !== 0, 'Use a non-zero adjustment.'),
}).strict();

// 1.3.0-G: set one city's Case to an exact value, with a reason.
const supplyAdjustSchema = z.object({
  target: z.enum(['WAREHOUSE', 'CREW']),
  targetId: z.string().trim().min(1).max(64),
  productKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  quantity: z.number().int().min(0).max(10_000_000),
  reason: z.string().trim().min(3).max(500),
}).strict();

// 1.6.5-F: one audited loan correction, for a verified error: a late fee, or a missed installment.
const loanCorrectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('WAIVE_LATE_FEE'), feeId: z.string().trim().min(1).max(64), reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ kind: z.literal('EXCUSE_MISS'), installmentId: z.string().trim().min(1).max(64), reason: z.string().trim().min(3).max(500) }).strict(),
]);

const lawAdjustSchema = z.object({
  reason,
  citySlug: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/),
  points: z.number().min(0).max(1_000),
}).strict();

// 1.4.0-G: set one faction's standing to an exact value, with a receipt and audit row.
const factionAdjustSchema = z.object({
  reason,
  factionKey: z.string().trim().min(1).max(64).regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  points: z.number().int().min(0).max(10_000),
}).strict();

// 1.5.0-E: set one vehicle class's home counts exactly, with an audit row.
const vehicleCount = z.number().int().min(0).max(ADMIN_VEHICLE_MAX);
const vehicleAdjustSchema = z.object({
  reason,
  classId: z.enum(['LOW_RIDER', 'SEDAN', 'VAN']),
  ready: vehicleCount,
  damaged: vehicleCount,
  disabled: vehicleCount,
}).strict();

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
  products: z.record(z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/), z.number().int().min(0).max(ADMIN_PRODUCT_GRANT_CAP, `At most ${ADMIN_PRODUCT_GRANT_CAP} per grant.`)).optional(),
}).strict();

const createNewsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  pinned: z.boolean(),
  roundId: id.nullable(),
  publishedAt: isoDate.optional(),
  mirrorToForum: z.boolean(),
  broadcast: z.boolean().optional(),
}).strict();

const updateNewsSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  pinned: z.boolean().optional(),
  /** Publish a scheduled post now, e.g. deploy patch notes after review. */
  publishNow: z.literal(true).optional(),
}).strict();

const createBannerSchema = z.object({
  message: z.string().trim().min(3).max(280),
  tone: z.enum(['info', 'warning', 'critical']),
  startsAt: isoDate.optional(),
  endsAt: isoDate,
  // 1.0.0-E: a maintenance notice names its outage window; endsAt is then the window's end.
  kind: z.enum(['notice', 'maintenance']).optional(),
  maintenanceStartsAt: isoDate.optional(),
  maintenanceEndsAt: isoDate.optional(),
  announce: z.boolean().optional(),
}).strict();

const accountSearchQuery = z.object({
  query: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'active', 'inactive', 'admin', 'suspended', 'beta-pending']).optional(),
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

  fastify.post('/rounds/:roundId/street-pass', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const input = parseBody(updateStreetPassSchema, request.body ?? {});
    await AdminRoundService.updateStreetPass(fastify.prisma, request.auth!.account, roundId, input);
    return AdminHealthService.roundHealth(fastify.prisma, roundId);
  });

  fastify.get('/rounds/:roundId/ruleset-change', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const { rulesetId } = parseBody(rulesetChangeQuery, request.query ?? {});
    return AdminRoundService.rulesetChange(fastify.prisma, roundId, rulesetId);
  });

  fastify.post('/rounds/:roundId/ruleset', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const input = parseBody(changeRulesetSchema, request.body ?? {});
    return { round: await AdminRoundService.changeRuleset(fastify.prisma, request.auth!.account, roundId, { ...input, confirm: input.confirm ?? false }) };
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

  fastify.post('/rounds/:roundId/pause', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return { round: await AdminRoundService.pause(fastify.prisma, request.auth!.account, roundId, body.reason) };
  });

  fastify.post('/rounds/:roundId/resume', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const body = parseBody(resumeRoundSchema, request.body ?? {});
    return { round: await AdminRoundService.resume(fastify.prisma, request.auth!.account, roundId, { extend: body.extend ?? true, reason: body.reason }) };
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
    wakeDiscordBot('resync');
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
    wakeDiscordBot('resync');
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

  fastify.post('/news/:newsId/discord', async (request) => {
    const { newsId } = parseBody(newsParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return AdminNewsService.resendDiscord(fastify.prisma, request.auth!.account, newsId);
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

  // Player surveys

  fastify.get('/surveys', async () =>
    AdminSurveyService.list(fastify.prisma));

  fastify.get('/surveys/:surveyId', async (request) => {
    const { surveyId } = parseBody(surveyParams, request.params);
    return AdminSurveyService.detail(fastify.prisma, surveyId);
  });

  fastify.get('/surveys/:surveyId/results', async (request) => {
    const { surveyId } = parseBody(surveyParams, request.params);
    const query = parseBody(adminSurveyResultsQuerySchema, request.query);
    return AdminSurveyResultsService.results(fastify.prisma, surveyId, query);
  });

  fastify.post('/surveys', async (request, reply) => {
    const input = parseBody(adminSurveyDefinitionSchema, request.body ?? {});
    const survey = await AdminSurveyService.create(fastify.prisma, request.auth!.account, input);
    return reply.status(201).send(survey);
  });

  fastify.post('/surveys/:surveyId/update', async (request) => {
    const { surveyId } = parseBody(surveyParams, request.params);
    const input = parseBody(adminSurveyDefinitionSchema, request.body ?? {});
    return AdminSurveyService.update(fastify.prisma, request.auth!.account, surveyId, input);
  });

  fastify.post('/surveys/:surveyId/publish', async (request) => {
    const { surveyId } = parseBody(surveyParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return AdminSurveyService.publish(fastify.prisma, request.auth!.account, surveyId);
  });

  fastify.post('/surveys/:surveyId/close', async (request) => {
    const { surveyId } = parseBody(surveyParams, request.params);
    const input = parseBody(adminSurveyCloseSchema, request.body ?? {});
    return AdminSurveyService.close(fastify.prisma, request.auth!.account, surveyId, input.reason);
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

  fastify.post('/dev-bots/rivals/:slug/seed', async (request) => {
    const { slug } = parseBody(devBotSlugParams, request.params);
    parseBody(emptyBody, request.body ?? {});
    return AdminDevBotsService.seedOne(fastify.prisma, request.auth!.account, slug);
  });

  fastify.post('/dev-bots/accounts/:accountId/remove', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminDevBotsService.removeOne(fastify.prisma, request.auth!.account, accountId, body.reason);
  });

  fastify.post('/npc-gangs/spawn', async (request) => {
    parseBody(emptyBody, request.body ?? {});
    return AdminDevBotsService.spawnCrew(fastify.prisma, request.auth!.account);
  });

  // Registered before the :roundPlayerId route so "telemetry" is never read as an id.
  fastify.get('/npc-gangs/telemetry', async (request) => {
    const { window } = parseBody(npcTelemetryQuery, request.query ?? {});
    return NpcGangTelemetryService.report(fastify.prisma, window);
  });

  fastify.get('/npc-gangs/:roundPlayerId', async (request) => {
    const { roundPlayerId } = parseBody(npcGangParams, request.params);
    return AdminNpcGangService.inspect(fastify.prisma, roundPlayerId);
  });

  fastify.post('/npc-gangs/:roundPlayerId/control', async (request) => {
    const { roundPlayerId } = parseBody(npcGangParams, request.params);
    const body = parseBody(npcGangControlBody, request.body ?? {});
    return AdminNpcGangService.control(fastify.prisma, request.auth!.account, roundPlayerId, body);
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

  // 1.0.0-E: bans.
  fastify.post('/accounts/:accountId/ban', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const { reason: why } = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.ban(fastify.prisma, request.auth!.account, accountId, why);
  });

  fastify.post('/accounts/:accountId/unban', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const { reason: why } = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.unban(fastify.prisma, request.auth!.account, accountId, why);
  });

  fastify.post('/accounts/:accountId/suspend', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(suspendSchema, request.body ?? {});
    return AdminAccountService.suspend(fastify.prisma, request.auth!.account, accountId, body.length as AdminSuspensionLength, body.reason);
  });

  fastify.post('/accounts/:accountId/comms-mute', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(commsMuteSchema, request.body ?? {});
    return AdminAccountService.muteComms(fastify.prisma, request.auth!.account, accountId, body.length, body.reason);
  });

  fastify.post('/accounts/:accountId/comms-mute/lift', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.unmuteComms(fastify.prisma, request.auth!.account, accountId, body.reason);
  });

  fastify.post('/accounts/:accountId/notes', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(noteSchema, request.body ?? {});
    return AdminAccountService.addNote(fastify.prisma, request.auth!.account, accountId, body.body);
  });

  /** 0.9.0-H: the queue carries no message text. */
  fastify.get('/reports', async (request) => {
    const query = parseBody(reportQuery, request.query ?? {});
    return AdminModerationService.queue(fastify.prisma, query.status, query.page);
  });

  /** Opening a report reveals message text, so it is a POST and it is audited. */
  fastify.post('/reports/:reportId/open', async (request) => {
    const { reportId } = parseBody(reportParams, request.params);
    return AdminModerationService.open(fastify.prisma, request.auth!.account, reportId);
  });

  fastify.post('/reports/:reportId/resolve', async (request) => {
    const { reportId } = parseBody(reportParams, request.params);
    const body = parseBody(resolveReportSchema, request.body ?? {});
    return AdminModerationService.resolve(fastify.prisma, request.auth!.account, reportId, body.resolution, body.note);
  });

  /** rc.2: bugs players reported from the game. */
  fastify.get('/bug-reports', async (request) => {
    const query = parseBody(reportQuery, request.query ?? {});
    return BugReportService.queue(fastify.prisma, query.status, query.page);
  });

  fastify.post('/bug-reports/:reportId/resolve', async (request) => {
    const { reportId } = parseBody(reportParams, request.params);
    const body = parseBody(resolveBugReportSchema, request.body ?? {});
    return BugReportService.resolve(fastify.prisma, request.auth!.account, reportId, body.resolution, body.note);
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

  fastify.post('/accounts/:accountId/beta-access', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(betaAccessSchema, request.body ?? {});
    return AdminAccountService.setBetaApproved(fastify.prisma, request.auth!.account, accountId, body.approved, body.reason);
  });

  fastify.post('/accounts/:accountId/email/resend', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.resendVerification(fastify.prisma, request.auth!.account, accountId, body.reason, fastify.log);
  });

  fastify.post('/accounts/:accountId/2fa/reset', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminAccountService.resetTwoFactor(fastify.prisma, request.auth!.account, accountId, body.reason, fastify.log);
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

  fastify.post('/accounts/:accountId/delete', async (request) => {
    const { accountId } = parseBody(accountParams, request.params);
    const body = parseBody(deleteAccountSchema, request.body ?? {});
    return AdminAccountService.deleteAccount(
      fastify.prisma,
      request.auth!.account,
      accountId,
      body.confirmation,
      body.reason,
    );
  });

  // Quest content controls (Phase X)

  fastify.get('/quest-content', async (request) => {
    const { roundId } = parseBody(questContentQuery, request.query);
    return AdminQuestService.content(fastify.prisma, roundId);
  });

  fastify.post('/quest-content/quests/:key', async (request) => {
    const { key } = parseBody(questContentParams, request.params);
    const { roundId } = parseBody(questContentQuery, request.query);
    const body = parseBody(questContentToggleSchema, request.body ?? {});
    return AdminQuestService.setQuestEnabled(
      fastify.prisma,
      request.auth!.account,
      roundId,
      key,
      body.enabled,
      body.reason,
    );
  });

  fastify.post('/quest-content/favors/:key', async (request) => {
    const { key } = parseBody(questContentParams, request.params);
    const { roundId } = parseBody(questContentQuery, request.query);
    const body = parseBody(questContentToggleSchema, request.body ?? {});
    return AdminQuestService.setFavorEnabled(
      fastify.prisma,
      request.auth!.account,
      roundId,
      key,
      body.enabled,
      body.reason,
    );
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

  fastify.post('/players/:roundPlayerId/quests/grant', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const body = parseBody(supportQuestGrantSchema, request.body ?? {});
    return AdminQuestService.grantQuest(fastify.prisma, request.auth!.account, roundPlayerId, body.key, body.reason);
  });

  fastify.post('/players/:roundPlayerId/quests/:playerQuestId/reset', async (request) => {
    const { roundPlayerId, playerQuestId } = parseBody(playerQuestParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminQuestService.resetQuest(fastify.prisma, request.auth!.account, roundPlayerId, playerQuestId, body.reason);
  });

  fastify.post('/players/:roundPlayerId/quests/:playerQuestId/complete', async (request) => {
    const { roundPlayerId, playerQuestId } = parseBody(playerQuestParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminQuestService.completeQuest(fastify.prisma, request.auth!.account, roundPlayerId, playerQuestId, body.reason);
  });

  fastify.post('/players/:roundPlayerId/favors/adjust', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const body = parseBody(supportFavorSchema, request.body ?? {});
    return AdminQuestService.adjustFavor(
      fastify.prisma,
      request.auth!.account,
      roundPlayerId,
      body.key,
      body.delta,
      body.reason,
    );
  });

  fastify.post('/battles/:battleId/void', async (request) => {
    const { battleId } = parseBody(battleParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminBattleService.voidBattle(fastify.prisma, request.auth!.account, battleId, body.reason);
  });

  /** 0.5.0-E: reverse a convoy hit, like a battle. */
  fastify.post('/convoys/:tailId/void', async (request) => {
    const { tailId } = parseBody(tailParams, request.params);
    const body = parseBody(reasonBody, request.body ?? {});
    return AdminConvoyService.voidTail(fastify.prisma, request.auth!.account, tailId, body.reason);
  });

  fastify.get('/signals', async () => AdminSignalsService.clusters(fastify.prisma));

  // 1.0.0-F: is the game all right, and are its backups.
  fastify.get('/monitoring', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return MonitoringService.snapshot(fastify.prisma);
  });

  // 1.0.0-E: economy, fights, exploit flags and turf. Reads are read-only; repairs are audited.
  fastify.get('/rounds/:roundId/markets', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminEconomyService.markets(fastify.prisma, roundId);
  });

  /** 1.6.0-A: read-only supply state and reconciliation across orders, stock, crews, and movements. */
  fastify.get('/rounds/:roundId/supply', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminSupplyService.report(fastify.prisma, roundId);
  });

  /** 1.6.5-F: read-only loan shark health for a round, every borrower reconciled and exploit-checked. */
  fastify.get('/rounds/:roundId/loans', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminLoansService.report(fastify.prisma, roundId);
  });

  fastify.get('/rounds/:roundId/suspicious', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const { hours } = parseBody(z.object({ hours: z.coerce.number().int().min(1).max(24 * 14).optional() }).strict(), request.query ?? {});
    return AdminEconomyService.suspicious(fastify.prisma, roundId, hours ?? 24);
  });

  /** 1.2.0-H: read-only casino balance, activity, reconnect and anti-abuse telemetry. */
  fastify.get('/rounds/:roundId/casino', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminCasinoService.report(fastify.prisma, roundId);
  });

  /** 1.3.0-G: law health for a round. Read-only; Cases are shown only to staff. */
  fastify.get('/rounds/:roundId/law', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminLawService.report(fastify.prisma, roundId);
  });

  /** 1.4.0-G: faction standing health for a round. Read-only; points stay staff-only. */
  fastify.get('/rounds/:roundId/factions', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminFactionService.report(fastify.prisma, roundId);
  });

  /** 1.5.0-E: vehicle health for a round: the fleet, the garage and runs that do not add up. */
  fastify.get('/rounds/:roundId/vehicles', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminVehicleService.report(fastify.prisma, roundId);
  });

  /** 1.5.0-E: an audited correction to one vehicle class's home counts. */
  fastify.post('/players/:roundPlayerId/vehicles/adjust', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const body = parseBody(vehicleAdjustSchema, request.body ?? {});
    return AdminVehicleService.adjust(fastify.prisma, request.auth!.account, roundPlayerId, body);
  });

  fastify.get('/players/:roundPlayerId/law', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    return AdminLawService.player(fastify.prisma, roundPlayerId);
  });

  /** 1.6.0-I: an audited correction to one warehouse's or crew's stock, written to the movement ledger. */
  fastify.post('/players/:roundPlayerId/supply/adjust', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const body = parseBody(supplyAdjustSchema, request.body ?? {});
    return AdminSupplyCorrectionService.adjust(fastify.prisma, request.auth!.account, roundPlayerId, body);
  });

  /** 1.6.5-F: one player's loans in full: contracts, schedules, payments, fees, journal and ledger. */
  fastify.get('/players/:roundPlayerId/loans', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    return AdminLoansService.player(fastify.prisma, roundPlayerId);
  });

  /** 1.6.5-F: an audited loan correction: waive one late fee, or excuse one missed installment. */
  fastify.post('/players/:roundPlayerId/loans/correct', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const body = parseBody(loanCorrectionSchema, request.body ?? {});
    return AdminLoanCorrectionService.correct(fastify.prisma, request.auth!.account, roundPlayerId, body);
  });

  /** 1.3.0-G: an audited correction to one city's Case. */
  fastify.post('/players/:roundPlayerId/law/adjust', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const body = parseBody(lawAdjustSchema, request.body ?? {});
    return AdminLawService.adjust(fastify.prisma, request.auth!.account, roundPlayerId, body);
  });

  /** 1.4.0-G: an audited correction to one faction's standing. */
  fastify.post('/players/:roundPlayerId/factions/adjust', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    const body = parseBody(factionAdjustSchema, request.body ?? {});
    return AdminFactionService.adjust(fastify.prisma, request.auth!.account, roundPlayerId, body);
  });

  fastify.get('/rounds/:roundId/shipments', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminEconomyService.shipments(fastify.prisma, roundId);
  });

  fastify.get('/players/:roundPlayerId/stores', async (request) => {
    const { roundPlayerId } = parseBody(playerParams, request.params);
    return AdminEconomyService.playerStores(fastify.prisma, roundPlayerId);
  });

  fastify.get('/rounds/:roundId/battles', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    const query = parseBody(z.object({ playerId: id.optional(), limit: z.coerce.number().int().min(1).max(200).optional() }).strict(), request.query ?? {});
    return AdminEconomyService.battles(fastify.prisma, roundId, query);
  });

  fastify.get('/exploit-flags', async (request) => {
    const query = parseBody(z.object({ status: z.enum(['open', 'reviewed', 'all']).optional(), kind: z.string().max(32).optional() }).strict(), request.query ?? {});
    return ExploitFlagService.list(fastify.prisma, query);
  });

  fastify.post('/exploit-flags/:flagId/review', async (request) => {
    const { flagId } = parseBody(z.object({ flagId: id }).strict(), request.params);
    const body = parseBody(z.object({ resolution: z.enum(['dismissed', 'actioned']), note: reason }).strict(), request.body ?? {});
    return { flag: await ExploitFlagService.review(fastify.prisma, request.auth!.account, flagId, body) };
  });

  fastify.get('/rounds/:roundId/turf', async (request) => {
    const { roundId } = parseBody(roundParams, request.params);
    return AdminTurfService.overview(fastify.prisma, roundId);
  });

  fastify.get('/turf/:turfId/history', async (request) => {
    const { turfId } = parseBody(z.object({ turfId: id }).strict(), request.params);
    return AdminTurfService.history(fastify.prisma, turfId);
  });

  fastify.post('/turf/repair', async (request) => {
    const body = parseBody(z.object({
      action: z.enum(['release-block', 'sync-posted', 'settle-push']),
      turfId: id.optional(), roundPlayerId: id.optional(), pushId: id.optional(), reason,
    }).strict(), request.body ?? {});
    return AdminTurfService.repair(fastify.prisma, request.auth!.account, body);
  });

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
