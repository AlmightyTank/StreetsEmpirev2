import type { Account } from '@prisma/client';
import { RULES_VERSION } from '@streets/shared';
import { env } from '../config/env.js';

type PlayAccount = Pick<Account, 'isAdmin' | 'emailVerifiedAt' | 'discordId' | 'verificationGrandfatheredAt'>;

/**
 * Who may play. A player needs a confirmed email address: either they clicked the
 * link we emailed, or they signed in with (or linked) Discord, which only hands over
 * accounts with a verified email. Accounts that existed before the rule came in are
 * grandfathered. Admins always may. When REQUIRE_VERIFIED_EMAIL is off (development
 * and test by default), everyone may.
 */
export function canPlay(account: PlayAccount, required = env.accounts.requireVerifiedEmail): boolean {
  return !required || account.isAdmin || Boolean(account.emailVerifiedAt) || Boolean(account.discordId) || Boolean(account.verificationGrandfatheredAt);
}

/** The player has not accepted the current game rules yet. Admins are never held back. */
export function needsRulesAcceptance(
  account: Pick<Account, 'isAdmin' | 'rulesAcceptedVersion'>,
  required = env.accounts.requireRulesAcceptance,
): boolean {
  return required && !account.isAdmin && account.rulesAcceptedVersion !== RULES_VERSION;
}

/** Paths that are "playing": the game itself and joining a season. */
/** rc.2. How a session signed in. */
export type SessionMethod = 'PASSWORD' | 'DISCORD';

/** rc.3/rc.4. What a session proved, and when it last proved a second factor. */
export type SessionStrength = { method: string; twoFactor: boolean; secondFactorAt: Date | null };

/**
 * A second factor (Discord's own sign-in, or an authenticator or recovery code) proved
 * within `maxAgeMs`. A trusted browser that skipped the code does not count.
 */
export function sessionHasFreshSecondFactor(
  session: SessionStrength | null | undefined,
  maxAgeMs = env.sessions.adminSecondFactorMs,
  now = Date.now(),
): boolean {
  return Boolean(session?.secondFactorAt && now - session.secondFactorAt.getTime() < maxAgeMs);
}

/**
 * rc.2-rc.4. While REQUIRE_ADMIN_2FA is on, admin tools need a second factor proved in the
 * last ADMIN_2FA_MAX_AGE_HOURS: a stolen password (or a stolen, long-lived session) alone
 * must not open the panel. An admin with an authenticator re-confirms in place.
 */
export function adminNeedsSecondFactor(
  account: Pick<Account, 'isAdmin'>,
  session: SessionStrength | null | undefined,
  required = env.accounts.requireAdminSecondFactor,
): boolean {
  return required && account.isAdmin && !sessionHasFreshSecondFactor(session);
}

export function isPlayPath(path: string): boolean {
  return path.startsWith('/api/game/') || path === '/api/rounds/current/join';
}
