import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { inferAppEnvironment } from '@streets/shared';

// apps/discord-bot/src (dev) or apps/discord-bot/dist (built) -> repo root, shared with the game server.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

const snowflake = (name: string) => z.string().regex(/^[0-9]{17,20}$/, `${name} must be a Discord ID (17-20 digits).`);
const optionalChannel = (name: string) => z.union([z.literal(''), snowflake(name)]).default('');

const schema = z.object({
  APP_ENV: z.enum(['production', 'beta', 'development', 'test']).optional(),
  NODE_ENV: z.string().default('development'),
  BETA_INVITE_ONLY: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SESSION_COOKIE_NAME: z.string().default('se_session'),
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required (Discord developer portal → Bot → Token).'),
  DISCORD_CLIENT_ID: snowflake('DISCORD_CLIENT_ID'),
  DISCORD_GUILD_ID: snowflake('DISCORD_GUILD_ID'),
  DISCORD_BOT_API_TOKEN: z.string().min(64, 'DISCORD_BOT_API_TOKEN must match the game server and be 64+ characters.'),
  /** Where the bot reaches the game API; an origin, e.g. http://127.0.0.1:3001 on the VPS. */
  GAME_API_URL: z.string().url().default('http://127.0.0.1:3001'),
  /** Public game origin for links in replies. */
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  DISCORD_SYNC_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  /** Forum groups mirrored as "Forum <name>" roles. */
  DISCORD_FORUM_GROUPS: z.string().default('Admin,Mod'),
  /** Channel for new game news and the round-end standings; empty turns both off. */
  DISCORD_NEWS_CHANNEL_ID: optionalChannel('DISCORD_NEWS_CHANNEL_ID'),
  /** Subscriber role pinged for published patch notes; exact-name lookup is the default. */
  DISCORD_GAME_UPDATES_ROLE_ID: optionalChannel('DISCORD_GAME_UPDATES_ROLE_ID'),
  /** Subscriber role pinged for general news, but not patch notes. */
  DISCORD_NEWS_UPDATES_ROLE_ID: optionalChannel('DISCORD_NEWS_UPDATES_ROLE_ID'),
  DISCORD_NEWS_MINUTES: z.coerce.number().int().min(1).max(60).default(1),
  /** Channel for raid results; empty turns the raid feed off. */
  DISCORD_RAID_FEED_CHANNEL_ID: optionalChannel('DISCORD_RAID_FEED_CHANNEL_ID'),
  /** Private staff channel for bug reports and held patch notes; empty turns staff posts off. */
  DISCORD_STAFF_CHANNEL_ID: optionalChannel('DISCORD_STAFF_CHANNEL_ID'),
  /** Text channel /support tickets are private threads in; empty turns /support off. */
  DISCORD_SUPPORT_CHANNEL_ID: optionalChannel('DISCORD_SUPPORT_CHANNEL_ID'),
  /** Public channel for updates going live, planned maintenance and outages; empty turns them off. */
  DISCORD_STATUS_CHANNEL_ID: optionalChannel('DISCORD_STATUS_CHANNEL_ID'),
  /** Subscriber role pinged for new deploy, maintenance, and outage logs. */
  DISCORD_SERVER_UPDATES_ROLE_ID: optionalChannel('DISCORD_SERVER_UPDATES_ROLE_ID'),
  /** How long the game must stay unreachable before the status channel says it is down. */
  DISCORD_OUTAGE_MINUTES: z.coerce.number().int().min(1).max(60).default(3),
  /** How often the bot rotates its presence/activity. Set 0 to keep Discord's default (no custom activity). */
  DISCORD_PRESENCE_MINUTES: z.coerce.number().int().min(0).max(60).default(5),
  /** Twitch or YouTube URL used by the clickable Streaming presence card. */
  DISCORD_STREAM_URL: z.string().url().default('https://twitch.tv/amightytank'),
  /** How often alerts (/alerts), the raid feed and round events are checked. */
  DISCORD_ALERTS_MINUTES: z.coerce.number().int().min(1).max(60).default(1),
  /** Local HTTP listener for game-server wake-up nudges. Set port 0 to turn it off. */
  DISCORD_BOT_LISTEN_HOST: z.string().default('127.0.0.1'),
  DISCORD_BOT_LISTEN_PORT: z.coerce.number().int().min(0).max(65535).default(3002),
  /**
   * full: sync every game/forum/alliance role.
   * beta-tester-only: sync only the fixed Beta Tester role.
   */
  DISCORD_ROLE_SYNC_MODE: z.enum(['full', 'beta-tester-only']).default('full'),
});

export type BotConfig = z.infer<typeof schema> & { frontendOrigin: string; betaMode: boolean };

export function loadConfig(source: NodeJS.ProcessEnv = process.env): BotConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid Discord bot configuration:\n${issues}`);
  }
  const environment = inferAppEnvironment({
    appEnv: parsed.data.APP_ENV,
    nodeEnv: parsed.data.NODE_ENV,
    betaInviteOnly: parsed.data.BETA_INVITE_ONLY,
    sessionCookieName: parsed.data.SESSION_COOKIE_NAME,
  });
  return {
    ...parsed.data,
    frontendOrigin: new URL(parsed.data.FRONTEND_ORIGIN).origin,
    betaMode: environment === 'beta',
  };
}
