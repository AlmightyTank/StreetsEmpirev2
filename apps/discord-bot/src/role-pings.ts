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
 * Deployed patch notes are titled "Patch notes for <version>" (MAJOR.MINOR.PATCH).
 * Older posts used "Patch notes: <date>" or "Patch notes —". Staff can use the
 * same heading for manual notes; other news targets News Updates.
 */
export function isPatchNotesPost(title: string): boolean {
  return /^\s*patch\s+notes\b/i.test(title);
}
