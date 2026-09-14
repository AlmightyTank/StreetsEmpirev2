/** A Discord role the bot owns, found or created by its exact name. No other roles are touched. */
export interface ManagedRole {
  key: string;
  name: string;
  color: number | null;
}

const FIXED_ROLES: ManagedRole[] = [
  { key: 'linked', name: 'Linked', color: null },
  { key: 'player', name: 'Player', color: 0xb6ff3a },
  { key: 'national-1', name: 'National #1', color: 0xffb020 },
  { key: 'top-10', name: 'Top 10', color: 0x60a5fa },
  { key: 'veteran', name: 'Veteran', color: 0x98a1ad },
  { key: 'top-finisher', name: 'Top Finisher', color: 0x60a5fa },
  { key: 'past-winner', name: 'Past Winner', color: 0xffb020 },
  { key: 'hall-of-fame', name: 'Hall of Fame', color: 0xffb020 },
];

/** "Admin, mod,Admin" -> ["Admin", "mod"]; bounded so a typo can't create dozens of roles. */
export function parseForumGroupList(csv: string): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const raw of csv.split(',')) {
    const name = raw.trim();
    if (!name || name.length > 40 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    groups.push(name);
    if (groups.length === 10) break;
  }
  return groups;
}

/** Forum group keys compare case-insensitively; the forum and the config may disagree on case. */
export function normalizeRoleKey(key: string): string {
  return key.startsWith('forum:') ? `forum:${key.slice('forum:'.length).toLowerCase()}` : key;
}

export function managedRoles(forumGroups: string[]): ManagedRole[] {
  return [
    ...FIXED_ROLES,
    ...forumGroups.map((group) => ({ key: normalizeRoleKey(`forum:${group}`), name: `Forum ${group}`, color: null })),
  ];
}

/** Display names for role keys, in managed-role order; unmanaged keys (e.g. unlisted forum groups) are skipped. */
export function roleNamesForKeys(keys: string[], managed: ManagedRole[]): string[] {
  const wanted = new Set(keys.map(normalizeRoleKey));
  return managed.filter((role) => wanted.has(role.key)).map((role) => role.name);
}

/** Only managed keys are ever added or removed. */
export function planRoleChanges(
  managedKeys: string[],
  current: ReadonlySet<string>,
  desired: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  return {
    add: managedKeys.filter((key) => desired.has(key) && !current.has(key)),
    remove: managedKeys.filter((key) => !desired.has(key) && current.has(key)),
  };
}
