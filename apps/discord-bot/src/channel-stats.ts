import { PermissionFlagsBits, type Guild } from 'discord.js';

export interface RotatingStats {
  playerCount: number | null;
  peakPlayers: number | null;
  gameName: string | null;
  tradedCents: number;
  raidsToday: number;
  daysLeft: number | null;
  serverStatus: 'online' | 'maintenance' | 'offline';
}

const DEFAULT_TEMPLATES = [
  '🔥・peak-{peak}-today',
  '💰・{traded}-traded',
  '⚔️・{raids}-raids-today',
  '⏱️・{days}d-left',
];

function compactCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${Math.round(dollars)}`;
}

export function renderStatsTemplate(template: string, stats: RotatingStats): string {
  const values: Record<string, string> = {
    peak: String(stats.peakPlayers ?? '—'),
    game: stats.gameName ?? 'no-game',
    traded: compactCents(stats.tradedCents),
    raids: String(stats.raidsToday),
    days: stats.daysLeft === null ? 'no-round' : String(stats.daysLeft),
    players: String(stats.playerCount ?? 'offline'),
    status: stats.serverStatus,
  };
  return template.replace(/\{(peak|game|traded|raids|days|players|status)\}/g, (_, key: string) => values[key]!).trim().slice(0, 100) || 'streets-empire';
}

export function rotatingStatsNames(stats: RotatingStats, templates = DEFAULT_TEMPLATES): string[] {
  return templates.map((template) => renderStatsTemplate(template, stats));
}

/** Keep one or more dedicated stats channels current without rotating their purposes. */
export function startStatsChannelUpdater(
  guild: Guild,
  deps: {
    channels: Array<{ channelId: string; template: string }>;
    minutes: number;
    getStats: () => Promise<Omit<RotatingStats, 'peakPlayers'>>;
  },
): (() => void) | null {
  const channels = deps.channels.filter((channel) => channel.channelId && channel.template);
  if (!channels.length || deps.minutes <= 0) return null;
  let peakDay = '';
  let peakPlayers: number | null = null;
  const tick = async () => {
    const current = await deps.getStats();
    const day = new Date().toISOString().slice(0, 10);
    if (day !== peakDay) { peakDay = day; peakPlayers = null; }
    if (typeof current.playerCount === 'number') peakPlayers = Math.max(peakPlayers ?? 0, current.playerCount);
    const me = await guild.members.fetchMe();
    await Promise.all(channels.map(async ({ channelId, template }) => {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !('setName' in channel) || !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) return;
      const name = renderStatsTemplate(template, { ...current, peakPlayers });
      if (channel.name !== name) await channel.setName(name, 'Update StreetsEmpire live stats').catch(() => undefined);
    }));
  };
  void tick().catch(() => undefined);
  const timer = setInterval(() => void tick().catch(() => undefined), deps.minutes * 60_000);
  return () => clearInterval(timer);
}

/** Rotate one channel through the configured live stats, editing only when needed. */
export function startStatsChannelRotator(
  guild: Guild,
  deps: { channelId: string; templates?: string[]; minutes: number; getStats: () => Promise<Omit<RotatingStats, 'peakPlayers'>> },
): (() => void) | null {
  if (!deps.channelId || deps.minutes <= 0) return null;
  const templates = deps.templates?.filter(Boolean).length ? deps.templates.filter(Boolean) : DEFAULT_TEMPLATES;
  let index = 0;
  let peakDay = '';
  let peakPlayers: number | null = null;
  const tick = async () => {
    const current = await deps.getStats();
    const day = new Date().toISOString().slice(0, 10);
    if (day !== peakDay) { peakDay = day; peakPlayers = null; }
    if (typeof current.playerCount === 'number') peakPlayers = Math.max(peakPlayers ?? 0, current.playerCount);
    const names = rotatingStatsNames({ ...current, peakPlayers }, templates);
    const channel = await guild.channels.fetch(deps.channelId).catch(() => null);
    if (!channel || !('setName' in channel)) return;
    const me = await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) return;
    const name = names[index % names.length]!;
    index += 1;
    if (channel.name !== name) await channel.setName(name, 'Rotate StreetsEmpire live stats').catch(() => undefined);
  };
  void tick().catch(() => undefined);
  const timer = setInterval(() => void tick().catch(() => undefined), deps.minutes * 60_000);
  return () => clearInterval(timer);
}
