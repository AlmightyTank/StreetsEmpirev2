/**
 * Staff roles and what each one may do. The server, the web admin panel and the
 * Discord bot all read this one map, so a button never shows for something the
 * server would refuse. Capabilities are checked, never raw ranks, outside this file.
 */

export const STAFF_ROLES = ['FOUNDER', 'ADMIN', 'MOD', 'JR_MOD', 'HELPER'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  FOUNDER: 'Founder',
  ADMIN: 'Admin',
  MOD: 'Mod',
  JR_MOD: 'JR Mod',
  HELPER: 'Helper',
};

/** Higher outranks lower. Players are 0. */
const RANK: Record<StaffRole, number> = { FOUNDER: 5, ADMIN: 4, MOD: 3, JR_MOD: 2, HELPER: 1 };

export function staffRank(role: StaffRole | null | undefined): number {
  return role ? RANK[role] : 0;
}

/**
 * The Discord role key for a staff role, as the game sends it to the bot: staff:founder,
 * staff:admin, staff:mod, staff:jr-mod, staff:helper.
 */
export function staffRoleKey(role: StaffRole): string {
  return `staff:${role.toLowerCase().replace('_', '-')}`;
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

/** The lowest role that has each capability. */
const MINIMUM_ROLE = {
  /** Everything not listed below: rounds, economy, content, integrations, audit. */
  admin: 'ADMIN',
  /** Open the staff panel and see who is staff. */
  'staff.view': 'HELPER',
  /** Change staff roles below the actor's own (Admin also needs Founder, see assignableStaffRoles). */
  'staff.assign': 'ADMIN',
  /** Search accounts and open one, without private data. */
  'accounts.view': 'HELPER',
  /** Email, sessions and devices, and audit snapshots that carry them. */
  'accounts.private': 'ADMIN',
  /** Read and write private moderation notes. */
  'accounts.notes': 'JR_MOD',
  /** Comms mutes and Discord timeouts (JR Mod: short ones only, see STAFF_MAX_MUTE_HOURS). */
  'accounts.mute': 'JR_MOD',
  /** Game and forum suspensions, signing a player out. */
  'accounts.suspend': 'MOD',
  'accounts.ban': 'MOD',
  /** Renames and profile resets. */
  'accounts.rename': 'MOD',
  /** Player message reports, wire posts and crew name moderation. */
  'reports.handle': 'JR_MOD',
  'bugs.triage': 'HELPER',
  /** Discord /support tickets: see the staff context and close them. */
  'support.tickets': 'HELPER',
} as const satisfies Record<string, StaffRole>;

export type StaffCapability = keyof typeof MINIMUM_ROLE;
export const STAFF_CAPABILITIES = Object.keys(MINIMUM_ROLE) as StaffCapability[];

export function staffCan(role: StaffRole | null | undefined, capability: StaffCapability): boolean {
  return staffRank(role) >= RANK[MINIMUM_ROLE[capability]];
}

export function staffCapabilities(role: StaffRole | null | undefined): StaffCapability[] {
  return STAFF_CAPABILITIES.filter((capability) => staffCan(role, capability));
}

/**
 * The longest comms mute or Discord timeout a role may give, in hours. Roles not
 * listed are limited only by the offered lengths.
 */
export const STAFF_MAX_MUTE_HOURS: Partial<Record<StaffRole, number>> = { JR_MOD: 24 };

export function staffMayMuteFor(role: StaffRole | null | undefined, hours: number | null): boolean {
  if (!staffCan(role, 'accounts.mute')) return false;
  const cap = role ? STAFF_MAX_MUTE_HOURS[role] : undefined;
  if (cap === undefined) return true;
  return hours !== null && hours <= cap;
}

/** Staff may only act on players and on staff below them. */
export function staffOutranks(actor: StaffRole | null | undefined, target: StaffRole | null | undefined): boolean {
  return staffRank(actor) > staffRank(target);
}

/**
 * The roles an actor may give someone. Founder is never offered; it is set from the
 * console. Only the Founder makes Admins. Admins make Mods, JR Mods and Helpers.
 */
export function assignableStaffRoles(actor: StaffRole | null | undefined): StaffRole[] {
  if (!staffCan(actor, 'staff.assign')) return [];
  return STAFF_ROLES.filter((role) => role !== 'FOUNDER' && staffOutranks(actor, role));
}

/**
 * Whether an actor may move a target from one role to another (null = no role). They must
 * outrank the target's current role, and the new role must be one they can give.
 */
export function staffMayChangeRole(
  actor: StaffRole | null | undefined,
  from: StaffRole | null | undefined,
  to: StaffRole | null | undefined,
): boolean {
  if (!staffCan(actor, 'staff.assign') || !staffOutranks(actor, from)) return false;
  return to === null || to === undefined || assignableStaffRoles(actor).includes(to);
}
