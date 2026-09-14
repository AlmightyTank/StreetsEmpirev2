import { createHash, randomBytes } from 'node:crypto';
import type { Account, AccountEmailTokenPurpose, PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { changeEmailSchema, changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, updateAccountProfileSettingsSchema, verifyEmailTokenSchema } from '@streets/shared';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/sessions.js';
import { env } from '../config/env.js';
import { toAccountDto } from '../game/dto.js';
import { AccountProfileService } from '../services/account-profile.service.js';
import { sendCurrentEmailVerification, sendEmailChangeVerification, sendPasswordResetEmail } from '../services/email.service.js';
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
const DISCORD_LINK_COOKIE = 'se_discord_oauth_link';
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';

const discordStartSchema = z.object({
  link: z.coerce.boolean().optional(),
});

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

function accountRedirect(message: string): string {
  const url = new URL('/account', env.frontendOrigin);
  url.searchParams.set('accountMessage', message);
  return url.toString();
}

function postLoginRedirect(): string {
  return new URL('/join', env.frontendOrigin).toString();
}

function passwordResetUrl(token: string): string {
  const url = new URL('/reset-password', env.frontendOrigin);
  url.searchParams.set('token', token);
  return url.toString();
}

function emailVerificationUrl(token: string): string {
  const url = new URL('/verify-email', env.frontendOrigin);
  url.searchParams.set('token', token);
  return url.toString();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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

function setDiscordLinkCookie(reply: FastifyReply): void {
  reply.setCookie(DISCORD_LINK_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    signed: true,
    path: '/api/auth',
    maxAge: 10 * 60,
  });
}

function clearDiscordLinkCookie(reply: FastifyReply): void {
  reply.clearCookie(DISCORD_LINK_COOKIE, { path: '/api/auth' });
}

function readDiscordLinkCookie(request: FastifyRequest): boolean {
  const raw = request.cookies[DISCORD_LINK_COOKIE];
  if (!raw) return false;

  const unsigned = request.unsignCookie(raw);
  return Boolean(unsigned.valid && unsigned.value === '1');
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


async function linkDiscordToAccount(
  prisma: PrismaClient,
  account: Account,
  user: DiscordUser,
): Promise<Account> {
  if (!user.email || user.verified !== true) {
    throw new AppError(
      400,
      'DISCORD_EMAIL_NOT_VERIFIED',
      'Discord did not return a verified email address.',
    );
  }

  if (!account.isActive) throw AppError.forbidden('This account has been shut down.');

  const existingByDiscord = await prisma.account.findUnique({
    where: { discordId: user.id },
  });
  if (existingByDiscord && existingByDiscord.id !== account.id) {
    throw new AppError(
      409,
      'DISCORD_ALREADY_LINKED',
      'That Discord account is already linked to another player.',
    );
  }

  const email = user.email.toLowerCase();
  const existingByEmail = await prisma.account.findUnique({ where: { email } });
  if (existingByEmail && existingByEmail.id !== account.id) {
    throw new AppError(
      409,
      'DISCORD_EMAIL_ALREADY_USED',
      'That Discord email already belongs to another account.',
    );
  }

  if (account.discordId && account.discordId !== user.id) {
    throw new AppError(
      409,
      'DISCORD_ALREADY_LINKED',
      'This account is already linked to a different Discord account.',
    );
  }

  const now = new Date();
  return prisma.account.update({
    where: { id: account.id },
    data: {
      discordId: user.id,
      discordUsername: discordDisplayName(user),
      discordAvatar: user.avatar ?? null,
      discordLinkedAt: account.discordLinkedAt ?? now,
      emailVerifiedAt: account.email === email ? account.emailVerifiedAt ?? now : account.emailVerifiedAt,
      lastLoginAt: now,
    },
  });
}

async function createAccountEmailToken(input: {
  prisma: PrismaClient;
  accountId: string;
  purpose: AccountEmailTokenPurpose;
  newEmail?: string;
  userAgent: string | undefined;
  ip: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.email.verificationTtlMinutes * 60_000);

  await input.prisma.accountEmailToken.create({
    data: {
      accountId: input.accountId,
      tokenHash: hashToken(token),
      purpose: input.purpose,
      newEmail: input.newEmail,
      expiresAt,
      userAgent: input.userAgent,
      ip: input.ip,
    },
  });

  return { token, expiresAt };
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
    const query = discordStartSchema.parse(request.query);
    const linkMode = query.link === true;

    if (!env.discord.enabled) {
      return reply.redirect(linkMode
        ? accountRedirect('Discord login is not configured yet.')
        : authRedirect('Discord login is not configured yet.'));
    }

    if (linkMode && !request.auth) {
      return reply.redirect(authRedirect('Log in before linking Discord.'));
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
    if (linkMode) setDiscordLinkCookie(reply);
    return reply.redirect(authorize.toString());
  });

  fastify.get('/discord/callback', async (request, reply) => {
    const query = discordCallbackSchema.parse(request.query);
    const expectedState = readDiscordStateCookie(request);
    const linkMode = readDiscordLinkCookie(request);
    clearDiscordStateCookie(reply);
    clearDiscordLinkCookie(reply);

    if (query.error) {
      return reply.redirect(linkMode
        ? accountRedirect('Discord linking was cancelled.')
        : authRedirect('Discord login was cancelled.'));
    }

    if (!query.code || !query.state || !expectedState || query.state !== expectedState) {
      return reply.redirect(linkMode
        ? accountRedirect('Discord linking expired. Try again.')
        : authRedirect('Discord login expired. Try again.'));
    }

    try {
      const accessToken = await exchangeDiscordCode(query.code, discordRedirectUri(request));
      const discordUser = await fetchDiscordUser(accessToken);

      if (linkMode) {
        if (!request.auth) return reply.redirect(authRedirect('Log in before linking Discord.'));
        await linkDiscordToAccount(fastify.prisma, request.auth.account, discordUser);
        return reply.redirect(accountRedirect('Discord is linked.'));
      }

      const account = await accountForDiscordUser(fastify.prisma, discordUser);
      const { token } = await createSession(fastify.prisma, account.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      fastify.setSessionCookie(reply, token);

      return reply.redirect(postLoginRedirect());
    } catch (error) {
      fastify.log.warn({ err: error }, linkMode ? 'discord link failed' : 'discord login failed');
      if (error instanceof AppError) {
        return reply.redirect(linkMode ? accountRedirect(error.message) : authRedirect(error.message));
      }
      return reply.redirect(linkMode
        ? accountRedirect('Discord linking failed. Try again.')
        : authRedirect('Discord login failed. Try again.'));
    }
  });


  fastify.post('/password/forgot', async (request) => {
    const body = parseBody(forgotPasswordSchema, request.body);
    const account = await fastify.prisma.account.findUnique({
      where: { email: body.email },
    });

    if (account?.isActive) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + env.email.passwordResetTtlMinutes * 60_000);

      await fastify.prisma.passwordResetToken.create({
        data: {
          accountId: account.id,
          tokenHash: hashToken(token),
          expiresAt,
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        },
      });

      try {
        await sendPasswordResetEmail(
          {
            to: account.email,
            username: account.username,
            url: passwordResetUrl(token),
            expiresAt,
          },
          fastify.log,
        );
      } catch (error) {
        fastify.log.error(
          { err: error, accountId: account.id },
          'password recovery email failed',
        );
      }
    }

    return {
      ok: true,
      message: 'If that email is on an account, recovery instructions are on the way.',
    };
  });

  fastify.post('/password/reset', async (request, reply) => {
    const body = parseBody(resetPasswordSchema, request.body);
    const tokenHash = hashToken(body.token);
    const now = new Date();

    const resetToken = await fastify.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      include: { account: true },
    });

    if (!resetToken || !resetToken.account.isActive) {
      throw AppError.badRequest(
        'PASSWORD_RESET_INVALID',
        'That recovery link is expired or has already been used.',
      );
    }

    const passwordHash = await hashPassword(body.password);

    const account = await fastify.prisma.$transaction(async (tx) => {
      const claim = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (claim.count !== 1) {
        throw AppError.badRequest(
          'PASSWORD_RESET_INVALID',
          'That recovery link is expired or has already been used.',
        );
      }

      await tx.session.deleteMany({ where: { accountId: resetToken.accountId } });

      return tx.account.update({
        where: { id: resetToken.accountId },
        data: {
          passwordHash,
          emailVerifiedAt: resetToken.account.emailVerifiedAt ?? now,
          lastLoginAt: now,
        },
      });
    });

    const { token } = await createSession(fastify.prisma, account.id, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    fastify.setSessionCookie(reply, token);

    return { account: toAccountDto(account) };
  });

  fastify.post('/password/change', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(changePasswordSchema, request.body);
    const account = request.auth!.account;
    const ok = await verifyPassword(account.passwordHash, body.currentPassword);
    if (!ok) {
      throw AppError.badRequest('CURRENT_PASSWORD_INVALID', 'That current password does not match.', {
        currentPassword: 'Enter your current password.',
      });
    }

    await fastify.prisma.account.update({
      where: { id: account.id },
      data: { passwordHash: await hashPassword(body.password) },
    });

    return { ok: true, message: 'Your password was changed.' };
  });


  fastify.post('/email/verify/request', { preHandler: fastify.requireAuth }, async (request) => {
    const account = request.auth!.account;
    if (account.emailVerifiedAt) {
      return { ok: true, message: 'Your current email is already verified.' };
    }

    const { token, expiresAt } = await createAccountEmailToken({
      prisma: fastify.prisma,
      accountId: account.id,
      purpose: 'VERIFY_EMAIL',
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    try {
      await sendCurrentEmailVerification(
        {
          to: account.email,
          username: account.username,
          url: emailVerificationUrl(token),
          expiresAt,
        },
        fastify.log,
      );
    } catch (error) {
      fastify.log.error({ err: error, accountId: account.id }, 'email verification message failed');
    }

    return { ok: true, message: 'Verification instructions were sent to your current email.' };
  });

  fastify.post('/email/change/request', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(changeEmailSchema, request.body);
    const account = request.auth!.account;

    if (!account.emailVerifiedAt) {
      throw AppError.badRequest(
        'CURRENT_EMAIL_UNVERIFIED',
        'Verify your current email before changing it.',
      );
    }

    if (body.email === account.email) {
      return { ok: true, message: 'That is already your account email.' };
    }

    const clash = await fastify.prisma.account.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (clash) {
      throw AppError.conflict('EMAIL_TAKEN', 'There is already an account using that email address.', {
        email: 'That email is already registered.',
      });
    }

    const { token, expiresAt } = await createAccountEmailToken({
      prisma: fastify.prisma,
      accountId: account.id,
      purpose: 'CHANGE_EMAIL',
      newEmail: body.email,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    try {
      await sendEmailChangeVerification(
        {
          to: body.email,
          currentEmail: account.email,
          username: account.username,
          url: emailVerificationUrl(token),
          expiresAt,
        },
        fastify.log,
      );
    } catch (error) {
      fastify.log.error({ err: error, accountId: account.id }, 'email change message failed');
    }

    return { ok: true, message: 'A confirmation link was sent to the new email.' };
  });

  fastify.post('/email/verify', async (request) => {
    const body = parseBody(verifyEmailTokenSchema, request.body);
    const tokenHash = hashToken(body.token);
    const now = new Date();

    const emailToken = await fastify.prisma.accountEmailToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      include: { account: true },
    });

    if (!emailToken || !emailToken.account.isActive) {
      throw AppError.badRequest(
        'EMAIL_TOKEN_INVALID',
        'That email link is expired or has already been used.',
      );
    }

    const updated = await fastify.prisma.$transaction(async (tx) => {
      const claim = await tx.accountEmailToken.updateMany({
        where: {
          id: emailToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (claim.count !== 1) {
        throw AppError.badRequest(
          'EMAIL_TOKEN_INVALID',
          'That email link is expired or has already been used.',
        );
      }

      if (emailToken.purpose === 'CHANGE_EMAIL') {
        if (!emailToken.newEmail) {
          throw AppError.badRequest('EMAIL_TOKEN_INVALID', 'That email link is not valid.');
        }

        const clash = await tx.account.findUnique({
          where: { email: emailToken.newEmail },
          select: { id: true },
        });
        if (clash && clash.id !== emailToken.accountId) {
          throw AppError.conflict('EMAIL_TAKEN', 'There is already an account using that email address.');
        }

        return tx.account.update({
          where: { id: emailToken.accountId },
          data: { email: emailToken.newEmail, emailVerifiedAt: now },
        });
      }

      return tx.account.update({
        where: { id: emailToken.accountId },
        data: { emailVerifiedAt: emailToken.account.emailVerifiedAt ?? now },
      });
    });

    return {
      ok: true,
      message: emailToken.purpose === 'CHANGE_EMAIL'
        ? 'Your account email was changed and verified.'
        : 'Your account email is verified.',
      account: request.auth?.account.id === updated.id ? toAccountDto(updated) : undefined,
    };
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

  fastify.get('/profile-settings', { preHandler: fastify.requireAuth }, async (request) =>
    AccountProfileService.settings(fastify.prisma, request.auth!.account.id));

  fastify.put('/profile-settings', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(updateAccountProfileSettingsSchema, request.body);
    return AccountProfileService.update(fastify.prisma, request.auth!.account.id, body);
  });

  fastify.get('/me', { preHandler: fastify.requireAuth }, async (request) => {
    return { account: toAccountDto(request.auth!.account) };
  });
};

export default authRoutes;
