import { ActivityType, type Client } from 'discord.js';

export interface PresenceContext {
  /** Host only, e.g. streetsempire.dev — custom status text can't be a clickable link. */
  playHost: string;
  /** Discord makes Streaming activities clickable when this is a Twitch/YouTube URL. */
  streamUrl?: string;
  roundName?: string | null;
  playerCount?: number | null;
  /** Whole days left in the round, when known. */
  daysLeft?: number | null;
  highlights?: Array<{ kind: 'jackpot' | 'sportsbook' | 'raid' | 'scout'; message: string }>;
}

export interface PresenceActivity {
  name: string;
  type: ActivityType;
  state?: string;
  url?: string;
}

/**
 * One clickable Twitch card, followed by plain custom statuses that highlight
 * releases, cosmetics, and the cosmetic-only Supporter page.
 */
export function buildPresenceList(ctx: PresenceContext): PresenceActivity[] {
  const host = ctx.playHost || 'streetsempire.com';
  const streamUrl = ctx.streamUrl || 'https://twitch.tv/amightytank';
  const players = typeof ctx.playerCount === 'number' && ctx.playerCount >= 0
    ? `${ctx.playerCount} hustler${ctx.playerCount === 1 ? '' : 's'}`
    : null;
  const round = ctx.roundName?.trim() ? ctx.roundName.trim() : null;
  const crunch = typeof ctx.daysLeft === 'number' && ctx.daysLeft >= 0 && ctx.daysLeft <= 3
    ? (ctx.daysLeft === 0 ? 'final day' : `${ctx.daysLeft}d left`)
    : null;
  const highlights = new Map(ctx.highlights?.map((highlight) => [highlight.kind, highlight.message]) ?? []);

  const list: PresenceActivity[] = [
    // Streaming is the only Discord activity type that makes the Twitch URL clickable.
    { name: 'StreetsEmpire LIVE', type: ActivityType.Streaming, state: 'Play with amightytank', url: streamUrl },
    { name: 'Custom Status', type: ActivityType.Custom, state: '✨ New StreetsEmpire features are live' },
    { name: 'Custom Status', type: ActivityType.Custom, state: '🎨 Fresh cosmetics just dropped' },
    { name: 'Custom Status', type: ActivityType.Custom, state: '💎 Visit the Supporter page' },
    { name: 'Custom Status', type: ActivityType.Custom, state: '🚘 Unlock Midnight Chrome cosmetics' },
    { name: 'Custom Status', type: ActivityType.Custom, state: '🗳️ Supporters help shape what comes next' },
    { name: 'Custom Status', type: ActivityType.Custom, state: '🎁 Cosmetic perks. Never pay-to-win.' },
    { name: 'Custom Status', type: ActivityType.Custom, state: highlights.get('jackpot') ?? '🎰 Chase the jackpot in the Casino' },
    { name: 'Custom Status', type: ActivityType.Custom, state: highlights.get('sportsbook') ?? '🏆 Make your picks in the Sportsbook' },
    { name: 'Custom Status', type: ActivityType.Custom, state: highlights.get('raid') ?? '💥 Plan your next big raid' },
    { name: 'Custom Status', type: ActivityType.Custom, state: highlights.get('scout') ?? '🔎 Scout the streets for your next score' },
    { name: 'Custom Status', type: ActivityType.Custom, state: players ? `🔥 ${players} building empires` : `🔥 Build your empire at ${host}` },
    {
      name: 'Custom Status',
      type: ActivityType.Custom,
      state: round ? `🏁 ${round}${crunch ? ` · ${crunch}` : ''}` : '🏙️ StreetsEmpire keeps growing',
    },
  ];
  return list;
}

/** Whole days left from the round status, or null when unknown. */
export function daysLeftFromMs(ms: number | null | undefined): number | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

function applyPresence(client: Client, activity: PresenceActivity): void {
  client.user?.setActivity({ name: activity.name, type: activity.type, state: activity.state, url: activity.url });
}

/**
 * Set the bot's presence now and rotate through the list every `minutes`.
 * The round lookup runs on each rotation so the player-count card stays live;
 * a down API just falls back to the static list instead of clearing presence.
 */
export function startPresenceRotator(
  client: Client,
  deps: {
    playHost: string;
    streamUrl?: string;
    minutes: number;
    getStatus: () => Promise<{ playerCount: number | null; roundName: string | null; msRemaining: number | null }>;
    getHighlights?: () => Promise<{ highlights: PresenceContext['highlights'] }>;
  },
): () => void {
  let index = 0;
  const tick = async () => {
    let ctx: PresenceContext = { playHost: deps.playHost, streamUrl: deps.streamUrl };
    const [statusResult, highlightsResult] = await Promise.allSettled([
      deps.getStatus(),
      deps.getHighlights?.() ?? Promise.resolve({ highlights: [] }),
    ]);
    if (statusResult.status === 'fulfilled') {
      const status = statusResult.value;
      ctx = {
        playHost: deps.playHost,
        streamUrl: deps.streamUrl,
        roundName: status.roundName,
        playerCount: status.playerCount,
        daysLeft: daysLeftFromMs(status.msRemaining),
      };
    }
    if (highlightsResult.status === 'fulfilled') ctx.highlights = highlightsResult.value.highlights;
    const list = buildPresenceList(ctx);
    const activity = list[index % list.length];
    if (activity) {
      applyPresence(client, activity);
      console.log(`Bot presence (${(index % list.length) + 1}/${list.length}): ${ActivityType[activity.type]} ${activity.name} — ${activity.state ?? '(no state)'}`);
    }
    index += 1;
  };
  void tick();
  const timer = setInterval(() => void tick().catch((error: unknown) => console.error('Presence rotation failed:', error)), deps.minutes * 60_000);
  return () => clearInterval(timer);
}

/** Wire-up helper kept thin so index.ts stays readable. */
export function startBotPresence(
  client: Client,
  deps: {
    playHost: string;
    streamUrl?: string;
    minutes: number;
    getRound: () => Promise<{ round: { name: string; msRemaining: number; playerCount: number } | null }>;
    getHighlights?: () => Promise<{ highlights: PresenceContext['highlights'] }>;
  },
): (() => void) | null {
  if (deps.minutes <= 0) return null;
  return startPresenceRotator(client, {
    playHost: deps.playHost,
    streamUrl: deps.streamUrl,
    minutes: deps.minutes,
    getHighlights: deps.getHighlights,
    getStatus: async () => {
      const status = await deps.getRound();
      return {
        playerCount: status.round?.playerCount ?? null,
        roundName: status.round?.name ?? null,
        msRemaining: status.round?.msRemaining ?? null,
      };
    },
  });
}
