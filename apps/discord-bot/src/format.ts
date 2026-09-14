import type { APIEmbed } from 'discord.js';
import { formatCents } from '@streets/shared';
import type { NewsFeed, ProfileCard, Rankings, RoundStatus } from './game-api.js';

export const BRAND_COLOR = 0xb6ff3a;
const MUTED_COLOR = 0x6b7480;

/** Player-chosen text must not format replies. Mentions are separately disabled on every reply. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_~|>[\]()#-]/g, (char) => `\\${char}`);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Ended';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}

export function movementText(movement: number | null): string {
  if (movement === null || movement === 0) return '';
  return movement > 0 ? ` ▲${movement}` : ` ▼${Math.abs(movement)}`;
}

function noRound(origin: string): APIEmbed {
  return { title: 'No game running', description: 'There is no round open right now. Check back soon.', url: origin, color: MUTED_COLOR };
}

export function profileEmbed(card: ProfileCard): APIEmbed {
  const badges = card.badges.length
    ? card.badges.map((badge) => `${badge.permanent ? '◆ ' : ''}${escapeMarkdown(badge.title)}`).join(' · ')
    : 'None yet';
  const best = card.legacy.bestNationalRank === null ? '—' : `#${card.legacy.bestNationalRank}`;
  return {
    title: truncate(`${card.displayName} (#${card.publicPimpId})`, 256),
    url: card.profileUrl,
    color: BRAND_COLOR,
    description: `${escapeMarkdown(card.city)} · ${escapeMarkdown(card.roundName)}`,
    fields: [
      { name: 'Net worth', value: formatCents(card.netWorthCents), inline: true },
      { name: 'National rank', value: `#${card.rank.national}${movementText(card.rank.nationalMovement)}`, inline: true },
      { name: 'Local rank', value: `#${card.rank.local}`, inline: true },
      { name: 'Badges', value: truncate(badges, 1024) },
      { name: 'Legacy', value: `${card.legacy.roundsPlayed} past rounds · ${card.legacy.roundWins} wins · best ${best}` },
      ...(card.forumProfileUrl ? [{ name: 'Forum', value: `[Forum profile](${card.forumProfileUrl})` }] : []),
    ],
  };
}

export function rankingsEmbed(rankings: Rankings, origin: string): APIEmbed {
  if (!rankings.round) return noRound(origin);
  const lines = rankings.entries.map((entry) =>
    `**#${entry.rank}** [${escapeMarkdown(truncate(entry.displayName, 40))}](${entry.profileUrl}) · ${formatCents(entry.netWorthCents)} · ${escapeMarkdown(entry.city)}${movementText(entry.movement)}`);
  return {
    title: `${rankings.round.name} · Top ${rankings.entries.length || 10}`,
    url: `${origin}/game/rankings`,
    color: BRAND_COLOR,
    description: lines.length ? truncate(lines.join('\n'), 4096) : 'Nobody has joined this round yet.',
  };
}

export function roundEmbed(status: RoundStatus, origin: string): APIEmbed {
  if (!status.round) return noRound(origin);
  const statusLabel = status.round.status === 'REGISTRATION' ? 'Registration open' : status.round.status.charAt(0) + status.round.status.slice(1).toLowerCase();
  return {
    title: status.round.name,
    url: origin,
    color: BRAND_COLOR,
    fields: [
      { name: 'Status', value: statusLabel, inline: true },
      { name: 'Time left', value: formatRemaining(status.round.msRemaining), inline: true },
      { name: 'Players', value: String(status.round.playerCount), inline: true },
      ...(status.turns ? [{ name: 'Turns', value: `+${status.turns.amountPerInterval} every ${status.turns.intervalMinutes} min, up to ${status.turns.cap}` }] : []),
      ...(status.ruleset ? [{ name: 'Ruleset', value: status.ruleset.name }] : []),
    ],
  };
}

export function newsEmbed(feed: NewsFeed, origin: string, limit = 5): APIEmbed {
  const posts = feed.news.slice(0, limit);
  return {
    title: 'Street Empire news',
    url: `${origin}/game/news`,
    color: BRAND_COLOR,
    ...(posts.length
      ? {
        fields: posts.map((post) => ({
          name: truncate(`${post.isPinned ? '📌 ' : ''}${post.title}`, 256),
          value: truncate(`${escapeMarkdown(truncate(post.body, 300))}\n-# ${post.publishedAt.slice(0, 10)}${post.authorName ? ` · ${escapeMarkdown(post.authorName)}` : ''}`, 1024),
        })),
      }
      : { description: 'No round news has been posted yet.' }),
  };
}
