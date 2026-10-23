import fastifyCookie from '@fastify/cookie';
import type { Account, Session } from '@prisma/client';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { staffCan, type StaffCapability } from '@streets/shared';
import { env } from '../config/env.js';
import { resolveSession, touchSession } from '../auth/sessions.js';
import { assertBetaAccess } from '../auth/account-status.js';
import { adminNeedsSecondFactor, isStaff, staffRoleOf } from '../auth/play-access.js';
import { AppError } from '../utils/errors.js';
import { annotateLogContext } from '../utils/request-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: { account: Account; session: Session } | null;
  }

  interface FastifyInstance {
    /** preHandler that 401s anyone without a live session. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 401s guests and 403s anyone who is not a game admin (Founder or Admin). */
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 401s guests and 403s anyone whose staff role lacks the capability. */
    requireStaff: (capability: StaffCapability) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** rc.4: `remember` false makes a browser-session cookie (no expiry date). */
    setSessionCookie: (reply: FastifyReply, token: string, remember?: boolean) => void;
    clearSessionCookie: (reply: FastifyReply) => void;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCookie, { secret: env.SESSION_SECRET });

  fastify.decorateRequest('auth', null);

  fastify.decorate('setSessionCookie', (reply: FastifyReply, token: string, remember = true) => {
    reply.setCookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      signed: true,
      path: '/',
      // The server enforces idle and hard limits; the cookie only needs to outlive them.
      ...(remember ? { maxAge: Math.floor(env.sessions.maxAgeMs / 1000) } : {}),
    });
  });

  fastify.decorate('clearSessionCookie', (reply: FastifyReply) => {
    reply.clearCookie(env.SESSION_COOKIE_NAME, { path: '/' });
  });

  // Resolve the session once per request. Routes never touch cookies directly.
  // Native apps send `Authorization: Bearer <session token>`; browsers send
  // the signed session cookie. Both resolve to the same server session.
  fastify.addHook('onRequest', async (request) => {
    const bearer = bearerTokenFromHeader(request.headers.authorization);
    if (bearer) {
      const resolved = await resolveSession(fastify.prisma, bearer);
      if (!resolved) return;

      if (env.betaAccess.inviteOnly && !isStaff(resolved.account) && !resolved.account.betaApproved) {
        return;
      }

      request.auth = resolved;
      if (resolved) annotateLogContext({ accountId: resolved.account.id });
      void touchSession(fastify.prisma, resolved.session);
      return;
    }

    const raw = request.cookies[env.SESSION_COOKIE_NAME];
    if (!raw) return;

    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;

    const resolved = await resolveSession(fastify.prisma, unsigned.value);
    if (!resolved) return;

    if (env.betaAccess.inviteOnly && !isStaff(resolved.account) && !resolved.account.betaApproved) {
      return;
    }

    request.auth = resolved;
    // 1.0.0-F: who is asking, for every log line from here on.
    if (resolved) annotateLogContext({ accountId: resolved.account.id });
    void touchSession(fastify.prisma, resolved.session);
  });

  fastify.decorate('requireAuth', async (request: FastifyRequest) => {
    if (!request.auth) throw AppError.unauthenticated();
    assertBetaAccess(request.auth.account, env.betaAccess.inviteOnly);
  });

  fastify.decorate('requireAdmin', async (request: FastifyRequest) => assertStaff(request, 'admin'));

  fastify.decorate('requireStaff', (capability: StaffCapability) => async (request: FastifyRequest) => assertStaff(request, capability));
};

function assertStaff(request: FastifyRequest, capability: StaffCapability): void {
  if (!request.auth) throw AppError.unauthenticated();
  const { account, session } = request.auth;
  if (!staffCan(staffRoleOf(account), capability)) {
    throw AppError.forbidden(capability === 'admin' || !isStaff(account) ? 'Only game admins can do that.' : 'Your staff role cannot do that.');
  }
  // rc.2/rc.3: a password alone does not open admin tools; a second factor does.
  if (adminNeedsSecondFactor(account, session)) {
    throw new AppError(403, 'ADMIN_2FA_REQUIRED', 'Admin tools need a second factor. Log out, then sign in with Discord or with your authenticator code.');
  }
}

export default fp(authPlugin, { name: 'auth', dependencies: ['prisma'] });

/**
 * Native Android/iOS clients authenticate with the same session token browsers
 * keep in an http-only cookie, sent as `Authorization: Bearer <token>`.
 * Returns null when the header is absent or is not a bearer token.
 */
export function bearerTokenFromHeader(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/** True when the caller is the native app and wants the session token in JSON. */
export function wantsNativeSessionToken(header: unknown): boolean {
  return typeof header === 'string' && header.trim().toLowerCase() === 'android';
}
