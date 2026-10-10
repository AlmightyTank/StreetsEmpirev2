import type { PrismaClient } from '@prisma/client';
import { ADMIN_SUSPENSION_LENGTHS, type AdminSuspensionLength } from '@streets/shared';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { forumUserIdSchema } from './forum-proof.js';

/**
 * Forum suspensions for linked players, through Flarum's Suspend extension and the
 * game's forum API key (which must act as a forum admin). Every change is read back,
 * since Flarum silently ignores suspend fields when the extension is off.
 */

const userSchema = z.object({
  data: z.object({ attributes: z.object({ suspendedUntil: z.string().nullish() }).passthrough() }),
});

export type ForumSuspension = { ok: true; suspendedUntil: string | null } | { ok: false; problem: string };

function headers(): Record<string, string> {
  return {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Token ${env.forum.moderation.apiKey}; userId=${env.forum.moderation.userId}`,
  };
}

function problem(error: unknown): string {
  return error instanceof Error && error.name === 'TimeoutError' ? 'The forum did not answer in time.' : 'Could not reach the forum.';
}

async function read(forumUserId: string, fetcher: typeof fetch): Promise<ForumSuspension> {
  try {
    const response = await fetcher(`${env.forum.origin}/api/users/${forumUserId}`, { headers: headers(), redirect: 'error', signal: AbortSignal.timeout(5_000) });
    if (response.status === 404) return { ok: false, problem: 'That forum account no longer exists.' };
    if (!response.ok) return { ok: false, problem: `The forum answered ${response.status}.` };
    const user = userSchema.safeParse(await response.json());
    if (!user.success) return { ok: false, problem: 'The forum sent back something unexpected.' };
    const until = user.data.data.attributes.suspendedUntil;
    return { ok: true, suspendedUntil: until && Date.parse(until) > Date.now() ? new Date(until).toISOString() : null };
  } catch (error) {
    return { ok: false, problem: problem(error) };
  }
}

async function write(forumUserId: string, attributes: Record<string, string | null>, fetcher: typeof fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetcher(`${env.forum.origin}/api/users/${forumUserId}`, {
      method: 'PATCH',
      headers: headers(),
      redirect: 'error',
      body: JSON.stringify({ data: { type: 'users', id: forumUserId, attributes } }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw AppError.conflict('FORUM_UNREACHABLE', problem(error));
  }
  if (response.status === 401 || response.status === 403) {
    throw AppError.conflict('FORUM_FORBIDDEN', 'The forum refused: FORUM_API_KEY / FORUM_API_USER_ID must belong to a forum admin who can suspend users.');
  }
  if (!response.ok) throw AppError.conflict('FORUM_REFUSED', `The forum answered ${response.status}.`);
}

async function linkedForumUser(prisma: PrismaClient, accountId: string): Promise<{ username: string; forumUserId: string; forumUsername: string }> {
  if (!env.forum.moderation.enabled) {
    throw AppError.badRequest('FORUM_MODERATION_DISABLED', 'Forum moderation is off: set FORUM_API_KEY (a forum admin) on the server.');
  }
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { username: true, forumLink: { select: { forumUserId: true, forumUsername: true, forumOrigin: true } } },
  });
  if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');
  const link = account.forumLink;
  if (!link || link.forumOrigin !== env.forum.origin || !forumUserIdSchema.safeParse(link.forumUserId).success) {
    throw AppError.conflict('FORUM_NOT_LINKED', `${account.username} has not linked a forum account.`);
  }
  return { username: account.username, forumUserId: link.forumUserId, forumUsername: link.forumUsername };
}

export const ForumModerationService = {
  /** Never throws: an outage or a missing extension is a problem line for the page. */
  async status(forumUserId: string, fetcher: typeof fetch = fetch): Promise<ForumSuspension> {
    if (!env.forum.moderation.enabled) return { ok: false, problem: 'Forum moderation is off: set FORUM_API_KEY (a forum admin) on the server.' };
    if (!forumUserIdSchema.safeParse(forumUserId).success) return { ok: false, problem: 'That forum link looks broken. Unlink and relink it.' };
    return read(forumUserId, fetcher);
  },

  async suspend(prisma: PrismaClient, actor: AuditActor, accountId: string, length: AdminSuspensionLength, reason: string, now = new Date(), fetcher: typeof fetch = fetch): Promise<void> {
    const chosen = ADMIN_SUSPENSION_LENGTHS.find((option) => option.key === length);
    if (!chosen) throw AppError.badRequest('SUSPENSION_LENGTH_UNKNOWN', 'Pick one of the offered suspension lengths.');
    const user = await linkedForumUser(prisma, accountId);
    const until = new Date(now.getTime() + chosen.hours * 60 * 60_000);
    await write(user.forumUserId, { suspendedUntil: until.toISOString(), suspendReason: reason, suspendMessage: reason }, fetcher);
    const after = await read(user.forumUserId, fetcher);
    if (!after.ok || !after.suspendedUntil) {
      throw AppError.conflict('FORUM_SUSPEND_IGNORED', 'The forum took the request but did not record a suspension. Is the Suspend extension enabled?');
    }
    await AdminAuditService.record(prisma, actor, {
      action: 'forum.suspend',
      targetType: 'account',
      targetId: accountId,
      reason,
      after: { forumUsername: user.forumUsername, length: chosen.label, suspendedUntil: after.suspendedUntil },
    });
  },

  async lift(prisma: PrismaClient, actor: AuditActor, accountId: string, reason: string, fetcher: typeof fetch = fetch): Promise<void> {
    const user = await linkedForumUser(prisma, accountId);
    const before = await read(user.forumUserId, fetcher);
    if (before.ok && !before.suspendedUntil) throw AppError.conflict('FORUM_NOT_SUSPENDED', `${user.forumUsername} is not suspended on the forum.`);
    await write(user.forumUserId, { suspendedUntil: null, suspendReason: null, suspendMessage: null }, fetcher);
    const after = await read(user.forumUserId, fetcher);
    if (after.ok && after.suspendedUntil) throw AppError.conflict('FORUM_LIFT_IGNORED', 'The forum still shows a suspension. Lift it on the forum itself.');
    await AdminAuditService.record(prisma, actor, {
      action: 'forum.unsuspend',
      targetType: 'account',
      targetId: accountId,
      reason,
      before: { forumUsername: user.forumUsername, suspendedUntil: before.ok ? before.suspendedUntil : null },
    });
  },
};
