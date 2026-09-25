import { randomBytes } from 'node:crypto';
import { Prisma, type Account, type PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  AdminAccountDeleteResultDto,
  AdminAccountDetailDto,
  AdminAccountSearchDto,
  AdminAccountStatusFilter,
  AdminAccountSummaryDto,
  AdminSuspensionDto,
} from '@streets/shared';
import { ADMIN_SUSPENSION_LENGTHS, type AdminSuspensionLength } from '@streets/shared';
import { createAccountEmailToken, emailVerificationUrl } from '../auth/email-tokens.js';
import { hashPassword } from '../auth/password.js';
import { env } from '../config/env.js';
import { lockAccount, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, toAuditEntryDto, type AuditActor } from './admin-audit.service.js';
import { sendCurrentEmailVerification } from './email.service.js';

/**
 * A coarse label such as "Chrome on Windows". Admins never see the IP address
 * or the raw browser string on a session.
 */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
      : /Firefox\//.test(userAgent) ? 'Firefox'
        : /Chrome\//.test(userAgent) ? 'Chrome'
          : /Safari\//.test(userAgent) ? 'Safari'
            : /curl|node|undici|lightMyRequest/i.test(userAgent) ? 'Script'
              : 'Other browser';
  const os = /Windows/.test(userAgent) ? 'Windows'
    : /iPhone|iPad|iOS/.test(userAgent) ? 'iOS'
      : /Android/.test(userAgent) ? 'Android'
        : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
          : /Linux/.test(userAgent) ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/** The account fields an audit record keeps. Never the password hash. */
export function accountSnapshot(account: Account) {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    emailVerifiedAt: account.emailVerifiedAt,
    isActive: account.isActive,
    isAdmin: account.isAdmin,
    betaApproved: account.betaApproved,
    discordUsername: account.discordUsername,
    suspendedUntil: account.suspendedUntil,
    suspendedReason: account.suspendedReason,
  };
}

/**
 * Delete audit entries deliberately omit email, Discord identity, password data
 * and integration identifiers. The moderation record keeps enough context to
 * explain what happened without becoming a second store of deleted PII.
 */
export function deletionAuditSnapshot(account: Account, roundsPlayed: number) {
  return {
    id: account.id,
    username: account.username,
    isActive: account.isActive,
    isAdmin: account.isAdmin,
    betaApproved: account.betaApproved,
    roundsPlayed,
  };
}

export function deletedAccountIdentity(accountId: string) {
  return {
    username: `deleted_${accountId}`,
    email: `deleted+${accountId}@deleted.streetsempire.invalid`,
  };
}

/** A suspension still running, in the shape the panel shows. */
export function toSuspensionDto(account: Account, now = new Date()): AdminSuspensionDto | null {
  if (!account.suspendedUntil || account.suspendedUntil.getTime() <= now.getTime()) return null;
  return {
    until: account.suspendedUntil.toISOString(),
    reason: account.suspendedReason ?? '',
    byUsername: account.suspendedByUsername,
  };
}

function forumProfileUrl(forumOrigin: string, forumUsername: string): string {
  return `${forumOrigin}/u/${encodeURIComponent(forumUsername)}`;
}

const summaryInclude = {
  forumLink: { select: { forumUsername: true } },
  _count: { select: { roundPlayers: true } },
} satisfies Prisma.AccountInclude;

type SummaryAccount = Account & { forumLink: { forumUsername: string } | null; _count: { roundPlayers: number } };

function toSummary(account: SummaryAccount, activeSessions: number, now = new Date()): AdminAccountSummaryDto {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    emailVerified: Boolean(account.emailVerifiedAt),
    isActive: account.isActive,
    isAdmin: account.isAdmin,
    betaApproved: account.betaApproved,
    suspension: toSuspensionDto(account, now),
    discordUsername: account.discordUsername,
    forumUsername: account.forumLink?.forumUsername ?? null,
    createdAt: account.createdAt.toISOString(),
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
    activeSessions,
    roundsPlayed: account._count.roundPlayers,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

type Change = { account: Account; detail?: Record<string, unknown> };

/**
 * One moderation action on another admin's or player's account, with its audit
 * record in the same transaction. Moderation is serialised and the acting admin
 * is re-checked inside it, so two admins cannot remove each other at once.
 */
async function moderate(
  prisma: PrismaClient,
  actor: AuditActor,
  accountId: string,
  action: string,
  reason: string,
  apply: (tx: Db, account: Account) => Promise<Change>,
): Promise<void> {
  if (actor.id === accountId) {
    throw AppError.conflict('ADMIN_SELF_ACTION', 'Admins cannot moderate their own account. Ask another admin.');
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(3003)`;
      const me = await tx.account.findUnique({ where: { id: actor.id }, select: { isAdmin: true, isActive: true } });
      if (!me?.isAdmin || !me.isActive) throw AppError.forbidden('Only game admins can do that.');

      await lockAccount(tx, accountId);
      const before = await tx.account.findUnique({ where: { id: accountId } });
      if (!before) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');

      const change = await apply(tx, before);
      await AdminAuditService.record(tx, actor, {
        action: `account.${action}`,
        targetType: 'account',
        targetId: accountId,
        reason,
        before: accountSnapshot(before),
        after: { ...accountSnapshot(change.account), ...change.detail },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw AppError.conflict('USERNAME_TAKEN', 'That pimp name was just taken.', { username: 'That pimp name is taken.' });
    }
    throw error;
  }
}

export const AdminAccountService = {
  async search(
    prisma: PrismaClient,
    input: { query?: string | undefined; status?: AdminAccountStatusFilter | undefined; limit?: number | undefined },
    now = new Date(),
  ): Promise<AdminAccountSearchDto> {
    const query = input.query?.trim();
    const pimpId = query && /^#?\d{1,9}$/.test(query) ? Number(query.replace('#', '')) : null;
    const where: Prisma.AccountWhereInput = {
      ...(query
        ? {
            OR: [
              { usernameNormalized: { contains: query.toLowerCase() } },
              { email: { contains: query.toLowerCase() } },
              { discordUsername: { contains: query, mode: 'insensitive' } },
              { id: query },
              ...(pimpId ? [{ roundPlayers: { some: { publicPimpId: pimpId } } }] : []),
            ],
          }
        : {}),
      ...(input.status === 'active' ? { isActive: true }
        : input.status === 'inactive' ? { isActive: false }
          : input.status === 'admin' ? { isAdmin: true }
            : input.status === 'suspended' ? { suspendedUntil: { gt: now } }
              : input.status === 'beta-pending' ? { isActive: true, isAdmin: false, betaApproved: false }
                : {}),
    };

    const rows = await prisma.account.findMany({
      where,
      include: summaryInclude,
      orderBy: [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: input.limit ?? 50,
    });
    const sessions = await prisma.session.groupBy({
      by: ['accountId'],
      where: { accountId: { in: rows.map((row) => row.id) }, expiresAt: { gt: now } },
      _count: { _all: true },
    });
    const sessionsFor = new Map(sessions.map((row) => [row.accountId, row._count._all]));
    return { accounts: rows.map((row) => toSummary(row, sessionsFor.get(row.id) ?? 0, now)) };
  },

  async detail(prisma: PrismaClient, accountId: string, now = new Date()): Promise<AdminAccountDetailDto> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        ...summaryInclude,
        forumLink: true,
        profile: true,
        sessions: { where: { expiresAt: { gt: now } }, orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }] },
        roundPlayers: { include: { round: { select: { id: true, name: true, status: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');

    const audit = await prisma.adminAuditLog.findMany({
      where: { targetType: 'account', targetId: account.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 25,
    });

    return {
      account: toSummary(account, account.sessions.length, now),
      profile: {
        activeTitleKey: account.profile?.activeTitleKey ?? null,
        activeProfileFrameKey: account.profile?.activeProfileFrameKey ?? null,
        activeSiteThemeKey: account.profile?.activeSiteThemeKey ?? null,
        profileAccent: account.profile?.profileAccent ?? 'default',
        featuredBadgeKeys: stringArray(account.profile?.featuredBadgeKeys),
      },
      email: {
        verifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
        sendingEnabled: env.email.enabled,
      },
      forumLink: account.forumLink
        ? {
            forumUserId: account.forumLink.forumUserId,
            forumUsername: account.forumLink.forumUsername,
            profileUrl: forumProfileUrl(account.forumLink.forumOrigin, account.forumLink.forumUsername),
            linkedAt: account.forumLink.createdAt.toISOString(),
          }
        : null,
      discord: {
        linked: Boolean(account.discordId),
        username: account.discordUsername,
        botApiEnabled: env.discordBot.enabled,
      },
      sessions: account.sessions.map((session) => ({
        id: session.id,
        device: deviceLabel(session.userAgent),
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      })),
      rounds: account.roundPlayers.map((player) => ({
        roundPlayerId: player.id,
        roundId: player.round.id,
        roundName: player.round.name,
        roundStatus: player.round.status,
        publicPimpId: player.publicPimpId,
        displayName: player.displayName,
        netWorthCents: Number(player.netWorthCents),
        nationalRank: player.nationalRank,
        localRank: player.localRank,
        joinedAt: player.createdAt.toISOString(),
      })),
      audit: audit.map(toAuditEntryDto),
    };
  },

  /**
   * Permanent admin removal. Accounts that never entered a round can be deleted
   * outright. Once a player has round history, the Account row is retained as a
   * tombstone so foreign keys, standings, battles, alliances and archived round
   * history stay intact while personal/login data is erased.
   */
  async deleteAccount(
    prisma: PrismaClient,
    actor: AuditActor,
    accountId: string,
    confirmation: string,
    reason: string,
  ): Promise<AdminAccountDeleteResultDto> {
    if (actor.id === accountId) {
      throw AppError.conflict('ADMIN_SELF_ACTION', 'Admins cannot delete their own account. Ask another admin.');
    }

    // Generate the replacement credential before taking the database lock.
    const replacementPasswordHash = await hashPassword(randomBytes(32).toString('base64url'));

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(3003)`;
      const me = await tx.account.findUnique({
        where: { id: actor.id },
        select: { isAdmin: true, isActive: true },
      });
      if (!me?.isAdmin || !me.isActive) throw AppError.forbidden('Only game admins can do that.');

      await lockAccount(tx, accountId);
      const before = await tx.account.findUnique({ where: { id: accountId } });
      if (!before) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');
      if (before.isAdmin) {
        throw AppError.conflict(
          'ADMIN_DELETE_ADMIN',
          `Remove ${before.username}'s admin role before deleting the account.`,
        );
      }
      if (confirmation !== before.username) {
        throw AppError.badRequest(
          'DELETE_CONFIRMATION_MISMATCH',
          `Type ${before.username} exactly to confirm permanent deletion.`,
          { confirmation: `Type ${before.username} exactly.` },
        );
      }

      const roundsPlayed = await tx.roundPlayer.count({ where: { accountId: before.id } });
      const sessionsRevoked = await tx.session.count({ where: { accountId: before.id } });
      const beforeAudit = deletionAuditSnapshot(before, roundsPlayed);

      if (roundsPlayed === 0) {
        await AdminAuditService.record(tx, actor, {
          action: 'account.delete',
          targetType: 'account',
          targetId: before.id,
          reason,
          before: beforeAudit,
          after: {
            id: before.id,
            mode: 'deleted',
            roundsPreserved: 0,
            sessionsRevoked,
          },
        });
        await tx.account.delete({ where: { id: before.id } });

        return {
          accountId: before.id,
          formerUsername: before.username,
          mode: 'deleted',
          roundsPreserved: 0,
          sessionsRevoked,
        };
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

      const tombstone = deletedAccountIdentity(before.id);
      const account = await tx.account.update({
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
        },
      });
      await tx.roundPlayer.updateMany({
        where: { accountId: before.id },
        data: { displayName: 'Deleted Player' },
      });

      await AdminAuditService.record(tx, actor, {
        action: 'account.delete',
        targetType: 'account',
        targetId: before.id,
        reason,
        before: beforeAudit,
        after: {
          id: account.id,
          username: account.username,
          mode: 'anonymized',
          roundsPreserved: roundsPlayed,
          sessionsRevoked,
        },
      });

      return {
        accountId: before.id,
        formerUsername: before.username,
        mode: 'anonymized',
        roundsPreserved: roundsPlayed,
        sessionsRevoked,
      };
    });
  },

  /** Deactivating signs the account out everywhere; resolveSession already refuses inactive accounts. */
  async setActive(prisma: PrismaClient, actor: AuditActor, accountId: string, isActive: boolean, reason: string): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, isActive ? 'reactivate' : 'deactivate', reason, async (tx, before) => {
      if (before.isActive === isActive) {
        throw AppError.conflict('ACCOUNT_STATUS_UNCHANGED', isActive ? `${before.username} is already active.` : `${before.username} is already deactivated.`);
      }
      const account = await tx.account.update({ where: { id: before.id }, data: { isActive } });
      if (isActive) return { account };
      const { count } = await tx.session.deleteMany({ where: { accountId: before.id } });
      return { account, detail: { sessionsRevoked: count } };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  /**
   * A timed suspension: the player is signed out now and back in on their own
   * when it runs out. Deactivation stays the tool for shutting an account down
   * for good; this one is the cool-off, and the player is told both the reason
   * and the date it ends.
   */
  async suspend(
    prisma: PrismaClient,
    actor: AuditActor,
    accountId: string,
    length: AdminSuspensionLength,
    reason: string,
    now = new Date(),
  ): Promise<AdminAccountDetailDto> {
    const chosen = ADMIN_SUSPENSION_LENGTHS.find((option) => option.key === length);
    if (!chosen) throw AppError.badRequest('SUSPENSION_LENGTH_UNKNOWN', 'Pick one of the offered suspension lengths.');
    const until = new Date(now.getTime() + chosen.hours * 60 * 60_000);

    await moderate(prisma, actor, accountId, 'suspend', reason, async (tx, before) => {
      if (!before.isActive) {
        throw AppError.conflict('ACCOUNT_INACTIVE', `${before.username} is deactivated, which already keeps them out.`);
      }
      if (before.isAdmin) {
        throw AppError.conflict('ADMIN_SUSPENSION', `Remove ${before.username}'s admin role before suspending them.`);
      }
      const account = await tx.account.update({
        where: { id: before.id },
        data: { suspendedUntil: until, suspendedReason: reason, suspendedByUsername: actor.username },
      });
      const { count } = await tx.session.deleteMany({ where: { accountId: before.id } });
      return { account, detail: { suspendedUntil: until, sessionsRevoked: count, length: chosen.label } };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  /** Ends a suspension early. A suspension that simply runs out needs no admin. */
  async liftSuspension(prisma: PrismaClient, actor: AuditActor, accountId: string, reason: string, now = new Date()): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, 'lift-suspension', reason, async (tx, before) => {
      if (!before.suspendedUntil || before.suspendedUntil.getTime() <= now.getTime()) {
        throw AppError.conflict('NOT_SUSPENDED', `${before.username} is not suspended.`);
      }
      const account = await tx.account.update({
        where: { id: before.id },
        data: { suspendedUntil: null, suspendedReason: null, suspendedByUsername: null },
      });
      return { account };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  async revokeSessions(prisma: PrismaClient, actor: AuditActor, accountId: string, reason: string, sessionId?: string): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, 'revoke-sessions', reason, async (tx, before) => {
      const { count } = await tx.session.deleteMany({ where: { accountId: before.id, ...(sessionId ? { id: sessionId } : {}) } });
      if (sessionId && count === 0) throw AppError.notFound('SESSION_NOT_FOUND', 'That session has already ended.');
      return { account: before, detail: { sessionsRevoked: count, ...(sessionId ? { sessionId } : {}) } };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  /** Renames the account and the name on every round it played, archived results included. */
  async rename(prisma: PrismaClient, actor: AuditActor, accountId: string, username: string, reason: string): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, 'rename', reason, async (tx, before) => {
      if (before.username === username) {
        throw AppError.badRequest('USERNAME_UNCHANGED', `${before.username} already has that name.`, { username: 'Pick a different name.' });
      }
      const usernameNormalized = username.toLowerCase();
      const clash = await tx.account.findFirst({ where: { usernameNormalized, id: { not: before.id } }, select: { id: true } });
      if (clash) throw AppError.conflict('USERNAME_TAKEN', `${username} is already taken.`, { username: 'That pimp name is taken.' });
      const account = await tx.account.update({ where: { id: before.id }, data: { username, usernameNormalized } });
      const { count } = await tx.roundPlayer.updateMany({ where: { accountId: before.id }, data: { displayName: username } });
      return { account, detail: { roundNamesUpdated: count } };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  async resetProfile(prisma: PrismaClient, actor: AuditActor, accountId: string, reason: string): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, 'reset-profile', reason, async (tx, before) => {
      const profile = await tx.accountProfile.findUnique({ where: { accountId: before.id } });
      if (profile) {
        await tx.accountProfile.update({
          where: { accountId: before.id },
          data: { activeTitleKey: null, activeProfileFrameKey: null, activeSiteThemeKey: null, featuredBadgeKeys: [], profileAccent: 'default' },
        });
      }
      return {
        account: before,
        detail: {
          previousProfile: profile
            ? { activeTitleKey: profile.activeTitleKey, activeProfileFrameKey: profile.activeProfileFrameKey, activeSiteThemeKey: profile.activeSiteThemeKey, featuredBadgeKeys: stringArray(profile.featuredBadgeKeys), profileAccent: profile.profileAccent }
            : null,
        },
      };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  async setAdmin(prisma: PrismaClient, actor: AuditActor, accountId: string, isAdmin: boolean, reason: string): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, isAdmin ? 'grant-admin' : 'revoke-admin', reason, async (tx, before) => {
      if (before.isAdmin === isAdmin) {
        throw AppError.conflict('ADMIN_ROLE_UNCHANGED', isAdmin ? `${before.username} is already an admin.` : `${before.username} is not an admin.`);
      }
      if (isAdmin && !before.isActive) {
        throw AppError.conflict('ACCOUNT_INACTIVE', `Reactivate ${before.username} before making them an admin.`);
      }
      if (!isAdmin) {
        const others = await tx.account.count({ where: { isAdmin: true, isActive: true, id: { not: before.id } } });
        if (others === 0) throw AppError.conflict('LAST_ADMIN', 'The game needs at least one active admin.');
      }
      const account = await tx.account.update({ where: { id: before.id }, data: { isAdmin } });
      return { account };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  async setBetaApproved(prisma: PrismaClient, actor: AuditActor, accountId: string, approved: boolean, reason: string): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, approved ? 'approve-beta' : 'revoke-beta', reason, async (tx, before) => {
      if (before.betaApproved === approved) {
        throw AppError.conflict(
          'BETA_ACCESS_UNCHANGED',
          approved ? `${before.username} already has beta access.` : `${before.username} does not have beta access.`,
        );
      }
      const account = await tx.account.update({ where: { id: before.id }, data: { betaApproved: approved } });
      return { account };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  /** A fresh verification link to the account's current email. The mail goes out after the audited change commits. */
  async resendVerification(
    prisma: PrismaClient,
    actor: AuditActor,
    accountId: string,
    reason: string,
    log: FastifyBaseLogger,
  ): Promise<AdminAccountDetailDto> {
    let mail: { to: string; username: string; token: string; expiresAt: Date } | null = null;
    await moderate(prisma, actor, accountId, 'resend-verification', reason, async (tx, before) => {
      if (before.emailVerifiedAt) throw AppError.conflict('EMAIL_ALREADY_VERIFIED', `${before.username}'s email is already verified.`);
      if (!env.email.enabled) {
        throw AppError.badRequest('EMAIL_SENDING_DISABLED', 'This server has no mailer configured, so a verification email cannot be sent.');
      }
      const { token, expiresAt } = await createAccountEmailToken({
        prisma: tx,
        accountId: before.id,
        purpose: 'VERIFY_EMAIL',
        userAgent: `admin:${actor.username}`,
        ip: 'admin-panel',
      });
      mail = { to: before.email, username: before.username, token, expiresAt };
      return { account: before, detail: { verificationSentTo: before.email, expiresAt } };
    });

    const sent = mail as { to: string; username: string; token: string; expiresAt: Date } | null;
    if (sent) {
      try {
        await sendCurrentEmailVerification({ to: sent.to, username: sent.username, url: emailVerificationUrl(sent.token), expiresAt: sent.expiresAt }, log);
      } catch (error) {
        log.error({ err: error, accountId }, 'admin email verification resend failed');
        throw AppError.conflict('EMAIL_SEND_FAILED', 'The verification link was created, but the mailer failed to send it. Try again shortly.');
      }
    }
    return AdminAccountService.detail(prisma, accountId);
  },

  async markEmailVerified(prisma: PrismaClient, actor: AuditActor, accountId: string, reason: string): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, 'mark-email-verified', reason, async (tx, before) => {
      if (before.emailVerifiedAt) throw AppError.conflict('EMAIL_ALREADY_VERIFIED', `${before.username}'s email is already verified.`);
      const account = await tx.account.update({ where: { id: before.id }, data: { emailVerifiedAt: new Date() } });
      return { account };
    });
    return AdminAccountService.detail(prisma, accountId);
  },

  /** Removes the verified forum link and any link still in progress. The player can link again later. */
  async unlinkForum(prisma: PrismaClient, actor: AuditActor, accountId: string, reason: string): Promise<AdminAccountDetailDto> {
    await moderate(prisma, actor, accountId, 'unlink-forum', reason, async (tx, before) => {
      const link = await tx.forumLink.findUnique({ where: { accountId: before.id } });
      if (!link) throw AppError.notFound('FORUM_NOT_LINKED', `${before.username} has no forum account linked.`);
      await tx.forumLinkRequest.deleteMany({ where: { accountId: before.id } });
      await tx.forumLink.delete({ where: { accountId: before.id } });
      return {
        account: before,
        detail: { unlinkedForum: { forumOrigin: link.forumOrigin, forumUserId: link.forumUserId, forumUsername: link.forumUsername } },
      };
    });
    return AdminAccountService.detail(prisma, accountId);
  },
};
