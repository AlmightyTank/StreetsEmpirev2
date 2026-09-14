import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient, type ForumLink } from '@prisma/client';
import type { ForumLinkDto } from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { FORUM_LINK_TTL_SECONDS, hashForumNonce, invalidForumProof, signForumPayload, verifyForumProof } from './forum-proof.js';

/** Flarum's /u/{slug} resolves usernames, so go through the extension's ID redirect. */
export function forumProfileUrl(link: Pick<ForumLink, 'forumOrigin' | 'forumUserId'>): string {
  return `${link.forumOrigin}/street-empire/u/${link.forumUserId}`;
}

export function forumLinkDto(link: ForumLink | null): ForumLinkDto | null {
  return link ? {
    username: link.forumUsername,
    profileUrl: forumProfileUrl(link),
    linkedAt: link.createdAt.toISOString(),
  } : null;
}

async function lockAccount(tx: Prisma.TransactionClient, accountId: string) {
  // Serialize start/finish/unlink for an account, including concurrent tabs.
  await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${accountId} FOR UPDATE`;
}

export const ForumLinkService = {
  async start(prisma: PrismaClient, accountId: string, sessionId: string, username: string) {
    const nonce = randomBytes(32).toString('hex');
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + FORUM_LINK_TTL_SECONDS;
    await prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      if (await tx.forumLink.findUnique({ where: { accountId } })) {
        throw AppError.conflict('FORUM_ALREADY_LINKED', 'Unlink your current forum account before linking another.');
      }
      const data = { nonceHash: hashForumNonce(nonce), sessionId, expiresAt: new Date(exp * 1000) };
      await tx.forumLinkRequest.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
    });
    const token = signForumPayload({ v: 1, purpose: 'forum-link-request', iss: new URL(env.frontendOrigin).origin, aud: env.forum.origin, nonce, username, iat, exp }, env.forum.secret);
    // Fragments keep the proof out of access logs and referrer headers.
    return { url: `${env.forum.origin}/street-empire/link#request=${token}` };
  },

  async finish(prisma: PrismaClient, accountId: string, sessionId: string, token: string) {
    const proof = verifyForumProof(token, env.forum.secret, env.forum.origin, new URL(env.frontendOrigin).origin);
    try {
      return await prisma.$transaction(async (tx) => {
        await lockAccount(tx, accountId);
        const consumed = await tx.forumLinkRequest.deleteMany({ where: {
          accountId, sessionId, nonceHash: hashForumNonce(proof.nonce), expiresAt: { gt: new Date() },
        } });
        if (consumed.count !== 1) throw invalidForumProof();
        const link = await tx.forumLink.create({ data: {
          accountId, forumOrigin: env.forum.origin, forumUserId: proof.userId, forumUsername: proof.username,
        } });
        return forumLinkDto(link);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict('FORUM_ALREADY_LINKED', 'That game or forum account is already linked. Unlink the existing connection first.');
      }
      throw error;
    }
  },

  async unlink(prisma: PrismaClient, accountId: string) {
    await prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await tx.forumLinkRequest.deleteMany({ where: { accountId } });
      await tx.forumLink.deleteMany({ where: { accountId } });
    });
    return { ok: true as const };
  },
};
