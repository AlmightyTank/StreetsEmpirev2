import type { Account } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Who may play. A player needs a confirmed email address: either they clicked the
 * link we emailed, or they signed in with (or linked) Discord, which only hands over
 * accounts with a verified email. Admins always may. When REQUIRE_VERIFIED_EMAIL is
 * off (development and test by default), everyone may.
 */
export function canPlay(account: Pick<Account, 'isAdmin' | 'emailVerifiedAt' | 'discordId'>, required = env.accounts.requireVerifiedEmail): boolean {
  return !required || account.isAdmin || Boolean(account.emailVerifiedAt) || Boolean(account.discordId);
}

/** Paths that are "playing": the game itself and joining a season. */
export function isPlayPath(path: string): boolean {
  return path.startsWith('/api/game/') || path === '/api/rounds/current/join';
}
