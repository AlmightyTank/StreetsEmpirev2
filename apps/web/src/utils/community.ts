import {
  ADMIN_SUSPENSION_LENGTHS,
  discordTimeoutFor,
  type AdminCommunityDto,
  type AdminDiscordTimeoutLength,
  type AdminSuspensionLength,
} from '@streets/shared';

/** What a game suspension or ban can also do elsewhere, when the admin ticks it. */
export interface EverywhereOptions {
  forum: boolean;
  discord: boolean;
}

export type EverywhereStep =
  | { platform: 'forum'; length: AdminSuspensionLength }
  | { platform: 'discord'; length: AdminDiscordTimeoutLength };

/** Whether each platform can take part right now: linked, set up, and (for Discord) in reach. */
export function everywhereAvailable(community: AdminCommunityDto | null): EverywhereOptions {
  const forum = community?.forum.linked ? community.forum.moderationEnabled && !community.forum.problem : false;
  const discord = community?.discord.linked ? community.discord.moderationEnabled && community.discord.canModerate : false;
  return { forum, discord };
}

/**
 * The extra steps for a game suspension (the same length on the forum, the longest
 * Discord timeout that does not outlast it) or a ban (the longest of each).
 */
export function everywhereSteps(action: 'suspend' | 'ban', length: AdminSuspensionLength, chosen: EverywhereOptions): EverywhereStep[] {
  const longest = ADMIN_SUSPENSION_LENGTHS[ADMIN_SUSPENSION_LENGTHS.length - 1]!;
  const forumLength = action === 'ban' ? longest.key : length;
  const hours = action === 'ban' ? Infinity : ADMIN_SUSPENSION_LENGTHS.find((option) => option.key === length)?.hours ?? 0;
  const steps: EverywhereStep[] = [];
  if (chosen.forum) steps.push({ platform: 'forum', length: forumLength });
  if (chosen.discord) steps.push({ platform: 'discord', length: hours === Infinity ? '28d' : discordTimeoutFor(hours) });
  return steps;
}

/** One line per platform for the notice: what happened, or why it did not. */
export function everywhereSummary(results: Array<{ step: EverywhereStep; error: string | null }>): string {
  return results.map(({ step, error }) => {
    const name = step.platform === 'forum' ? 'Forum' : 'Discord';
    if (error) return `${name}: not done (${error})`;
    return step.platform === 'forum' ? `Forum: suspended for ${labelFor(step.length)}.` : `Discord: timed out for ${labelFor(step.length)}.`;
  }).join(' ');
}

function labelFor(length: string): string {
  return { '1h': '1 hour', '1d': '1 day', '3d': '3 days', '7d': '7 days', '14d': '14 days', '28d': '28 days', '30d': '30 days', '90d': '90 days' }[length] ?? length;
}
