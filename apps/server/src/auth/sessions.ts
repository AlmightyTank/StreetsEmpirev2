import { createHash, randomBytes } from 'node:crypto';
import type { Account, PrismaClient, Session } from '@prisma/client';
import { env } from '../config/env.js';
import { activeSuspension, clearExpiredSuspension } from './account-status.js';

/**
 * The cookie carries a 256-bit random token. Only its SHA-256 hash is stored,
 * so a leaked database cannot be replayed as a login. Tokens are never logged.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  token: string;
  session: Session;
}

export async function createSession(
  prisma: PrismaClient,
  accountId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<CreatedSession> {
  const token = randomBytes(32).toString('base64url');

  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      accountId,
      expiresAt: new Date(Date.now() + env.sessionTtlMs),
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      ip: meta.ip ?? null,
    },
  });

  return { token, session };
}

export interface ResolvedSession {
  session: Session;
  account: Account;
}

export async function resolveSession(
  prisma: PrismaClient,
  token: string,
): Promise<ResolvedSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { account: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (!session.account.isActive) return null;

  // A suspended account is signed out for as long as the suspension runs, and
  // signs itself back in the moment it passes.
  if (activeSuspension(session.account)) return null;
  if (await clearExpiredSuspension(prisma, session.account)) {
    session.account.suspendedUntil = null;
    session.account.suspendedReason = null;
    session.account.suspendedByUsername = null;
  }

  const { account, ...rest } = session;
  return { session: rest, account };
}

export async function touchSession(
  prisma: PrismaClient,
  sessionId: string,
): Promise<void> {
  await prisma.session
    .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

export async function destroySession(
  prisma: PrismaClient,
  token: string,
): Promise<void> {
  await prisma.session
    .deleteMany({ where: { tokenHash: hashToken(token) } })
    .catch(() => undefined);
}

/** Best effort housekeeping. Called on boot. */
export async function purgeExpiredSessions(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
}
