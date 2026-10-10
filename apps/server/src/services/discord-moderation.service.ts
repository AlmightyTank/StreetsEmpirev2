import type { PrismaClient } from '@prisma/client';
import { ADMIN_DISCORD_TIMEOUT_LENGTHS, type AdminDiscordTimeoutLength } from '@streets/shared';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';

/**
 * Discord timeouts for linked players. Only the bot holds a Discord token, so the
 * game asks it over its localhost listener (the one DISCORD_BOT_PUSH_URL wakes).
 */

const memberSchema = z.object({
  inServer: z.boolean(),
  displayName: z.string().nullable(),
  timedOutUntil: z.string().nullable(),
  canModerate: z.boolean(),
  problem: z.string().nullable(),
});
export type DiscordMemberStatus = z.infer<typeof memberSchema>;
export type DiscordMemberResult = { ok: true; member: DiscordMemberStatus } | { ok: false; problem: string };

const OFF = 'Discord moderation is off: set DISCORD_BOT_PUSH_URL so the game can reach the bot.';

async function askBot(path: string, body: unknown, fetcher: typeof fetch): Promise<DiscordMemberResult> {
  if (!env.discordBot.push.enabled) return { ok: false, problem: OFF };
  try {
    const response = await fetcher(new URL(path, env.discordBot.push.url), {
      method: 'POST',
      headers: { authorization: `Bearer ${env.discordBot.apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const json: unknown = await response.json().catch(() => null);
    if (response.status === 404) return { ok: false, problem: 'The bot is running an older version without moderation. Restart it on the latest build.' };
    if (!response.ok) {
      const message = z.object({ error: z.object({ message: z.string() }) }).safeParse(json);
      return { ok: false, problem: message.success ? message.data.error.message : `The bot answered ${response.status}.` };
    }
    const parsed = z.object({ member: memberSchema }).safeParse(json);
    return parsed.success ? { ok: true, member: parsed.data.member } : { ok: false, problem: 'The bot sent back something unexpected.' };
  } catch {
    return { ok: false, problem: 'Could not reach the Discord bot. Is it running?' };
  }
}

async function linkedDiscordId(prisma: PrismaClient, accountId: string): Promise<{ username: string; discordId: string }> {
  if (!env.discordBot.push.enabled) throw AppError.badRequest('DISCORD_MODERATION_DISABLED', OFF);
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { username: true, discordId: true } });
  if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');
  if (!account.discordId) throw AppError.conflict('DISCORD_NOT_LINKED', `${account.username} has not linked Discord.`);
  return { username: account.username, discordId: account.discordId };
}

export const DiscordModerationService = {
  /** Never throws: a stopped bot is a problem line for the page. */
  async member(discordId: string, fetcher: typeof fetch = fetch): Promise<DiscordMemberResult> {
    return askBot('/internal/member', { discordId }, fetcher);
  },

  async timeout(prisma: PrismaClient, actor: AuditActor, accountId: string, length: AdminDiscordTimeoutLength, reason: string, fetcher: typeof fetch = fetch): Promise<void> {
    const chosen = ADMIN_DISCORD_TIMEOUT_LENGTHS.find((option) => option.key === length);
    if (!chosen) throw AppError.badRequest('DISCORD_TIMEOUT_LENGTH_UNKNOWN', 'Pick one of the offered timeout lengths.');
    const { username, discordId } = await linkedDiscordId(prisma, accountId);
    const result = await askBot('/internal/timeout', { discordId, minutes: chosen.minutes, reason: `${reason} (by ${actor.username} in StreetsEmpire)` }, fetcher);
    if (!result.ok) throw AppError.conflict('DISCORD_TIMEOUT_FAILED', result.problem);
    await AdminAuditService.record(prisma, actor, {
      action: 'discord.timeout',
      targetType: 'account',
      targetId: accountId,
      reason,
      after: { username, length: chosen.label, timedOutUntil: result.member.timedOutUntil },
    });
  },

  async liftTimeout(prisma: PrismaClient, actor: AuditActor, accountId: string, reason: string, fetcher: typeof fetch = fetch): Promise<void> {
    const { username, discordId } = await linkedDiscordId(prisma, accountId);
    const result = await askBot('/internal/timeout', { discordId, minutes: null, reason: `${reason} (by ${actor.username} in StreetsEmpire)` }, fetcher);
    if (!result.ok) throw AppError.conflict('DISCORD_TIMEOUT_FAILED', result.problem);
    await AdminAuditService.record(prisma, actor, { action: 'discord.timeout-lift', targetType: 'account', targetId: accountId, reason, after: { username } });
  },
};
