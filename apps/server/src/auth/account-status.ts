import type { Account, PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errors.js';

/** The account fields a sign-in check needs. */
export type SignInAccount = Pick<Account, 'id' | 'isActive' | 'isAdmin' | 'betaApproved' | 'suspendedUntil' | 'suspendedReason'>;

/** "Sep 20, 2026, 3:00 PM UTC" - one wording for every player, wherever they are. */
export function suspensionEnds(until: Date): string {
  const text = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(until);
  return `${text} UTC`;
}

/** The suspension still running on this account, or null. */
export function activeSuspension(account: SignInAccount, now = new Date()): { until: Date; reason: string } | null {
  if (!account.suspendedUntil || account.suspendedUntil.getTime() <= now.getTime()) return null;
  return { until: account.suspendedUntil, reason: account.suspendedReason ?? '' };
}

/**
 * A suspension that has run out clears itself the next time the account is
 * used, so nobody has to remember to lift it by hand. Returns true when it
 * cleared something.
 */
export async function clearExpiredSuspension(prisma: PrismaClient, account: SignInAccount, now = new Date()): Promise<boolean> {
  if (!account.suspendedUntil || account.suspendedUntil.getTime() > now.getTime()) return false;
  await prisma.account.update({
    where: { id: account.id },
    data: { suspendedUntil: null, suspendedReason: null, suspendedByUsername: null },
  }).catch(() => undefined);
  return true;
}

/**
 * Refuses a sign-in for a shut down or suspended account. A suspension says
 * when it ends and why, because a player who is told neither just opens a
 * ticket.
 */
export function assertCanSignIn(account: SignInAccount, now = new Date()): void {
  if (!account.isActive) throw AppError.forbidden('This account has been shut down.');
  const suspension = activeSuspension(account, now);
  if (!suspension) return;
  throw new AppError(
    403,
    'ACCOUNT_SUSPENDED',
    `This account is suspended until ${suspensionEnds(suspension.until)}.${suspension.reason ? ` Reason: ${suspension.reason}` : ''}`,
  );
}


/** Invite-only beta access. Admins always retain access so they cannot lock themselves out. */
export function assertBetaAccess(
  account: Pick<Account, 'isAdmin' | 'betaApproved'>,
  inviteOnly: boolean,
): void {
  if (!inviteOnly || account.isAdmin || account.betaApproved) return;
  throw new AppError(
    403,
    'BETA_APPROVAL_REQUIRED',
    'This beta is invite-only. Your account is waiting for an admin to approve beta access.',
  );
}
