import { env } from '../config/env.js';

export type DiscordBotWakeReason = 'alerts' | 'combat' | 'news' | 'resync';

async function sendWake(reason: DiscordBotWakeReason): Promise<boolean> {
  if (!env.discordBot.push.enabled) return false;
  const response = await fetch(env.discordBot.push.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.discordBot.apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason }),
    signal: AbortSignal.timeout(env.discordBot.push.timeoutMs),
  });
  return response.ok;
}

/**
 * Best-effort local nudge. The bot still claims work from the API, so failures
 * only mean the existing polling fallback handles the delivery.
 */
export function wakeDiscordBot(reason: DiscordBotWakeReason): void {
  void sendWake(reason).catch(() => undefined);
}
