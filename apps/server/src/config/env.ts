import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// apps/server/src/config -> repo root
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

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

const forumUrl = new URL(parsed.data.FORUM_ORIGIN);
if (forumUrl.username || forumUrl.password || forumUrl.pathname !== '/' || forumUrl.search || forumUrl.hash ||
    (forumUrl.protocol !== 'https:' && !(parsed.data.NODE_ENV !== 'production' && forumUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(forumUrl.hostname)))) {
  throw new Error('FORUM_ORIGIN must be an HTTPS origin without a path (HTTP localhost is allowed in development).');
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  corsOrigins,
  frontendOrigin: parsed.data.FRONTEND_ORIGIN ?? corsOrigins[0] ?? 'http://localhost:5173',
  sessionTtlMs: parsed.data.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  auditRetentionDays: parsed.data.ADMIN_AUDIT_RETENTION_DAYS,
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
