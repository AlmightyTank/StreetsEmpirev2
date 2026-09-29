import { randomBytes } from 'node:crypto';
import type { Account, PrismaClient, Session } from '@prisma/client';
import { APP_VERSION } from '@streets/shared';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { lockAccount, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService } from './admin-audit.service.js';

export function deletedAccountIdentity(accountId: string) {
  return {
    username: `deleted_${accountId}`,
    email: `deleted+${accountId}@deleted.streetsempire.invalid`,
  };
}

export interface ErasureResult {
  mode: 'deleted' | 'anonymized';
  roundsPreserved: number;
  sessionsRevoked: number;
}

/**
 * Erases an account, inside the caller's transaction (after it has locked the account).
 * An account that never played a season is deleted outright. One that did is anonymized:
 * every private row goes and the name becomes "Deleted Player", so rankings, battles and
 * archived seasons stay whole. Used by staff deletion and (rc.5) by players themselves.
 */
export async function eraseAccount(tx: Db, before: Account, replacementPasswordHash: string): Promise<ErasureResult> {
  const roundsPlayed = await tx.roundPlayer.count({ where: { accountId: before.id } });
  const sessionsRevoked = await tx.session.count({ where: { accountId: before.id } });
  // Bug reports outlive the account; they must not keep its name.
  await tx.bugReport.updateMany({ where: { accountId: before.id }, data: { username: 'Deleted Player' } });

  if (roundsPlayed === 0) {
    await tx.account.delete({ where: { id: before.id } });
    return { mode: 'deleted', roundsPreserved: 0, sessionsRevoked };
  }

  // Remove private/authentication-owned rows even though most also cascade.
  await tx.session.deleteMany({ where: { accountId: before.id } });
  await tx.passwordResetToken.deleteMany({ where: { accountId: before.id } });
  await tx.accountEmailToken.deleteMany({ where: { accountId: before.id } });
  await tx.forumLinkRequest.deleteMany({ where: { accountId: before.id } });
  await tx.forumLink.deleteMany({ where: { accountId: before.id } });
  await tx.notificationOutbox.deleteMany({ where: { accountId: before.id } });
  await tx.notificationSettings.deleteMany({ where: { accountId: before.id } });
  await tx.pushSubscription.deleteMany({ where: { accountId: before.id } });
  await tx.accountProfile.deleteMany({ where: { accountId: before.id } });
  await tx.twoFactorRecoveryCode.deleteMany({ where: { accountId: before.id } });
  await tx.loginChallenge.deleteMany({ where: { accountId: before.id } });
  await tx.trustedDevice.deleteMany({ where: { accountId: before.id } });
  await tx.accountDevice.deleteMany({ where: { accountId: before.id } });

  const tombstone = deletedAccountIdentity(before.id);
  await tx.account.update({
    where: { id: before.id },
    data: {
      username: tombstone.username,
      usernameNormalized: tombstone.username.toLowerCase(),
      email: tombstone.email,
      emailVerifiedAt: null,
      passwordHash: replacementPasswordHash,
      discordId: null,
      discordUsername: null,
      discordAvatar: null,
      discordLinkedAt: null,
      lastLoginAt: null,
      isActive: false,
      isAdmin: false,
      betaApproved: false,
      suspendedUntil: null,
      suspendedReason: null,
      suspendedByUsername: null,
      registeredIp: null,
      twoFactorSecret: null,
      twoFactorPendingSecret: null,
      twoFactorEnabledAt: null,
      twoFactorLastStep: null,
    },
  });
  await tx.roundPlayer.updateMany({ where: { accountId: before.id }, data: { displayName: 'Deleted Player' } });
  return { mode: 'anonymized', roundsPreserved: roundsPlayed, sessionsRevoked };
}

/** JSON-safe copy: BigInt money as strings, dates as ISO. */
function plain(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, plain(inner)]));
  }
  return value;
}

/** Messages per export, newest first. More than any real player sends; keeps one export bounded. */
const EXPORT_MESSAGE_LIMIT = 20_000;

export const AccountDataService = {
  /**
   * rc.5. "Download my data": everything the game keeps about the player, as JSON. Never
   * the password hash, two-step secrets, token hashes or staff-only notes.
   */
  async export(prisma: PrismaClient, accountId: string, now = new Date()): Promise<Record<string, unknown>> {
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    const players = await prisma.roundPlayer.findMany({
      where: { accountId },
      include: { round: { select: { name: true, slug: true, status: true, startsAt: true, endsAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const playerIds = players.map((row) => row.id);
    const [profile, cosmetics, notifications, sessions, trustedDevices, devices, forumLink, sent, received, contacts, mutes, messageReports, bugReports] = await Promise.all([
      prisma.accountProfile.findUnique({ where: { accountId } }),
      prisma.accountCosmeticUnlock.findMany({ where: { accountId } }),
      prisma.notificationSettings.findUnique({ where: { accountId } }),
      prisma.session.findMany({ where: { accountId }, select: { createdAt: true, lastSeenAt: true, expiresAt: true, userAgent: true, ip: true, method: true, twoFactor: true, remember: true } }),
      prisma.trustedDevice.findMany({ where: { accountId }, select: { createdAt: true, lastUsedAt: true, expiresAt: true, userAgent: true, ip: true } }),
      prisma.accountDevice.findMany({ where: { accountId }, select: { firstSeenAt: true, lastSeenAt: true } }),
      prisma.forumLink.findUnique({ where: { accountId }, select: { forumUsername: true, forumUserId: true, createdAt: true } }),
      prisma.directMessage.findMany({ where: { senderId: { in: playerIds } }, orderBy: { createdAt: 'desc' }, take: EXPORT_MESSAGE_LIMIT, select: { roundId: true, recipient: { select: { displayName: true } }, subject: true, body: true, createdAt: true, readAt: true } }),
      prisma.directMessage.findMany({ where: { recipientId: { in: playerIds } }, orderBy: { createdAt: 'desc' }, take: EXPORT_MESSAGE_LIMIT, select: { roundId: true, sender: { select: { displayName: true } }, subject: true, body: true, createdAt: true, readAt: true } }),
      prisma.playerContact.findMany({ where: { ownerId: { in: playerIds } }, select: { kind: true, note: true, createdAt: true, target: { select: { displayName: true, roundId: true } } } }),
      prisma.playerMute.findMany({ where: { muterAccountId: accountId }, select: { createdAt: true, muted: { select: { username: true } } } }),
      prisma.playerMessageReport.findMany({ where: { reporterAccountId: accountId }, select: { reason: true, createdAt: true, resolvedAt: true, resolution: true } }),
      prisma.bugReport.findMany({ where: { accountId }, select: { category: true, summary: true, details: true, pagePath: true, createdAt: true, resolvedAt: true, resolution: true, resolutionNote: true } }),
    ]);

    return plain({
      exportedAt: now,
      appVersion: APP_VERSION,
      about: 'Everything StreetsEmpire keeps about your account. Staff moderation notes are not included; ask staff for them.',
      account: {
        id: account.id,
        username: account.username,
        email: account.email,
        emailVerifiedAt: account.emailVerifiedAt,
        createdAt: account.createdAt,
        lastLoginAt: account.lastLoginAt,
        ageConfirmedAt: account.ageConfirmedAt,
        rulesAcceptedAt: account.rulesAcceptedAt,
        rulesAcceptedVersion: account.rulesAcceptedVersion,
        discord: account.discordId ? { username: account.discordUsername, linkedAt: account.discordLinkedAt } : null,
        twoStepSignIn: account.twoFactorEnabledAt ? { enabledAt: account.twoFactorEnabledAt } : null,
        registeredFromAddress: account.registeredIp,
        suspension: account.suspendedUntil ? { until: account.suspendedUntil, reason: account.suspendedReason } : null,
        ban: account.bannedAt ? { at: account.bannedAt, reason: account.bannedReason } : null,
        messagingMute: account.commsMutedPermanent || account.commsMutedUntil ? { until: account.commsMutedUntil, permanent: account.commsMutedPermanent, reason: account.commsMuteReason } : null,
      },
      profile,
      cosmetics,
      notificationSettings: notifications,
      forumLink,
      sessions,
      trustedBrowsers: trustedDevices,
      browsersSeen: devices,
      seasons: players.map(({ round, ...player }) => ({ season: round, player })),
      messagesSent: sent,
      messagesReceived: received,
      contacts,
      playersMuted: mutes.map((row) => ({ username: row.muted.username, since: row.createdAt })),
      messageReportsMade: messageReports,
      bugReports,
    }) as Record<string, unknown>;
  },

  /**
   * rc.5. The player deletes their own account: confirmed with the password (a Discord
   * sign-in needs none) and by typing DELETE. Recorded in the audit log.
   */
  async deleteSelf(prisma: PrismaClient, account: Account, session: Pick<Session, 'method'>, currentPassword: string | undefined): Promise<ErasureResult> {
    if (account.isAdmin) {
      throw AppError.conflict('ADMIN_DELETE_ADMIN', 'Admins cannot delete their own account. Have the admin role removed first.');
    }
    if (session.method !== 'DISCORD' || currentPassword) {
      if (!currentPassword || !(await verifyPassword(account.passwordHash, currentPassword))) {
        throw AppError.badRequest('CURRENT_PASSWORD_INVALID', 'That password does not match.', { currentPassword: 'Enter your password.' });
      }
    }
    const replacementPasswordHash = await hashPassword(randomBytes(32).toString('base64url'));
    return prisma.$transaction(async (tx) => {
      await lockAccount(tx, account.id);
      const before = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
      await AdminAuditService.record(tx, { id: before.id, username: before.username }, {
        action: 'account.self-delete',
        targetType: 'account',
        targetId: before.id,
        reason: 'Deleted by the player in account settings.',
        before: { id: before.id, username: before.username },
      });
      const result = await eraseAccount(tx, before, replacementPasswordHash);
      // Not their name, once gone.
      await tx.adminAuditLog.updateMany({ where: { targetType: 'account', targetId: before.id, action: 'account.self-delete' }, data: { actorUsername: 'Deleted Player', before: { id: before.id } } });
      return result;
    });
  },
};
