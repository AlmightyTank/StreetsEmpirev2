import fastifyCookie from '@fastify/cookie';
import type { Account, Session } from '@prisma/client';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { resolveSession, touchSession } from '../auth/sessions.js';
import { assertBetaAccess } from '../auth/account-status.js';
import { AppError } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: { account: Account; session: Session } | null;
  }

  interface FastifyInstance {
    /** preHandler that 401s anyone without a live session. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 401s guests and 403s anyone who is not a game admin. */
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    setSessionCookie: (reply: FastifyReply, token: string) => void;
    clearSessionCookie: (reply: FastifyReply) => void;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCookie, { secret: env.SESSION_SECRET });

  fastify.decorateRequest('auth', null);

  fastify.decorate('setSessionCookie', (reply: FastifyReply, token: string) => {
    reply.setCookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      signed: true,
      path: '/',
      maxAge: Math.floor(env.sessionTtlMs / 1000),
    });
  });

  fastify.decorate('clearSessionCookie', (reply: FastifyReply) => {
    reply.clearCookie(env.SESSION_COOKIE_NAME, { path: '/' });
  });

  // Resolve the session once per request. Routes never touch cookies directly.
  fastify.addHook('onRequest', async (request) => {
    const raw = request.cookies[env.SESSION_COOKIE_NAME];
    if (!raw) return;

    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;

    const resolved = await resolveSession(fastify.prisma, unsigned.value);
    if (!resolved) return;

    request.auth = resolved;
    if (!env.betaAccess.inviteOnly || resolved.account.isAdmin || resolved.account.betaApproved) {
      void touchSession(fastify.prisma, resolved.session.id);
    }
  });

  fastify.decorate('requireAuth', async (request: FastifyRequest) => {
    if (!request.auth) throw AppError.unauthenticated();
    assertBetaAccess(request.auth.account, env.betaAccess.inviteOnly);
  });

  fastify.decorate('requireAdmin', async (request: FastifyRequest) => {
    if (!request.auth) throw AppError.unauthenticated();
    if (!request.auth.account.isAdmin) throw AppError.forbidden('Only game admins can do that.');
  });
};

export default fp(authPlugin, { name: 'auth', dependencies: ['prisma'] });
