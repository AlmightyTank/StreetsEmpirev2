import type { APIEmbed } from 'discord.js';
import { formatCents, formatNumber } from '@streets/shared';
import type {
  AlertSettings,
  AlertType,
  AllianceAlert,
  AllianceCard,
  BadgeCard,
  BattleEvent,
  CrackdownEvent,
  HallOfFame,
  History,
  Leaderboard,
  Member,
  NewsCreated,
  NewsFeed,
  NewsPost,
  ProfileCard,
  RankAlert,
  Rankings,
  RoundEvent,
  RoundStatus,
  Stats,
  TerritoryEvent,
  TurfAlert,
  TurfCity,
  TurfEvent,
  TurnReminder,
} from './game-api.js';
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

export function leaderboardEmbed(leaderboard: Leaderboard, origin: string): APIEmbed {
  if (!leaderboard.round) return noRound(origin);
  const lines = leaderboard.entries.map((entry) =>
    `**#${entry.rank}** [${escapeMarkdown(truncate(entry.displayName, 40))}](${entry.profileUrl}) · ${formatNumber(entry.value)} · ${escapeMarkdown(entry.city)}`);
  return {
    title: `${leaderboard.round.name} · ${leaderboard.label}`,
    url: `${origin}/game/rankings`,
    color: BRAND_COLOR,
    description: lines.length ? truncate(lines.join('\n'), 4096) : `Nobody has posted a ${leaderboard.label.toLowerCase()} score yet.`,
  };
}

export function turfCityEmbed(turf: TurfCity, origin: string): APIEmbed {
  const control = turf.control
    ? `[${escapeMarkdown(turf.control.alliance.tag)}] ${escapeMarkdown(turf.control.alliance.name)} controls ${turf.control.blocksHeld}/${turf.control.blocksTotal} blocks.`
    : 'No alliance controls this city right now.';
  return {
    title: `${escapeMarkdown(turf.roundName)} · ${escapeMarkdown(turf.city.name)} turf`,
    url: `${origin}/game/turf`,
    color: BRAND_COLOR,
    description: control,
    fields: turf.blocks.map((block) => {
      const owner = block.holder
        ? `${block.holder.alliance ? `[${escapeMarkdown(block.holder.alliance.tag)}] ` : ''}${escapeMarkdown(block.holder.displayName)} (#${block.holder.publicPimpId})`
        : block.vacant ? 'Vacant' : `Locals · ${formatNumber(block.localsThugs)} thugs`;
      const garrison = block.holder
        ? `Garrison: ${formatNumber(block.cornerThugs)} thugs · ${formatNumber(block.cornerGuns)} guns`
        : block.vacant ? 'The locals have not reclaimed this block yet.' : 'Held by the locals.';
      const shield = block.shieldUntil ? ` · shield until ${block.shieldUntil.slice(0, 16).replace('T', ' ')} UTC` : '';
      return {
        name: escapeMarkdown(block.districtName),
        value: `${owner}\n${garrison}${shield}`,
        inline: true,
      };
    }),
  };
}

export function allianceEmbed(card: AllianceCard, origin: string): APIEmbed {
  const alliance = card.alliance;
  const roster = alliance.members.map((member) =>
    `${member.isLeader ? '★ ' : ''}[${escapeMarkdown(member.displayName)}](${origin}/game/players/${member.publicPimpId}) · #${member.nationalRank} · ${formatCents(member.netWorthCents)}`);
  const cities = card.turf.cities.map((city) =>
    `${city.controls ? '👑 ' : ''}**${escapeMarkdown(city.name)}** · ${city.blocksHeld}/${city.blocksTotal} blocks`);
  const recent = card.turf.recent.map((event) =>
    `${escapeMarkdown(event.cityName)} / ${escapeMarkdown(event.districtName)} · ${escapeMarkdown(event.attackerName)} took it from ${escapeMarkdown(event.defenderName)}`);
  return {
    title: `[${escapeMarkdown(alliance.tag)}] ${escapeMarkdown(alliance.name)}`,
    url: `${origin}/game/alliances/${encodeURIComponent(alliance.tag)}`,
    color: BRAND_COLOR,
    description: `${escapeMarkdown(card.roundName)} · Alliance #${alliance.rank} · ${formatCents(alliance.combinedNetWorthCents)} combined`,
    fields: [
      {
        name: 'Leadership',
        value: alliance.leader
          ? `[${escapeMarkdown(alliance.leader.displayName)}](${origin}/game/players/${alliance.leader.publicPimpId}) · ${alliance.memberCount}/${alliance.maxMembers} members`
          : `${alliance.memberCount}/${alliance.maxMembers} members`,
        inline: true,
      },
      {
        name: 'Turf',
        value: `${card.turf.blocksHeld} block${card.turf.blocksHeld === 1 ? '' : 's'} · ${card.turf.citiesControlled} ${card.turf.citiesControlled === 1 ? 'city' : 'cities'} controlled`,
        inline: true,
      },
      { name: 'Roster', value: roster.length ? truncate(roster.join('\n'), 1024) : 'No active members.' },
      ...(cities.length ? [{ name: 'Territory', value: truncate(cities.join('\n'), 1024) }] : []),
      ...(recent.length ? [{ name: 'Recent turf', value: truncate(recent.join('\n'), 1024) }] : []),
      ...(alliance.forumUrl ? [{ name: 'Recruitment', value: `[Forum thread](${alliance.forumUrl})` }] : []),
    ],
  };
}

export function historyEmbed(history: History, origin: string): APIEmbed {
  const lines = history.rounds.map((round) => {
    const rank = round.rank === null ? 'unranked' : `#${round.rank}`;
    return `**${escapeMarkdown(round.name)}** · ${rank} · ${formatCents(round.netWorthCents)} · ${escapeMarkdown(round.city)} · ${round.endedAt.slice(0, 10)}`;
  });
  return {
    title: `${history.displayName} · History`,
    url: origin,
    color: BRAND_COLOR,
    description: lines.length ? truncate(lines.join('\n'), 4096) : 'No finished rounds yet.',
    fields: [
      { name: 'Legacy', value: `${history.legacy.roundsPlayed} rounds · ${history.legacy.roundWins} wins · best ${history.legacy.bestNationalRank === null ? '—' : `#${history.legacy.bestNationalRank}`}` },
    ],
  };
}

export function statsEmbed(stats: Stats): APIEmbed {
  return {
    title: `${stats.displayName} (#${stats.publicPimpId}) · Private stats`,
    url: stats.profileUrl,
    color: BRAND_COLOR,
    description: escapeMarkdown(stats.roundName),
    fields: [
      { name: 'Money', value: `Cash ${formatCents(stats.cashCents)}\nNet worth ${formatCents(stats.netWorthCents)}\nPayout ${stats.payoutPercent}%`, inline: true },
      { name: 'Turns', value: `${stats.turns.turns}/${stats.turns.cap}\n+${stats.turns.perTick} next tick`, inline: true },
      { name: 'Rank', value: `National ${stats.rank.national === null ? '—' : `#${stats.rank.national}`}\nLocal ${stats.rank.local === null ? '—' : `#${stats.rank.local}`}`, inline: true },
      { name: 'Crew', value: `${formatNumber(stats.crew.whores)} whores\n${formatNumber(stats.crew.fitThugs)}/${formatNumber(stats.crew.thugs)} thugs fit\n${formatNumber(stats.crew.armedThugs)} armed`, inline: true },
      { name: 'Weapons', value: `${formatNumber(stats.weapons.pistols)} pistols\n${formatNumber(stats.weapons.shotguns)} shotguns\n${formatNumber(stats.weapons.tek9s)} Tek-9s\n${formatNumber(stats.weapons.ak47s)} AK-47s`, inline: true },
      { name: 'Supplies', value: `${formatNumber(stats.supplies.condoms)} condoms\n${formatNumber(stats.supplies.medicine)} medicine\n${formatNumber(stats.supplies.crack)} crack\n${formatNumber(stats.supplies.beer)} beer\n${formatNumber(stats.lowRiders)} low-riders`, inline: true },
      { name: 'Happiness', value: `Whores ${stats.happiness.whore}% · Thugs ${stats.happiness.thug}%` },
    ],
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

function roundStatusLabel(status: string): string {
  return status === 'REGISTRATION' ? 'Registration open' : status.charAt(0) + status.slice(1).toLowerCase();
}

export function roundEmbed(status: RoundStatus, origin: string): APIEmbed {
  if (!status.round) return noRound(origin);
  const statusLabel = roundStatusLabel(status.round.status);
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
    title: 'StreetsEmpire news',
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
        "Your Discord isn't linked to a StreetsEmpire account.",
        '',
        `1. Sign in with Discord at ${origin}/login, or link it from ${origin}/account if you already play.`,
        '2. Run /sync here, or wait a few minutes for your roles.',
      ].join('\n'),
    };
  }
  return {
    title: 'Your StreetsEmpire link',
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
  ['/badges [user] [name]', 'Every achievement: what a player has earned and what they are closest to.'],
  ['/compare player [with]', 'Two players side by side. Names or @mentions; "with" defaults to you.'],
  ['/rankings', 'National top 10 this round.'],
  ['/leaderboard stat', 'Top combat and intel counts this round.'],
  ['/history [user] [name]', 'Past finished rounds for a player. No option shows yours.'],
  ['/city name', 'Top 10 in one city this round.'],
  ['/turf city', 'Public block holders, garrisons and city control.'],
  ['/alliance [tag]', 'Alliance roster, standing and turf. No tag shows yours.'],
  ['/halloffame', 'Podiums from recent finished rounds.'],
  ['/round', 'Round status and time left.'],
  ['/news', 'Latest news posts.'],
  ['/invite', 'How to start playing and get your roles.'],
  ['/link', 'Your link status and the roles you qualify for. Only you see it.'],
  ['/stats', 'Your private cash, crew, weapons, supplies and turns. Only you see it.'],
  ['/alerts type enabled', 'DM alerts for attacks, turf, alliance control, rounds, rank drops and full turns. Only you see it.'],
  ['/remind turns', 'Shortcut for /alerts type:turns. Only you see it.'],
  ['/sync', 'Update your roles now (once a minute).'],
  ['/help', 'This list. Only you see it.'],
  ['/announce title body', 'Game admins: post news from Discord. Only you see the result.'],
  ['/syncall', 'Mods: re-sync roles for every member. Needs Manage Roles.'],
];

export function helpEmbed(origin: string): APIEmbed {
  return {
    title: 'StreetsEmpire bot',
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

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'] as const;

type Award = BadgeCard['awards'][number];

function progressText(award: Award): string {
  const progress = award.progress;
  if (!progress) return '';
  const value = (amount: number) => (progress.label === 'net worth' ? formatCents(amount) : formatNumber(amount));
  return `${value(Math.min(progress.current, progress.target))} / ${value(progress.target)} ${progress.label}`;
}

export function badgesEmbed(card: BadgeCard): APIEmbed {
  const earned = card.awards.filter((award) => award.unlocked);
  const ratio = (award: Award) => (award.progress && award.progress.target > 0 ? award.progress.current / award.progress.target : 0);
  const closest = card.awards.filter((award) => !award.unlocked).sort((a, b) => ratio(b) - ratio(a)).slice(0, 8);
  const earnedLines = RARITY_ORDER.map((rarity) => {
    const titles = earned
      .filter((award) => award.rarity === rarity)
      .map((award) => `${award.category === 'legacy' || award.category === 'quest' ? '◆ ' : ''}${escapeMarkdown(award.title)}`);
    return titles.length ? `**${rarity.charAt(0).toUpperCase()}${rarity.slice(1)}:** ${titles.join(', ')}` : '';
  }).filter(Boolean);

  return {
    title: truncate(`${card.displayName} (#${card.publicPimpId}) · Badges`, 256),
    url: card.profileUrl,
    color: BRAND_COLOR,
    description: escapeMarkdown(card.roundName),
    fields: [
      { name: `Earned (${earned.length}/${card.awards.length})`, value: earnedLines.length ? truncate(earnedLines.join('\n'), 1024) : 'None yet' },
      ...(closest.length
        ? [{
          name: 'Closest to unlocking',
          value: truncate(closest.map((award) => {
            const progress = progressText(award);
            return progress ? `${escapeMarkdown(award.title)} · ${progress}` : escapeMarkdown(award.title);
          }).join('\n'), 1024),
        }]
        : []),
    ],
    footer: { text: '◆ = permanent badge' },
  };
}

export function inviteEmbed(status: RoundStatus | null, origin: string): APIEmbed {
  const round = status?.round ?? null;
  return {
    title: 'Play StreetsEmpire',
    url: origin,
    color: BRAND_COLOR,
    description: round
      ? `**${escapeMarkdown(round.name)}** · ${roundStatusLabel(round.status).toLowerCase()} · ${round.msRemaining > 0 ? `${formatRemaining(round.msRemaining)} left` : 'ended'} · ${round.playerCount} players`
      : 'No round is running right now. Claim your name so you are ready for the next one.',
    fields: [
      { name: '1. Claim your name', value: `[Register](${origin}/register), or sign in with Discord.` },
      { name: '2. Join the round', value: `[Enter the game](${origin}/join) and pick up your first turns.` },
      { name: '3. Get your roles', value: `Link Discord under [Account](${origin}/account), then run /sync here.` },
    ],
  };
}

/** One automatic news channel post. */
export function newsPostEmbed(post: NewsPost): APIEmbed {
  return {
    title: truncate(`${post.isPinned ? '📌 ' : ''}${post.title}`, 256),
    url: post.url,
    color: BRAND_COLOR,
    description: truncate(escapeMarkdown(post.body), 1500),
    footer: { text: post.authorName ? `Posted by ${post.authorName}` : 'StreetsEmpire news' },
    timestamp: post.publishedAt,
  };
}

export function turnReminderEmbed(reminder: TurnReminder): APIEmbed {
  return {
    title: 'Your turns are full',
    url: reminder.url,
    color: BRAND_COLOR,
    description: `${escapeMarkdown(reminder.displayName)} is at ${reminder.turns}/${reminder.cap} turns in ${escapeMarkdown(reminder.roundName)}. Spend some before new ones go to waste.`,
    footer: { text: 'Turn these off with /alerts type:turns enabled:Off in the StreetsEmpire server.' },
  };
}

export function alertText(state: AlertSettings, type: AlertType, enabled: boolean): string {
  if (!enabled) return `${alertLabel(type)} alerts are off.`;
  if (type !== 'turns') return `${alertLabel(type)} alerts are on. Keep DMs from server members allowed so they reach you.`;
  const where = state.current
    ? ` You're at ${state.current.turns}/${state.current.cap} now.`
    : state.roundName
      ? ` You haven't joined ${state.roundName} yet; reminders start once you do.`
      : ' No round is running; reminders start with the next one.';
  return `Turn reminders are on. I'll DM you once each time your turns fill up.${where} Keep DMs from server members allowed so they reach you.`;
}

export function reminderText(state: AlertSettings): string {
  return alertText(state, 'turns', state.alerts.turns);
}

export function newsCreatedText(news: NewsCreated): string {
  return `Posted "${news.title}"${news.roundName ? ` for ${news.roundName}` : ' globally'}. It will be picked up by the news channel.`;
}

function alertLabel(type: AlertType): string {
  switch (type) {
    case 'attacks': return 'Attack';
    case 'round': return 'Round';
    case 'rank': return 'Rank';
    case 'turns': return 'Turn';
    case 'turf': return 'Turf';
    case 'alliance': return 'Alliance';
  }
}

function battleKind(kind: BattleEvent['kind']): string {
  switch (kind) {
    case 'RAID': return 'Raid';
    case 'DRIVE_BY': return 'Drive-by';
    case 'DRUG_HOES': return 'Drug hoes';
    case 'STEAL_RIDE': return 'Steal ride';
    case 'LURE_CREW': return 'Lure crew';
  }
}

export function battleFeedEmbed(battle: BattleEvent): APIEmbed {
  const winner = battle.attackerWon ? battle.attackerName : battle.defenderName;
  return {
    title: `${battleKind(battle.kind)} · ${battle.attackerWon ? 'Attacker won' : 'Defender held'}`,
    color: battle.attackerWon ? BRAND_COLOR : MUTED_COLOR,
    description: `[${escapeMarkdown(battle.attackerName)}](${battle.attackerProfileUrl}) hit [${escapeMarkdown(battle.defenderName)}](${battle.defenderProfileUrl}) in ${escapeMarkdown(battle.roundName)}.\nWinner: ${escapeMarkdown(winner)}.`,
    timestamp: battle.createdAt,
  };
}

export function turfFeedEmbed(event: TurfEvent): APIEmbed {
  const newHolder = event.attackerAllianceTag
    ? `[${escapeMarkdown(event.attackerAllianceTag)}] ${escapeMarkdown(event.attackerName)}`
    : escapeMarkdown(event.attackerName);
  return {
    title: `${escapeMarkdown(event.cityName)} · ${escapeMarkdown(event.districtName)} changed hands`,
    color: BRAND_COLOR,
    description: `[${escapeMarkdown(event.defenderName)}](${event.defenderProfileUrl}) lost the block to [${newHolder}](${event.attackerProfileUrl}) in ${escapeMarkdown(event.roundName)}.`,
    timestamp: event.settledAt,
  };
}

export function turfAlertEmbed(event: TurfAlert): APIEmbed {
  return {
    ...turfFeedEmbed(event),
    title: `Your ${escapeMarkdown(event.districtName)} turf was taken`,
    footer: { text: 'Turn these off with /alerts type:turf enabled:Off.' },
  };
}

export function allianceAlertEmbed(event: AllianceAlert): APIEmbed {
  return {
    ...territoryFeedEmbed(event),
    title: `Alliance alert · [${escapeMarkdown(event.allianceTag)}] ${event.change === 'gained' ? 'gained' : 'lost'} control`,
    footer: { text: 'Turn these off with /alerts type:alliance enabled:Off.' },
  };
}

export function territoryFeedEmbed(event: TerritoryEvent): APIEmbed {
  const previous = event.previous ? `[${escapeMarkdown(event.previous.tag)}] ${escapeMarkdown(event.previous.name)}` : null;
  const next = event.next ? `[${escapeMarkdown(event.next.tag)}] ${escapeMarkdown(event.next.name)}` : null;
  const description = previous && next
    ? `${next} took control of ${escapeMarkdown(event.cityName)} from ${previous} · ${event.next!.blocksHeld}/${event.blocksTotal} blocks.`
    : next
      ? `${next} took control of ${escapeMarkdown(event.cityName)} · ${event.next!.blocksHeld}/${event.blocksTotal} blocks.`
      : previous
        ? `${previous} lost control of ${escapeMarkdown(event.cityName)}. No alliance controls it now.`
        : `Control of ${escapeMarkdown(event.cityName)} changed.`;
  return {
    title: `${escapeMarkdown(event.cityName)} · city control changed`,
    color: event.next ? BRAND_COLOR : MUTED_COLOR,
    description: `${description}\n${escapeMarkdown(event.roundName)}`,
    timestamp: event.happenedAt,
  };
}

export function crackdownFeedEmbed(event: CrackdownEvent): APIEmbed {
  const warning = event.phase === 'warning';
  const description = warning
    ? `Word is the Feds are sweeping **${escapeMarkdown(event.cityName)}** tomorrow. Turf crews have until then to pull out.`
    : event.thugsPickedUp > 0
      ? `The Feds swept **${escapeMarkdown(event.cityName)}**. ${event.thugsPickedUp} corner men were picked up across ${event.holdersAffected} crew${event.holdersAffected === 1 ? '' : 's'}.`
      : event.holdersAffected > 0
        ? `The Feds swept **${escapeMarkdown(event.cityName)}**. ${event.holdersAffected} crew${event.holdersAffected === 1 ? ' was' : 's were'} caught holding corners, but nobody was picked up.`
        : `The Feds swept **${escapeMarkdown(event.cityName)}**, but the corners were already clear.`;
  return {
    title: warning
      ? `${escapeMarkdown(event.cityName)} · Federal sweep incoming`
      : `${escapeMarkdown(event.cityName)} · Federal sweep landed`,
    color: warning ? BRAND_COLOR : MUTED_COLOR,
    description: `${description}\n${escapeMarkdown(event.roundName)}`,
    timestamp: warning ? event.warningAt : event.sweepAt,
  };
}

export function attackAlertEmbed(battle: BattleEvent): APIEmbed {
  return {
    ...battleFeedEmbed(battle),
    title: `${battleKind(battle.kind)} against you`,
    footer: { text: 'Turn these off with /alerts type:attacks enabled:Off.' },
  };
}

export function rankAlertEmbed(alert: RankAlert): APIEmbed {
  const description = alert.kind === 'lost-first'
    ? `${escapeMarkdown(alert.displayName)} lost national #1${alert.leaderName ? ` to ${escapeMarkdown(alert.leaderName)}` : ''}.`
    : `${escapeMarkdown(alert.displayName)} fell out of the national top 10.`;
  return {
    title: `Rank alert · ${alert.roundName}`,
    url: alert.url,
    color: MUTED_COLOR,
    description: `${description}\nCurrent national rank: #${alert.rank}.`,
    footer: { text: 'Turn these off with /alerts type:rank enabled:Off.' },
  };
}

export function roundEventEmbed(event: RoundEvent): APIEmbed {
  const title = event.type === 'opened'
    ? `${event.roundName} is open`
    : event.type === 'ending-soon'
      ? `${event.roundName} ends soon`
      : `${event.roundName} has ended`;
  return {
    title,
    url: event.url,
    color: event.type === 'ended' ? MUTED_COLOR : BRAND_COLOR,
    description: event.type === 'ended' && event.standings.length
      ? truncate(event.standings.map((entry) => `**#${entry.rank}** [${escapeMarkdown(entry.displayName)}](${entry.profileUrl}) · ${formatCents(entry.netWorthCents)} · ${escapeMarkdown(entry.city)}`).join('\n'), 4096)
      : `${roundStatusLabel(event.status)} · ${event.endsAt.slice(0, 10)}`,
  };
}
