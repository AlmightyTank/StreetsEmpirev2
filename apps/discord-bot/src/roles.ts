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

/** 0.3.0-C. One role per live alliance in the current round, e.g. "Alliance [ESK]". */
const ALLIANCE_ROLE_NAME = /^Alliance \[([A-Z0-9]{2,5})\]$/;

export function allianceRoles(alliances: Array<{ tag: string }>): ManagedRole[] {
  const seen = new Set<string>();
  return alliances.flatMap(({ tag }) => {
    const upper = tag.toUpperCase();
    if (!/^[A-Z0-9]{2,5}$/.test(upper) || seen.has(upper)) return [];
    seen.add(upper);
    return [{ key: `alliance:${upper}`, name: `Alliance [${upper}]`, color: null }];
  });
}

/**
 * Alliance roles in the server that no longer match a live alliance: disbanded,
 * renamed, or left behind by a finished round. Only names in the bot's own
 * "Alliance [TAG]" format are ever returned.
 */
export function staleAllianceRoleNames(existingNames: string[], live: ManagedRole[]): string[] {
  const liveNames = new Set(live.map((role) => role.name));
  return existingNames.filter((name) => ALLIANCE_ROLE_NAME.test(name) && !liveNames.has(name));
}

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

/** Beta-only mode: the bot owns only the tester group role, without the "Forum " prefix. */
export function forumGroupRoles(forumGroups: string[]): ManagedRole[] {
  return forumGroups.map((group) => ({ key: normalizeRoleKey(`forum:${group}`), name: group, color: null }));
}

/** Display names for role keys, in managed-role order; unmanaged keys (e.g. unlisted forum groups) are skipped. */
export function roleNamesForKeys(keys: string[], managed: ManagedRole[]): string[] {
  const wanted = new Set(keys.map(normalizeRoleKey));
  const alliance = allianceRoles(keys.filter((key) => key.startsWith('alliance:')).map((key) => ({ tag: key.slice('alliance:'.length) })));
  return [...managed, ...alliance].filter((role) => wanted.has(role.key)).map((role) => role.name);
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
