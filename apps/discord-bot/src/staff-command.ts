import type { APIEmbed } from 'discord.js';
import { escapeMarkdown, truncate } from './format.js';
import type { StaffRoleName, StaffRoleSet, StaffRoster } from './game-api.js';

/**
 * /staff (stage C). The bot only relays: the game checks the caller's rank, refuses
 * Founder, and audits the change as made from Discord. Discord roles then follow
 * through the normal staff role sync.
 */

export const STAFF_LABELS: Record<StaffRoleName, string> = { FOUNDER: 'Founder', ADMIN: 'Admin', MOD: 'Mod', JR_MOD: 'JR Mod', HELPER: 'Helper' };

/** The roles /staff set offers. Founder is never one of them. */
export const STAFF_COMMAND_ROLES = ['ADMIN', 'MOD', 'JR_MOD', 'HELPER'] as const satisfies readonly StaffRoleName[];

function roleText(role: StaffRoleName | null): string {
  return role ? STAFF_LABELS[role] : 'no staff role';
}

/** The caller's private reply. */
export function staffRoleSetText(result: StaffRoleSet): string {
  return `Done: ${escapeMarkdown(result.username)} is now ${roleText(result.toRole)} (was ${roleText(result.fromRole)}). `
    + 'Their Discord role follows within a minute, and the change is in the game audit log.';
}

/** The public line in the staff channel. */
export function staffRoleSetLine(actorId: string, targetId: string, result: StaffRoleSet, reason: string): string {
  const change = result.toRole ? `made <@${targetId}> **${STAFF_LABELS[result.toRole]}**` : `took <@${targetId}>'s **${roleText(result.fromRole)}** role away`;
  return `🛡️ <@${actorId}> ${change} with /staff. Reason: ${truncate(escapeMarkdown(reason), 300)}`;
}

/** /staff list: every role holder, with a warning where their roles cannot sync. */
export function staffRosterEmbed(roster: StaffRoster): APIEmbed {
  if (!roster.members.length) return { title: 'StreetsEmpire staff', description: 'Nobody holds a staff role yet.', color: 0xb6ff3a };
  const lines = roster.members.map((member) => {
    const where = member.discordId ? `<@${member.discordId}>` : '⚠️ Discord not linked';
    const forum = member.forumLinked ? '' : ' · ⚠️ forum not linked';
    const inactive = member.isActive ? '' : ' · deactivated';
    return `**${STAFF_LABELS[member.staffRole]}** · ${escapeMarkdown(member.username)} · ${where}${forum}${inactive}`;
  });
  return {
    title: 'StreetsEmpire staff',
    description: truncate(lines.join('\n'), 4000),
    color: 0xb6ff3a,
    footer: { text: 'Roles are set in the game or with /staff set. Discord and the forum follow the game.' },
  };
}
