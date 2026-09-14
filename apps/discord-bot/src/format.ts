import type { APIEmbed } from 'discord.js';
import { formatCents } from '@streets/shared';
import type { HallOfFame, Member, NewsFeed, ProfileCard, Rankings, RoundStatus } from './game-api.js';
import type { MemberSyncResult, SyncSummary } from './sync.js';

export const BRAND_COLOR = 0xb6ff3a;
const MUTED_COLOR = 0x6b7480;
const MEDALS = ['🥇', '🥈', '🥉'];

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

function badgeList(card: ProfileCard, limit?: number): string {
  const badges = limit === undefined ? card.badges : card.badges.slice(0, limit);
  return badges.length
    ? badges.map((badge) => `${badge.permanent ? '◆ ' : ''}${escapeMarkdown(badge.title)}`).join(' · ')
    : 'None yet';
}

function bestRank(card: ProfileCard): string {
  return card.legacy.bestNationalRank === null ? '—' : `#${card.legacy.bestNationalRank}`;
}

function noRound(origin: string): APIEmbed {
  return { title: 'No game running', description: 'There is no round open right now. Check back soon.', url: origin, color: MUTED_COLOR };
}

export function profileEmbed(card: ProfileCard): APIEmbed {
  return {
    title: truncate(`${card.displayName} (#${card.publicPimpId})`, 256),
    url: card.profileUrl,
    color: BRAND_COLOR,
    description: `${escapeMarkdown(card.city)} · ${escapeMarkdown(card.roundName)}`,
    fields: [
      { name: 'Net worth', value: formatCents(card.netWorthCents), inline: true },
      { name: 'National rank', value: `#${card.rank.national}${movementText(card.rank.nationalMovement)}`, inline: true },
      { name: 'Local rank', value: `#${card.rank.local}`, inline: true },
      { name: 'Badges', value: truncate(badgeList(card), 1024) },
      { name: 'Legacy', value: `${card.legacy.roundsPlayed} past rounds · ${card.legacy.roundWins} wins · best ${bestRank(card)}` },
      ...(card.forumProfileUrl ? [{ name: 'Forum', value: `[Forum profile](${card.forumProfileUrl})` }] : []),
    ],
  };
}

function compareColumn(card: ProfileCard): string {
  return truncate([
    `**${formatCents(card.netWorthCents)}**`,
    `National #${card.rank.national}${movementText(card.rank.nationalMovement)}`,
    `${escapeMarkdown(card.city)} #${card.rank.local}`,
    `Badges: ${badgeList(card, 4)}`,
    `Legacy: ${card.legacy.roundWins} wins · best ${bestRank(card)}`,
    `[Profile](${card.profileUrl})`,
  ].join('\n'), 1024);
}

export function compareEmbed(a: ProfileCard, b: ProfileCard): APIEmbed {
  const difference = a.netWorthCents - b.netWorthCents;
  const lead = difference === 0
    ? 'Dead even on net worth.'
    : `${escapeMarkdown(difference > 0 ? a.displayName : b.displayName)} leads by ${formatCents(Math.abs(difference))}.`;
  return {
    title: truncate(`${a.displayName} vs ${b.displayName}`, 256),
    color: BRAND_COLOR,
    description: `${escapeMarkdown(a.roundName)} · ${lead}`,
    fields: [
      { name: truncate(`${a.displayName} (#${a.publicPimpId})`, 256), value: compareColumn(a), inline: true },
      { name: truncate(`${b.displayName} (#${b.publicPimpId})`, 256), value: compareColumn(b), inline: true },
    ],
  };
}

export function rankingsEmbed(rankings: Rankings, origin: string): APIEmbed {
  if (!rankings.round) return noRound(origin);
  const city = rankings.city ?? null;
  const lines = rankings.entries.map((entry) =>
    `**#${entry.rank}** [${escapeMarkdown(truncate(entry.displayName, 40))}](${entry.profileUrl}) · ${formatCents(entry.netWorthCents)} · ${escapeMarkdown(entry.city)}${movementText(entry.movement)}`);
  return {
    title: `${rankings.round.name} · ${city ? `${city.name} · ` : ''}Top ${rankings.entries.length || 10}`,
    url: `${origin}/game/rankings`,
    color: BRAND_COLOR,
    description: lines.length
      ? truncate(lines.join('\n'), 4096)
      : city ? `Nobody in ${escapeMarkdown(city.name)} has joined this round yet.` : 'Nobody has joined this round yet.',
  };
}

export function hallOfFameEmbed(hallOfFame: HallOfFame, origin: string): APIEmbed {
  if (!hallOfFame.rounds.length) {
    return { title: 'Hall of Fame', url: origin, color: BRAND_COLOR, description: 'No round has finished yet. The first winners land here.' };
  }
  return {
    title: 'Hall of Fame',
    url: origin,
    color: BRAND_COLOR,
    fields: hallOfFame.rounds.map((round) => ({
      name: truncate(`${round.name} · ${round.endedAt.slice(0, 10)}`, 256),
      value: round.podium.length
        ? truncate(round.podium.map((player) =>
          `${MEDALS[player.rank - 1] ?? `#${player.rank}`} ${escapeMarkdown(player.displayName)} · ${formatCents(player.netWorthCents)} · ${escapeMarkdown(player.city)}`).join('\n'), 1024)
        : 'No final standings recorded.',
    })),
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

/** Private: only the member sees it, so their account username is fine here. */
export function memberEmbed(member: Member, roleNames: string[], origin: string): APIEmbed {
  if (!member.linked) {
    return {
      title: 'Discord not linked',
      color: MUTED_COLOR,
      description: [
        "Your Discord isn't linked to a Street Empire account.",
        '',
        `1. Sign in with Discord at ${origin}/login, or link it from ${origin}/account if you already play.`,
        '2. Run /sync here, or wait a few minutes for your roles.',
      ].join('\n'),
    };
  }
  return {
    title: 'Your Street Empire link',
    color: BRAND_COLOR,
    fields: [
      { name: 'Game account', value: escapeMarkdown(member.username ?? '—'), inline: true },
      { name: 'Forum', value: member.forumUsername ? escapeMarkdown(member.forumUsername) : 'Not linked', inline: true },
      {
        name: truncate(member.roundName ? `This round (${member.roundName})` : 'This round', 256),
        value: member.player
          ? `[${escapeMarkdown(member.player.displayName)} (#${member.player.publicPimpId})](${member.player.profileUrl})`
          : member.roundName ? `Not joined yet · [Join](${origin}/join)` : 'No game running',
      },
      { name: 'Roles you qualify for', value: roleNames.length ? truncate(roleNames.join(', '), 1024) : 'None' },
    ],
    footer: { text: 'Roles update every few minutes. Run /sync to update now.' },
  };
}

/** [usage, description]; the first word of each usage must be a registered command (tested). */
export const HELP_LINES: Array<[string, string]> = [
  ['/profile [user] [name]', 'A public profile. No option shows yours.'],
  ['/compare player [with]', 'Two players side by side. Names or @mentions; "with" defaults to you.'],
  ['/rankings', 'National top 10 this round.'],
  ['/city name', 'Top 10 in one city this round.'],
  ['/halloffame', 'Podiums from recent finished rounds.'],
  ['/round', 'Round status and time left.'],
  ['/news', 'Latest news posts.'],
  ['/link', 'Your link status and the roles you qualify for. Only you see it.'],
  ['/sync', 'Update your roles now (once a minute).'],
  ['/help', 'This list. Only you see it.'],
  ['/syncall', 'Mods: re-sync roles for every member. Needs Manage Roles.'],
];

export function helpEmbed(origin: string): APIEmbed {
  return {
    title: 'Street Empire bot',
    url: origin,
    color: BRAND_COLOR,
    description: HELP_LINES.map(([usage, description]) => `\`${usage}\` · ${description}`).join('\n'),
  };
}

export function syncMemberText(result: MemberSyncResult): string {
  if (!result.added.length && !result.removed.length) return 'Your roles are already up to date.';
  return [
    result.added.length ? `Added: ${result.added.join(', ')}` : '',
    result.removed.length ? `Removed: ${result.removed.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

export function syncAllText(summary: SyncSummary): string {
  const text = `Synced ${summary.members} members: ${summary.added} roles added, ${summary.removed} removed.`;
  return summary.failed ? `${text} ${summary.failed} members could not be updated; check the bot log.` : text;
}
