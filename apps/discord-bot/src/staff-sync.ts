/**
 * Staff role sync (stage B). The game is the source of truth for staff roles; the bot
 * makes Discord match it and tells the staff channel what it changed or found.
 *
 * - off: staff roles are not touched (the default until DISCORD_STAFF_ROLE_IDS is set up).
 * - report: differences are posted, nothing changes. Run this first to see who would move.
 * - enforce: staff roles are added and removed to match the game. The Founder role is
 *   always only reported, because it sits above the bot's own role.
 */
export type StaffSyncMode = 'off' | 'report' | 'enforce';

export interface StaffSyncEvent {
  /** Null for a problem with the role itself. */
  memberId: string | null;
  /** The staff role's name, e.g. "Mod". */
  role: string;
  action:
    | 'added'
    | 'removed'
    /** The game says they hold it; Discord does not. Not changed (report mode or Founder). */
    | 'missing-role'
    /** Discord says they hold it; the game does not. Not changed (report mode or Founder). */
    | 'extra-role'
    /** The role ID is not in the server. */
    | 'missing'
    /** The role sits above the bot's own role. */
    | 'blocked';
  checkOnly: boolean;
}

const MESSAGE_LIMIT = 1900;

export function staffSyncLine(event: StaffSyncEvent): string {
  const who = event.memberId ? `<@${event.memberId}>` : '';
  const role = `**${event.role}**`;
  const fix = event.checkOnly ? 'The bot never changes this role: fix it by hand.' : 'Not changed: report mode.';
  switch (event.action) {
    case 'added': return `✅ Gave ${who} ${role}, their staff role in the game.`;
    case 'removed': return `➖ Took ${role} from ${who}: they do not hold it in the game.`;
    case 'missing-role': return `📝 ${who} is ${role} in the game but not on Discord. ${fix}`;
    case 'extra-role': return `📝 ${who} has ${role} on Discord but not in the game. ${fix}`;
    case 'missing': return `⚠️ The ${role} role in DISCORD_STAFF_ROLE_IDS is not in this server. Copy its ID again.`;
    case 'blocked': return `⚠️ Cannot manage ${role}: in Server Settings → Roles, drag the bot's role above it.`;
  }
}

/** The staff channel messages for these events, each under Discord's length limit. */
export function staffSyncMessages(events: StaffSyncEvent[], mode: StaffSyncMode): string[] {
  if (!events.length) return [];
  const header = `**Staff role sync**${mode === 'report' ? ' (report mode: nothing is changed)' : ''}`;
  const messages: string[] = [];
  let current = header;
  for (const line of events.map(staffSyncLine)) {
    if (current.length + line.length + 1 > MESSAGE_LIMIT) {
      messages.push(current);
      current = header;
    }
    current += `\n${line}`;
  }
  messages.push(current);
  return messages;
}
