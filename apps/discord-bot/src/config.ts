import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// apps/discord-bot/src (dev) or apps/discord-bot/dist (built) -> repo root, shared with the game server.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

const snowflake = (name: string) => z.string().regex(/^[0-9]{17,20}$/, `${name} must be a Discord ID (17-20 digits).`);

const schema = z.object({
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
  /** Channel that gets new game news automatically; empty turns auto-posting off. */
  DISCORD_NEWS_CHANNEL_ID: z.union([z.literal(''), snowflake('DISCORD_NEWS_CHANNEL_ID')]).default(''),
  DISCORD_NEWS_MINUTES: z.coerce.number().int().min(1).max(60).default(1),
  /** How often opt-in turn reminders (/remind) are checked. */
  DISCORD_REMINDER_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
});

export type BotConfig = z.infer<typeof schema> & { frontendOrigin: string };

export function loadConfig(source: NodeJS.ProcessEnv = process.env): BotConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid Discord bot configuration:\n${issues}`);
  }
  return { ...parsed.data, frontendOrigin: new URL(parsed.data.FRONTEND_ORIGIN).origin };
}
