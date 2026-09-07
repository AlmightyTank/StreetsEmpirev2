import type { FastifyPluginAsync } from 'fastify';
import { loginSchema, registerSchema } from '@streets/shared';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/sessions.js';
import { env } from '../config/env.js';
import { toAccountDto } from '../game/dto.js';
import { AppError } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';

/**
 * A real argon2id hash of a value nobody can log in with. Verified against
 * when the account does not exist so that a missing pimp name and a wrong
 * password take the same amount of time.
 */
let decoyHash: string | null = null;
async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hashPassword('decoy-for-constant-time-login');
  return decoyHash;
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/register', async (request, reply) => {
    const body = parseBody(registerSchema, request.body);
    const usernameNormalized = body.username.toLowerCase();

    const clash = await fastify.prisma.account.findFirst({
      where: {
        OR: [{ usernameNormalized }, { email: body.email }],
      },
      select: { usernameNormalized: true, email: true },
    });

    if (clash) {
      if (clash.usernameNormalized === usernameNormalized) {
        throw AppError.conflict(
          'USERNAME_TAKEN',
          `${body.username} is already working these streets. Pick another name.`,
          { username: 'That pimp name is taken.' },
        );
      }
      throw AppError.conflict(
        'EMAIL_TAKEN',
        'There is already an account using that email address.',
        { email: 'That email is already registered.' },
      );
    }

    const account = await fastify.prisma.account.create({
      data: {
        username: body.username,
        usernameNormalized,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        lastLoginAt: new Date(),
      },
    });

    const { token } = await createSession(fastify.prisma, account.id, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    fastify.setSessionCookie(reply, token);

    return reply.status(201).send({ account: toAccountDto(account) });
  });

  fastify.post('/login', async (request, reply) => {
    const body = parseBody(loginSchema, request.body);
    const identifier = body.identifier.toLowerCase();

    const account = await fastify.prisma.account.findFirst({
      where: {
        OR: [{ usernameNormalized: identifier }, { email: identifier }],
      },
    });

    const ok = account
      ? await verifyPassword(account.passwordHash, body.password)
      : await verifyPassword(await getDecoyHash(), body.password);

    if (!account || !ok) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'That pimp name and password do not match.',
      );
    }

    if (!account.isActive) {
      throw AppError.forbidden('This account has been shut down.');
    }

    const updated = await fastify.prisma.account.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    const { token } = await createSession(fastify.prisma, account.id, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    fastify.setSessionCookie(reply, token);

    return { account: toAccountDto(updated) };
  });

  fastify.post('/logout', async (request, reply) => {
    const raw = request.cookies[env.SESSION_COOKIE_NAME];
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        await destroySession(fastify.prisma, unsigned.value);
      }
    }
    fastify.clearSessionCookie(reply);
    return { ok: true };
  });

  fastify.get('/me', { preHandler: fastify.requireAuth }, async (request) => {
    return { account: toAccountDto(request.auth!.account) };
  });
};

export default authRoutes;
