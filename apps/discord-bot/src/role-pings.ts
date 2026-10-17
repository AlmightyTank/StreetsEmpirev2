/** Only the intended subscriber role may be mentioned in automated announcements. */
export function roleMention(roleId: string): {
  content?: string;
  allowedMentions: { parse: []; roles: string[] };
} {
  return roleId
    ? { content: `<@&${roleId}>`, allowedMentions: { parse: [], roles: [roleId] } }
    : { allowedMentions: { parse: [], roles: [] } };
}

/**
 * Deployed patch notes are titled "Patch notes: <date>". Staff can also use
 * this heading for manually authored patch notes; other news targets News Updates.
 */
export function isPatchNotesPost(title: string): boolean {
  return /^\s*patch\s+notes\s*(?::|[-—–]|$)/i.test(title);
}
