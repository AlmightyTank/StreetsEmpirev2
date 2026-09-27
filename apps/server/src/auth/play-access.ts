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
export function isPlayPath(path: string): boolean {
  return path.startsWith('/api/game/') || path === '/api/rounds/current/join';
}
