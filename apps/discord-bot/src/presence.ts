import { ActivityType, type Client } from 'discord.js';

export interface PresenceContext {
  /** Host only, e.g. streetsempire.dev — presence text can't be a clickable link. */
  playHost: string;
  roundName?: string | null;
  playerCount?: number | null;
  /** Whole days left in the round, when known. */
  daysLeft?: number | null;
}

export interface PresenceActivity {
  name: string;
  type: ActivityType;
  state?: string;
}

/**
 * The rotating set. Every entry funnels toward the game: at least every other
 * rotation is an explicit "Playing StreetsEmpire / play at <host>" card, since
 * bot presences can't carry a clickable button or URL.
 */
export function buildPresenceList(ctx: PresenceContext): PresenceActivity[] {
  const host = ctx.playHost || 'streetsempire.com';
  const playAt = `play at ${host}`;
  const players = typeof ctx.playerCount === 'number' && ctx.playerCount >= 0
    ? `${ctx.playerCount} hustler${ctx.playerCount === 1 ? '' : 's'}`
    : null;
  const round = ctx.roundName?.trim() ? ctx.roundName.trim() : null;
  const crunch = typeof ctx.daysLeft === 'number' && ctx.daysLeft >= 0 && ctx.daysLeft <= 3
    ? (ctx.daysLeft === 0 ? 'final day' : `${ctx.daysLeft}d left`)
    : null;

  const list: PresenceActivity[] = [
    // The anchor: what we're playing + where to play it.
    { name: 'StreetsEmpire', type: ActivityType.Playing, state: `▶ ${playAt}` },
    { name: 'the block', type: ActivityType.Watching, state: 'Wiping the block out' },
    { name: 'StreetsEmpire', type: ActivityType.Playing, state: `free to play · ${playAt}` },
    { name: 'turf wars', type: ActivityType.Competing, state: round ? `${round} · ${playAt}` : playAt },
    { name: 'for drive-bys', type: ActivityType.Watching, state: 'hold your corners' },
    { name: 'StreetsEmpire', type: ActivityType.Playing, state: `run your block · ${playAt}` },
    { name: 'the raid feed', type: ActivityType.Watching, state: 'who hit who last' },
    { name: 'for National #1', type: ActivityType.Competing, state: crunch ?? playAt },
    { name: 'StreetsEmpire', type: ActivityType.Playing, state: `with full turns · ${playAt}` },
    { name: 'the Inner Circle', type: ActivityType.Watching, state: 'factions are recruiting' },
    { name: '/help', type: ActivityType.Listening, state: `commands · ${playAt}` },
    { name: 'StreetsEmpire', type: ActivityType.Playing, state: `your crew misses you · ${playAt}` },
  ];

  // Live player count gets the prime Watching slot when the API answers.
  if (players) {
    list[1] = { name: `${players} on the block`, type: ActivityType.Watching, state: crunch ? `${crunch} · ${playAt}` : playAt };
  }
  return list;
}

/** Whole days left from the round status, or null when unknown. */
export function daysLeftFromMs(ms: number | null | undefined): number | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

function applyPresence(client: Client, activity: PresenceActivity): void {
  client.user?.setActivity({ name: activity.name, type: activity.type, state: activity.state });
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
    minutes: number;
    getStatus: () => Promise<{ playerCount: number | null; roundName: string | null; msRemaining: number | null }>;
  },
): () => void {
  let index = 0;
  const tick = async () => {
    let ctx: PresenceContext = { playHost: deps.playHost };
    try {
      const status = await deps.getStatus();
      ctx = {
        playHost: deps.playHost,
        roundName: status.roundName,
        playerCount: status.playerCount,
        daysLeft: daysLeftFromMs(status.msRemaining),
      };
    } catch {
      // Static list; logged by the poller's caller if it matters.
    }
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
    minutes: number;
    getRound: () => Promise<{ round: { name: string; msRemaining: number; playerCount: number } | null }>;
  },
): (() => void) | null {
  if (deps.minutes <= 0) return null;
  return startPresenceRotator(client, {
    playHost: deps.playHost,
    minutes: deps.minutes,
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
