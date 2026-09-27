import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { environmentConflicts, inferAppEnvironment } from '@streets/shared';

// apps/server/src/config -> repo root
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * 1.0.0-A. production | beta | development | test. Optional: without it an
   * invite-only production-mode server is beta and any other is production.
   */
  APP_ENV: z.string().optional(),
  /** 1.0.0-A. Short commit of the build, when deploys pass it; otherwise read from git. */
  BUILD_COMMIT: z.string().regex(/^[0-9a-f]{7,40}$/i, 'BUILD_COMMIT must be a git commit hash.').optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),

  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3001),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters.'),
  SESSION_COOKIE_NAME: z.string().default('se_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  FRONTEND_ORIGIN: z.string().url().optional(),
  /** Invite-only gate for isolated beta deployments. */
  BETA_INVITE_ONLY: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  /** Non-production admin QA mode: expose seasonal event quests outside their real-world window. */
  SEASONAL_EVENT_ADMIN_TEST_MODE: z.enum(['true', 'false']).optional(),

  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  DISCORD_REDIRECT_URI: z.string().default(''),

  FORUM_ORIGIN: z.string().url().default('https://forum.streetsempire.dev'),
  FORUM_LINK_SECRET: z.union([z.literal(''), z.string().min(64)]).default(''),
  /** Flarum admin API key used to mirror news into the announcements tag. */
  FORUM_API_KEY: z.string().default(''),
  /** The forum user the mirrored discussions are posted as. */
  FORUM_API_USER_ID: z.coerce.number().int().positive().default(1),
  FORUM_NEWS_TAG_ID: z.string().regex(/^\d*$/, 'FORUM_NEWS_TAG_ID must be a numeric Flarum tag id.').default(''),
  /** 0.3.0-C. The recruitment tag alliance leaders post their threads into. */
  FORUM_RECRUITMENT_TAG_ID: z.string().regex(/^\d*$/, 'FORUM_RECRUITMENT_TAG_ID must be a numeric Flarum tag id.').default(''),
  /** Optional cosmetic: any account with Discord linked gets the Beta Tester title/badge. */
  BETA_TESTER_DISCORD_LINKED: z.coerce.boolean().default(false),
  /** Optional legacy cosmetic path: linked forum users in any of these visible groups get the Beta Tester title/badge. */
  BETA_TESTER_FORUM_GROUPS: z.string().default(''),

  DISCORD_BOT_API_TOKEN: z.union([z.literal(''), z.string().min(64)]).default(''),
  DISCORD_BOT_PUSH_URL: z.union([z.literal(''), z.string().url()]).default(''),
  DISCORD_BOT_PUSH_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(2_000),

  /** Web Push. Generate a pair with `npx web-push generate-vapid-keys`. */
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  /** A mailto: or https: contact the push services can reach. */
  VAPID_SUBJECT: z.union([z.literal(''), z.string().regex(/^(mailto:|https:\/\/)/, 'VAPID_SUBJECT must start with mailto: or https://.')]).default(''),

  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default(''),
  /** How long admin audit entries are kept. 0 keeps them forever. */
  ADMIN_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(365),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  /** 1.0.0-F. Bearer token for /api/metrics (Prometheus text). Empty: the endpoint does not exist. */
  METRICS_TOKEN: z.union([z.literal(''), z.string().min(24, 'METRICS_TOKEN must be at least 24 characters.')]).default(''),
  /** 1.0.0-F. The JSON file scripts/ops/backup-db.sh and restore-test.sh write, so monitoring can see backups. */
  BACKUP_STATUS_FILE: z.string().default(''),
  /** 1.0.0-F. Hours after which a backup counts as missing, and days after which a restore test is stale. */
  BACKUP_MAX_AGE_HOURS: z.coerce.number().int().positive().default(26),
  RESTORE_TEST_MAX_AGE_DAYS: z.coerce.number().int().positive().default(8),
  /** 1.0.0-F. Maintenance mode: every player request is answered 503 with this message; admins and health checks still work. */
  MAINTENANCE_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  MAINTENANCE_MESSAGE: z.string().max(280).default('StreetsEmpire is down for maintenance. Everything you own is safe; check back shortly.'),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().positive().default(60),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const corsOrigins = parsed.data.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const betaTesterForumGroups = parsed.data.BETA_TESTER_FORUM_GROUPS.split(',')
  .map((name) => name.trim())
  .filter(Boolean)
  .slice(0, 10);

const forumUrl = new URL(parsed.data.FORUM_ORIGIN);
if (forumUrl.username || forumUrl.password || forumUrl.pathname !== '/' || forumUrl.search || forumUrl.hash ||
    (forumUrl.protocol !== 'https:' && !(parsed.data.NODE_ENV !== 'production' && forumUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(forumUrl.hostname)))) {
  throw new Error('FORUM_ORIGIN must be an HTTPS origin without a path (HTTP localhost is allowed in development).');
}

const appEnvironment = inferAppEnvironment({
  appEnv: parsed.data.APP_ENV,
  nodeEnv: parsed.data.NODE_ENV,
  betaInviteOnly: parsed.data.BETA_INVITE_ONLY,
  sessionCookieName: parsed.data.SESSION_COOKIE_NAME,
});
const conflicts = environmentConflicts({
  environment: appEnvironment,
  nodeEnv: parsed.data.NODE_ENV,
  sessionCookieName: parsed.data.SESSION_COOKIE_NAME,
  betaInviteOnly: parsed.data.BETA_INVITE_ONLY,
});
if (conflicts.length) {
  throw new Error(`Refusing to start as ${appEnvironment}:\n${conflicts.map((problem) => `  ${problem}`).join('\n')}`);
}

const seasonalEventAdminTestMode = parsed.data.SEASONAL_EVENT_ADMIN_TEST_MODE
  ? parsed.data.SEASONAL_EVENT_ADMIN_TEST_MODE === 'true'
  : parsed.data.NODE_ENV !== 'production';

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  /** 1.0.0-A. production | beta | development | test. */
  appEnvironment,
  buildCommit: parsed.data.BUILD_COMMIT?.slice(0, 12) ?? null,
  corsOrigins,
  frontendOrigin: parsed.data.FRONTEND_ORIGIN ?? corsOrigins[0] ?? 'http://localhost:5173',
  sessionTtlMs: parsed.data.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  auditRetentionDays: parsed.data.ADMIN_AUDIT_RETENTION_DAYS,
  monitoring: {
    metricsToken: parsed.data.METRICS_TOKEN,
    backupStatusFile: parsed.data.BACKUP_STATUS_FILE,
    backupMaxAgeHours: parsed.data.BACKUP_MAX_AGE_HOURS,
    restoreTestMaxAgeDays: parsed.data.RESTORE_TEST_MAX_AGE_DAYS,
  },
  maintenance: {
    enabled: parsed.data.MAINTENANCE_MODE,
    message: parsed.data.MAINTENANCE_MESSAGE,
  },
  betaAccess: {
    inviteOnly: parsed.data.BETA_INVITE_ONLY,
  },
  seasonalEvents: {
    adminTestMode: seasonalEventAdminTestMode,
  },
  forum: {
    origin: new URL(parsed.data.FORUM_ORIGIN).origin,
    secret: parsed.data.FORUM_LINK_SECRET,
    enabled: Boolean(parsed.data.FORUM_LINK_SECRET),
    news: {
      apiKey: parsed.data.FORUM_API_KEY,
      userId: parsed.data.FORUM_API_USER_ID,
      tagId: parsed.data.FORUM_NEWS_TAG_ID,
      /** Off in tests so no test run ever posts to a real forum. */
      enabled: parsed.data.NODE_ENV !== 'test' && Boolean(parsed.data.FORUM_API_KEY && parsed.data.FORUM_NEWS_TAG_ID),
    },
    recruitment: {
      apiKey: parsed.data.FORUM_API_KEY,
      userId: parsed.data.FORUM_API_USER_ID,
      tagId: parsed.data.FORUM_RECRUITMENT_TAG_ID,
      enabled: parsed.data.NODE_ENV !== 'test' && Boolean(parsed.data.FORUM_API_KEY && parsed.data.FORUM_RECRUITMENT_TAG_ID),
    },
  },
  betaTester: {
    discordLinked: parsed.data.BETA_TESTER_DISCORD_LINKED,
    forumGroups: betaTesterForumGroups,
    enabled: parsed.data.BETA_TESTER_DISCORD_LINKED || betaTesterForumGroups.length > 0,
  },
  discordBot: {
    apiToken: parsed.data.DISCORD_BOT_API_TOKEN,
    enabled: Boolean(parsed.data.DISCORD_BOT_API_TOKEN),
    push: {
      url: parsed.data.DISCORD_BOT_PUSH_URL,
      timeoutMs: parsed.data.DISCORD_BOT_PUSH_TIMEOUT_MS,
      enabled: Boolean(parsed.data.DISCORD_BOT_API_TOKEN && parsed.data.DISCORD_BOT_PUSH_URL),
    },
  },
  push: {
    publicKey: parsed.data.VAPID_PUBLIC_KEY,
    privateKey: parsed.data.VAPID_PRIVATE_KEY,
    subject: parsed.data.VAPID_SUBJECT,
    /** Keys are set, so players can subscribe and alerts are collected for push. */
    configured: Boolean(parsed.data.VAPID_PUBLIC_KEY && parsed.data.VAPID_PRIVATE_KEY && parsed.data.VAPID_SUBJECT),
    /** Off in tests so no test run ever calls a real push service. */
    enabled: parsed.data.NODE_ENV !== 'test' && Boolean(parsed.data.VAPID_PUBLIC_KEY && parsed.data.VAPID_PRIVATE_KEY && parsed.data.VAPID_SUBJECT),
  },
  discord: {
    clientId: parsed.data.DISCORD_CLIENT_ID,
    clientSecret: parsed.data.DISCORD_CLIENT_SECRET,
    redirectUri: parsed.data.DISCORD_REDIRECT_URI,
    enabled: Boolean(parsed.data.DISCORD_CLIENT_ID && parsed.data.DISCORD_CLIENT_SECRET),
  },
  email: {
    resendApiKey: parsed.data.RESEND_API_KEY,
    from: parsed.data.EMAIL_FROM,
    enabled: parsed.data.NODE_ENV !== 'test' && Boolean(parsed.data.RESEND_API_KEY && parsed.data.EMAIL_FROM),
    passwordResetTtlMinutes: parsed.data.PASSWORD_RESET_TTL_MINUTES,
    verificationTtlMinutes: parsed.data.EMAIL_VERIFICATION_TTL_MINUTES,
  },
};

export type Env = typeof env;
