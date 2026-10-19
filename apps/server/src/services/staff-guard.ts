import type { Account, PrismaClient, StaffRole } from '@prisma/client';
import { STAFF_ROLE_LABELS, staffCan, staffMayMuteFor, staffOutranks, type StaffCapability } from '@streets/shared';
import { staffRoleOf } from '../auth/play-access.js';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import type { AuditActor } from './admin-audit.service.js';

/**
 * The checks every staff action on an account makes, re-read from the database inside
 * the action so a role taken away a moment ago no longer works:
 * - the actor is active staff whose role has the capability;
 * - nobody acts on their own account;
 * - nobody acts on staff at their own rank or above (a Mod cannot mute an Admin).
 */

export async function actorStaffRole(db: Db | PrismaClient, actor: AuditActor, capability: StaffCapability): Promise<StaffRole> {
  const me = await db.account.findUnique({ where: { id: actor.id }, select: { isAdmin: true, staffRole: true, isActive: true } });
  const role = me?.isActive ? staffRoleOf(me) : null;
  if (!role) throw AppError.forbidden('Only game admins can do that.');
  if (!staffCan(role, capability)) {
    throw AppError.forbidden(capability === 'admin' ? 'Only game admins can do that.' : 'Your staff role cannot do that.');
  }
  return role;
}

export function assertNotSelf(actor: AuditActor, accountId: string): void {
  if (actor.id === accountId) {
    throw AppError.conflict('ADMIN_SELF_ACTION', 'Staff cannot moderate their own account. Ask another staff member.');
  }
}

export function assertOutranks(actorRole: StaffRole, target: Pick<Account, 'username' | 'isAdmin' | 'staffRole'>): void {
  const targetRole = staffRoleOf(target);
  if (targetRole && !staffOutranks(actorRole, targetRole)) {
    throw new AppError(403, 'STAFF_RANK', `${target.username} is ${STAFF_ROLE_LABELS[targetRole]}. Only someone above them can do that.`);
  }
}

/** JR Mods give short mutes and timeouts only. `hours` is null for a permanent mute. */
export function assertMuteLength(actorRole: StaffRole, hours: number | null): void {
  if (!staffMayMuteFor(actorRole, hours)) {
    throw new AppError(403, 'STAFF_MUTE_TOO_LONG', `${STAFF_ROLE_LABELS[actorRole]}s can mute for up to a day. Ask a Mod for anything longer.`);
  }
}

/**
 * All three checks for an action that does not hold the moderation lock (Discord
 * timeouts, forum suspensions). Returns the actor's role.
 */
export async function assertStaffMayActOn(
  db: Db | PrismaClient,
  actor: AuditActor,
  accountId: string,
  capability: StaffCapability,
): Promise<StaffRole> {
  assertNotSelf(actor, accountId);
  const role = await actorStaffRole(db, actor, capability);
  const target = await db.account.findUnique({ where: { id: accountId }, select: { username: true, isAdmin: true, staffRole: true } });
  if (!target) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');
  assertOutranks(role, target);
  return role;
}
