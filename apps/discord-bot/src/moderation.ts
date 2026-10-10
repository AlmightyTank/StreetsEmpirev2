import { PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import { MemberActionError, type DiscordMemberStatus } from './push-server.js';

/**
 * Discord moderation for the admin account page: a member's status, and timeouts.
 * The game audits who asked; the reason is also recorded in Discord's audit log.
 */

/** Why the bot can't time this member out, or null when it can. */
export function timeoutProblem(input: {
  botCanModerate: boolean;
  isOwner: boolean;
  isAdministrator: boolean;
  aboveBot: boolean;
}): string | null {
  if (!input.botCanModerate) return 'The bot needs the Moderate Members permission in this server.';
  if (input.isOwner) return 'They own the Discord server, so nobody can time them out.';
  if (input.isAdministrator) return 'They have Administrator in Discord, and Discord never times out administrators.';
  if (input.aboveBot) return "Their highest role is at or above the bot's. Move the bot's role above it in Server Settings → Roles.";
  return null;
}

async function statusOf(guild: Guild, member: GuildMember | null): Promise<DiscordMemberStatus> {
  if (!member) return { inServer: false, displayName: null, timedOutUntil: null, canModerate: false, problem: 'They are not in the Discord server.' };
  const me = await guild.members.fetchMe();
  const problem = timeoutProblem({
    botCanModerate: me.permissions.has(PermissionFlagsBits.ModerateMembers),
    isOwner: member.id === guild.ownerId,
    isAdministrator: member.permissions.has(PermissionFlagsBits.Administrator),
    aboveBot: member.roles.highest.comparePositionTo(me.roles.highest) >= 0,
  });
  const until = member.communicationDisabledUntil;
  return {
    inServer: true,
    displayName: member.displayName,
    timedOutUntil: until && until.getTime() > Date.now() ? until.toISOString() : null,
    canModerate: problem === null,
    problem,
  };
}

export async function memberStatus(guild: Guild, discordId: string): Promise<DiscordMemberStatus> {
  return statusOf(guild, await guild.members.fetch({ user: discordId, force: true }).catch(() => null));
}

/** Time a member out for `minutes`, or lift a timeout with null. Refusals come back as MemberActionError. */
export async function timeoutMember(guild: Guild, input: { discordId: string; minutes: number | null; reason: string }): Promise<DiscordMemberStatus> {
  const member = await guild.members.fetch({ user: input.discordId, force: true }).catch(() => null);
  const before = await statusOf(guild, member);
  if (!member) throw new MemberActionError(before.problem ?? 'They are not in the Discord server.');
  if (!before.canModerate) throw new MemberActionError(before.problem ?? 'The bot cannot time them out.');
  if (input.minutes === null && !before.timedOutUntil) throw new MemberActionError('They are not timed out.');
  const updated = await member.timeout(input.minutes === null ? null : input.minutes * 60_000, input.reason.slice(0, 512));
  return statusOf(guild, updated);
}
