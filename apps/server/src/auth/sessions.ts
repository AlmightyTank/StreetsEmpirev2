import { createHash, randomBytes } from 'node:crypto';
import type { Account, PrismaClient, Session } from '@prisma/client';
import { env } from '../config/env.js';
import { activeSuspension, clearExpiredSuspension } from './account-status.js';
import type { SessionMethod } from './play-access.js';

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

/**
 * rc.4. How long a session lives, as most games and big sites do it:
 * - "Keep me signed in" (the default): renews while used, ends after SESSION_TTL_DAYS
 *   without a visit;
 * - without it: the cookie ends with the browser, and the session after SESSION_SHORT_HOURS idle;
 * - either way it ends SESSION_MAX_DAYS after sign-in, so the password (and code) is asked
 *   again at least that often.
 */
export function sessionIdleMs(remember: boolean): number {
  return remember ? env.sessions.rememberedIdleMs : env.sessions.shortIdleMs;
}

export function sessionHardEnd(session: Pick<Session, 'absoluteExpiresAt' | 'createdAt'>): Date {
  return session.absoluteExpiresAt ?? new Date(session.createdAt.getTime() + env.sessions.maxAgeMs);
}

/** The next expiry for a session used at `now`: idle time from now, never past the hard end. */
export function renewedExpiry(session: Pick<Session, 'absoluteExpiresAt' | 'createdAt' | 'remember'>, now = Date.now()): Date {
  return new Date(Math.min(now + sessionIdleMs(session.remember), sessionHardEnd(session).getTime()));
}

export async function createSession(
  prisma: PrismaClient,
  accountId: string,
  meta: { userAgent?: string | null; ip?: string | null; method?: SessionMethod; twoFactor?: boolean; remember?: boolean } = {},
): Promise<CreatedSession> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const remember = meta.remember ?? true;
  const method = meta.method ?? 'PASSWORD';
  const twoFactor = meta.twoFactor ?? false;
  const absoluteExpiresAt = new Date(now + env.sessions.maxAgeMs);

  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      accountId,
      remember,
      absoluteExpiresAt,
      expiresAt: new Date(Math.min(now + sessionIdleMs(remember), absoluteExpiresAt.getTime())),
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      ip: meta.ip ?? null,
      method,
      twoFactor,
      // A Discord sign-in or a code is a second factor, proved now.
      secondFactorAt: method === 'DISCORD' || twoFactor ? new Date(now) : null,
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

  if (session.expiresAt.getTime() <= Date.now() || sessionHardEnd(session).getTime() <= Date.now()) {
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

/**
 * "Last seen" is shown to the minute and only needs to be that fresh; writing it on
 * every request added a database write to every read during play.
 */
export const SESSION_TOUCH_INTERVAL_MS = 60_000;

/**
 * Records the visit and slides the idle expiry forward (never past the hard end), at most
 * once a minute per session. The expiry can lag by that minute, which the 12-hour and
 * 30-day idle limits do not notice.
 */
export async function touchSession(
  prisma: PrismaClient,
  session: Pick<Session, 'id' | 'absoluteExpiresAt' | 'createdAt' | 'remember' | 'lastSeenAt'>,
): Promise<void> {
  const now = Date.now();
  if (now - session.lastSeenAt.getTime() < SESSION_TOUCH_INTERVAL_MS) return;
  await prisma.session
    .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now), expiresAt: renewedExpiry(session, now) } })
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
