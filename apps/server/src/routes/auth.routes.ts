import { randomBytes } from 'node:crypto';
import type { Account, PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { loginSchema, registerSchema } from '@streets/shared';
import { z } from 'zod';
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

const DISCORD_STATE_COOKIE = 'se_discord_oauth_state';
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';

const discordCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const discordTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
});

const discordUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  verified: z.boolean().nullable().optional(),
});

type DiscordUser = z.infer<typeof discordUserSchema>;

function authRedirect(message: string): string {
  const url = new URL('/login', env.frontendOrigin);
  url.searchParams.set('authError', message);
  return url.toString();
}

function postLoginRedirect(): string {
  return new URL('/join', env.frontendOrigin).toString();
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestOrigin(request: FastifyRequest): string {
  const host = firstHeader(request.headers['x-forwarded-host']) ?? request.headers.host;
  const protocol = firstHeader(request.headers['x-forwarded-proto']) ?? 'http';
  return `${protocol}://${host ?? 'localhost:3001'}`;
}

function discordRedirectUri(request: FastifyRequest): string {
  return env.discord.redirectUri || `${requestOrigin(request)}/api/auth/discord/callback`;
}

function setDiscordStateCookie(reply: FastifyReply, state: string): void {
  reply.setCookie(DISCORD_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    signed: true,
    path: '/api/auth',
    maxAge: 10 * 60,
  });
}

function clearDiscordStateCookie(reply: FastifyReply): void {
  reply.clearCookie(DISCORD_STATE_COOKIE, { path: '/api/auth' });
}

function readDiscordStateCookie(request: FastifyRequest): string | null {
  const raw = request.cookies[DISCORD_STATE_COOKIE];
  if (!raw) return null;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;

  return unsigned.value;
}

async function exchangeDiscordCode(code: string, redirectUri: string): Promise<string> {
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.discord.clientId,
      client_secret: env.discord.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) throw new Error(`Discord token exchange failed with ${response.status}`);

  const token = discordTokenSchema.parse(await response.json());
  return token.access_token;
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(DISCORD_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error(`Discord user fetch failed with ${response.status}`);

  return discordUserSchema.parse(await response.json());
}

function discordDisplayName(user: DiscordUser): string {
  return user.global_name ? `${user.global_name} (@${user.username})` : user.username;
}

function usernameBase(user: DiscordUser): string {
  const seed = user.global_name || user.username || `discord_${user.id.slice(-6)}`;
  const clean = seed.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
  if (clean.length >= 3) return clean;
  return `discord_${user.id.slice(-6)}`.slice(0, 20);
}

async function uniqueUsername(prisma: PrismaClient, base: string): Promise<string> {
  const fallback = base.length >= 3 ? base : 'discord';
  for (let i = 0; i < 100; i += 1) {
    const suffix = i === 0 ? '' : String(i);
    const candidate = `${fallback.slice(0, 20 - suffix.length)}${suffix}`;
    const existing = await prisma.account.findUnique({
      where: { usernameNormalized: candidate.toLowerCase() },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  return `discord_${randomBytes(5).toString('hex')}`.slice(0, 20);
}

async function accountForDiscordUser(
  prisma: PrismaClient,
  user: DiscordUser,
): Promise<Account> {
  if (!user.email || user.verified !== true) {
    throw new AppError(
      400,
      'DISCORD_EMAIL_NOT_VERIFIED',
      'Discord did not return a verified email address.',
    );
  }

  const now = new Date();
  const email = user.email.toLowerCase();
  const discordUsername = discordDisplayName(user);

  const existingByDiscord = await prisma.account.findUnique({
    where: { discordId: user.id },
  });

  if (existingByDiscord) {
    if (!existingByDiscord.isActive) throw AppError.forbidden('This account has been shut down.');

    return prisma.account.update({
      where: { id: existingByDiscord.id },
      data: {
        discordUsername,
        discordAvatar: user.avatar ?? null,
        emailVerifiedAt: existingByDiscord.email === email
          ? existingByDiscord.emailVerifiedAt ?? now
          : existingByDiscord.emailVerifiedAt,
        lastLoginAt: now,
      },
    });
  }

  const existingByEmail = await prisma.account.findUnique({ where: { email } });

  if (existingByEmail) {
    if (!existingByEmail.isActive) throw AppError.forbidden('This account has been shut down.');
    if (existingByEmail.discordId) {
      throw new AppError(
        409,
        'DISCORD_EMAIL_ALREADY_LINKED',
        'That email is already linked to another Discord account.',
      );
    }

    return prisma.account.update({
      where: { id: existingByEmail.id },
      data: {
        discordId: user.id,
        discordUsername,
        discordAvatar: user.avatar ?? null,
        discordLinkedAt: now,
        emailVerifiedAt: existingByEmail.emailVerifiedAt ?? now,
        lastLoginAt: now,
      },
    });
  }

  const username = await uniqueUsername(prisma, usernameBase(user));

  return prisma.account.create({
    data: {
      username,
      usernameNormalized: username.toLowerCase(),
      email,
      emailVerifiedAt: now,
      passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
      discordId: user.id,
      discordUsername,
      discordAvatar: user.avatar ?? null,
      discordLinkedAt: now,
      lastLoginAt: now,
    },
  });
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
        'That email or pimp name and password do not match.',
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

  fastify.get('/discord', async (request, reply) => {
    if (!env.discord.enabled) {
      return reply.redirect(authRedirect('Discord login is not configured yet.'));
    }

    const state = randomBytes(32).toString('base64url');
    const redirectUri = discordRedirectUri(request);
    const authorize = new URL(DISCORD_AUTHORIZE_URL);
    authorize.searchParams.set('client_id', env.discord.clientId);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', 'identify email');
    authorize.searchParams.set('state', state);

    setDiscordStateCookie(reply, state);
    return reply.redirect(authorize.toString());
  });

  fastify.get('/discord/callback', async (request, reply) => {
    const query = discordCallbackSchema.parse(request.query);
    const expectedState = readDiscordStateCookie(request);
    clearDiscordStateCookie(reply);

    if (query.error) {
      return reply.redirect(authRedirect('Discord login was cancelled.'));
    }

    if (!query.code || !query.state || !expectedState || query.state !== expectedState) {
      return reply.redirect(authRedirect('Discord login expired. Try again.'));
    }

    try {
      const accessToken = await exchangeDiscordCode(query.code, discordRedirectUri(request));
      const discordUser = await fetchDiscordUser(accessToken);
      const account = await accountForDiscordUser(fastify.prisma, discordUser);
      const { token } = await createSession(fastify.prisma, account.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      fastify.setSessionCookie(reply, token);

      return reply.redirect(postLoginRedirect());
    } catch (error) {
      fastify.log.warn({ err: error }, 'discord login failed');
      if (error instanceof AppError) return reply.redirect(authRedirect(error.message));
      return reply.redirect(authRedirect('Discord login failed. Try again.'));
    }
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
