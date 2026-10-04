import { createHash, randomBytes } from 'node:crypto';
import type { Account, PrismaClient, Session } from '@prisma/client';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { RULES_VERSION, changeEmailSchema, closeAccountSchema, deleteAccountSchema, twoFactorCodeBodySchema, twoFactorSetupSchema, twoFactorVerifySchema, changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, updateAccountProfileSettingsSchema, verifyEmailTokenSchema, type AccountSessionDto } from '@streets/shared';
import { z } from 'zod';
import { assertBetaAccess, assertCanSignIn, clearExpiredSuspension } from '../auth/account-status.js';
import { adminNeedsSecondFactor } from '../auth/play-access.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createAccountEmailToken, emailVerificationUrl } from '../auth/email-tokens.js';
import { createSession, destroySession, sessionHardEnd } from '../auth/sessions.js';
import { env } from '../config/env.js';
import { toAccountDto } from '../game/dto.js';
import { AccountProfileService } from '../services/account-profile.service.js';
import { AccountClosureService } from '../services/support.service.js';
import { AccountDataService } from '../services/account-data.service.js';
import { noteSignIn, notePasswordChanged } from '../services/sign-in-notice.service.js';
import { assertHuman } from '../auth/turnstile.js';
import { TwoFactorService } from '../services/two-factor.service.js';
import { matchKey } from '../services/admin-signals.service.js';
import { ExploitFlagService } from '../services/exploit-flag.service.js';
import { wakeDiscordBot } from '../services/discord-bot-push.service.js';
import { sendCurrentEmailVerification, sendEmailChangeVerification, sendPasswordResetEmail, sendTwoFactorNotice } from '../services/email.service.js';
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
/** rc.3. A sign-in waiting for its authenticator code. */
const TWO_FACTOR_COOKIE = 'se_2fa_challenge';
/** rc.4. "Trust this browser": sign-ins from it skip the code. */
const TRUSTED_DEVICE_COOKIE = 'se_trusted_device';
/** rc.4. Carries "Keep me signed in" through the Discord round trip. */
const DISCORD_REMEMBER_COOKIE = 'se_discord_remember';
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';

const discordStartSchema = z.object({
  // `?link=1` / `?link=true`; anything else (including "false" and "0") is not a link.
  link: z.string().optional().transform((value) => value === '1' || value === 'true'),
  // rc.4: `?remember=0` for a sign-in that ends with the browser. Anything else keeps it.
  remember: z.string().optional().transform((value) => value !== '0' && value !== 'false'),
});

const discordCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const discordUnlinkSchema = z.object({
  currentPassword: z.string().min(1),
});

const sessionParamsSchema = z.object({
  sessionId: z.string().min(1),
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

/** rc.3. Where the Discord callback sends a sign-in that still needs its authenticator code. */
function twoFactorRedirect(): string {
  const url = new URL('/login', env.frontendOrigin);
  url.searchParams.set('twoFactor', '1');
  return url.toString();
}

function passwordResetUrl(token: string): string {
  const url = new URL('/reset-password', env.frontendOrigin);
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

function setTwoFactorCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(TWO_FACTOR_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    signed: true,
    path: '/api/auth',
    maxAge: 10 * 60,
  });
}

function clearTwoFactorCookie(reply: FastifyReply): void {
  reply.clearCookie(TWO_FACTOR_COOKIE, { path: '/api/auth' });
}

function readSignedCookie(request: FastifyRequest, name: string): string | null {
  const raw = request.cookies[name];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
}

function setTrustedDeviceCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    signed: true,
    path: '/api/auth',
    maxAge: Math.floor(env.sessions.trustedDeviceMs / 1000),
  });
}

function readTwoFactorCookie(request: FastifyRequest): string | null {
  const raw = request.cookies[TWO_FACTOR_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
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

function toSessionDto(session: Session, currentSessionId: string): AccountSessionDto {
  return {
    id: session.id,
    current: session.id === currentSessionId,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    userAgent: session.userAgent,
    ip: session.ip,
    method: session.method,
    twoFactor: session.twoFactor,
    remember: session.remember,
    endsBy: sessionHardEnd(session).toISOString(),
  };
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

/** Seconds between verification emails to one account, so the button cannot be used to spam an inbox. */
const VERIFY_EMAIL_COOLDOWN_SECONDS = 60;

/**
 * Result of trying to send a verification email. Cooldown is different from a
 * delivery failure so the API never tells a player an email was sent when it was not.
 */
type VerificationEmailResult =
  | { sent: true; retryInSeconds: number }
  | { sent: false; retryInSeconds: number; reason: 'cooldown' | 'unavailable' | 'failed' };

/** Email a fresh verification link to the account's current address. */
async function sendVerificationEmail(
  prisma: PrismaClient,
  account: Account,
  request: FastifyRequest,
): Promise<VerificationEmailResult> {
  if (!env.email.configured) {
    request.log.error({ accountId: account.id }, 'email verification unavailable: RESEND_API_KEY / EMAIL_FROM are not configured');
    return { sent: false, retryInSeconds: 0, reason: 'unavailable' };
  }

  const recent = await prisma.accountEmailToken.findFirst({
    where: { accountId: account.id, purpose: 'VERIFY_EMAIL', createdAt: { gt: new Date(Date.now() - VERIFY_EMAIL_COOLDOWN_SECONDS * 1000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (recent) {
    return {
      sent: false,
      retryInSeconds: Math.max(1, VERIFY_EMAIL_COOLDOWN_SECONDS - Math.floor((Date.now() - recent.createdAt.getTime()) / 1000)),
      reason: 'cooldown',
    };
  }

  const { token, expiresAt } = await createAccountEmailToken({
    prisma,
    accountId: account.id,
    purpose: 'VERIFY_EMAIL',
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  });

  try {
    await sendCurrentEmailVerification(
      { to: account.email, username: account.username, url: emailVerificationUrl(token), expiresAt },
      request.log,
    );
  } catch (error) {
    request.log.error({ err: error, accountId: account.id }, 'email verification message failed');
    await prisma.accountEmailToken.deleteMany({
      where: { tokenHash: hashToken(token), purpose: 'VERIFY_EMAIL', usedAt: null },
    });
    return { sent: false, retryInSeconds: 0, reason: 'failed' };
  }

  return { sent: true, retryInSeconds: VERIFY_EMAIL_COOLDOWN_SECONDS };
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
    await clearExpiredSuspension(prisma, existingByDiscord, now);
    assertCanSignIn(existingByDiscord, now);

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
    await clearExpiredSuspension(prisma, existingByEmail, now);
    assertCanSignIn(existingByEmail, now);
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

  await clearExpiredSuspension(prisma, account);
  assertCanSignIn(account);

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

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/register', async (request, reply) => {
    const body = parseBody(registerSchema, request.body);
    // rc.5: the bot check comes first, before anything touches the database.
    await assertHuman(body.captchaToken, request.ip, request.log);
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

    // rc.2: one address may only make so many accounts a day (a household or a school
    // can share one, so the cap is generous). Going over is refused and flagged.
    const dailyLimit = env.accounts.signupDailyLimitPerIp;
    if (dailyLimit > 0) {
      const madeToday = await fastify.prisma.account.count({
        where: { registeredIp: request.ip, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (madeToday >= dailyLimit) {
        void ExploitFlagService.record(fastify.prisma, {
          kind: 'SIGNUP_ABUSE', severity: 'warning', accountId: null,
          // An opaque key for the network, never the address itself.
          route: `register · network ${matchKey('network', request.ip)}`,
          message: `More than ${dailyLimit} accounts attempted from one network within a day.`,
          detail: { limit: dailyLimit, existing: madeToday },
        });
        throw AppError.tooManyRequests('SIGNUP_LIMIT', 'Too many accounts have been made from this network today. Try again tomorrow, or sign in with Discord.');
      }
    }

    if (env.accounts.requireVerifiedEmail && !env.email.configured) {
      throw new AppError(
        503,
        'EMAIL_SENDING_DISABLED',
        'Email verification is temporarily unavailable. Try again later or register with Discord.',
      );
    }

    const account = await fastify.prisma.account.create({
      data: {
        registeredIp: request.ip,
        ageConfirmedAt: body.ageConfirmed ? new Date() : null,
        username: body.username,
        usernameNormalized,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        lastLoginAt: env.betaAccess.inviteOnly ? null : new Date(),
      },
    });

    // Players confirm their email before they can play (or sign in with Discord instead).
    if (!account.emailVerifiedAt) await sendVerificationEmail(fastify.prisma, account, request);

    if (env.betaAccess.inviteOnly && !account.isAdmin && !account.betaApproved) {
      return reply.status(202).send({
        account: toAccountDto(account),
        approvalRequired: true,
        message: 'Your beta account was created. An admin must approve it before you can enter the beta.',
      });
    }

    const { token } = await createSession(fastify.prisma, account.id, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    fastify.setSessionCookie(reply, token);
    await noteSignIn(fastify.prisma, request, reply, account);

    return reply.status(201).send({ account: toAccountDto(account) });
  });

  fastify.post('/login', async (request, reply) => {
    const body = parseBody(loginSchema, request.body);
    // rc.6: the bot check comes before the password is even looked at, so scripted
    // password guessing is stopped at the door.
    await assertHuman(body.captchaToken, request.ip, request.log);
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

    await clearExpiredSuspension(fastify.prisma, account);
    assertCanSignIn(account);
    assertBetaAccess(account, env.betaAccess.inviteOnly);

    const remember = body.remember ?? true;
    // rc.3: the password was right; with two-step on, the session waits for the code,
    // unless (rc.4) this browser was trusted at an earlier sign-in.
    if (account.twoFactorEnabledAt && !(await TwoFactorService.isTrustedDevice(fastify.prisma, account.id, readSignedCookie(request, TRUSTED_DEVICE_COOKIE)))) {
      setTwoFactorCookie(reply, await TwoFactorService.beginChallenge(fastify.prisma, account.id, 'PASSWORD', remember));
      return { twoFactorRequired: true };
    }

    const updated = await fastify.prisma.account.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    const { token } = await createSession(fastify.prisma, account.id, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      remember,
    });
    fastify.setSessionCookie(reply, token, remember);
    await noteSignIn(fastify.prisma, request, reply, updated);

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
    reply.setCookie(DISCORD_REMEMBER_COOKIE, query.remember ? '1' : '0', {
      httpOnly: true, sameSite: 'lax', secure: env.isProduction, signed: true, path: '/api/auth', maxAge: 10 * 60,
    });
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
        // rc.2: someone with only an admin's password must not be able to attach their own
        // Discord and so reach the admin tools. An admin signs in with Discord instead (a
        // Discord account on the same verified email links itself), or the operator
        // removes the role, the player links, and the role goes back.
        if (adminNeedsSecondFactor(request.auth.account, request.auth.session)) {
          return reply.redirect(accountRedirect('Admins cannot link Discord from a password-only sign-in. Sign in with your authenticator code, or use "Sign in with Discord" with a Discord account on this email.'));
        }
        await linkDiscordToAccount(fastify.prisma, request.auth.account, discordUser);
        return reply.redirect(accountRedirect('Discord is linked.'));
      }

      const account = await accountForDiscordUser(fastify.prisma, discordUser);
      assertBetaAccess(account, env.betaAccess.inviteOnly);
      const remember = readSignedCookie(request, DISCORD_REMEMBER_COOKIE) !== '0';
      reply.clearCookie(DISCORD_REMEMBER_COOKIE, { path: '/api/auth' });
      // rc.3: two-step sign-in applies to Discord sign-ins too (unless this browser is trusted, rc.4).
      if (account.twoFactorEnabledAt && !(await TwoFactorService.isTrustedDevice(fastify.prisma, account.id, readSignedCookie(request, TRUSTED_DEVICE_COOKIE)))) {
        setTwoFactorCookie(reply, await TwoFactorService.beginChallenge(fastify.prisma, account.id, 'DISCORD', remember));
        return reply.redirect(twoFactorRedirect());
      }
      const { token } = await createSession(fastify.prisma, account.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        method: 'DISCORD',
        remember,
      });
      fastify.setSessionCookie(reply, token, remember);
      await noteSignIn(fastify.prisma, request, reply, account);

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

  fastify.delete('/discord', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(discordUnlinkSchema, request.body);
    const account = request.auth!.account;

    if (!account.discordId) {
      return {
        ok: true,
        message: 'Discord is already unlinked.',
        account: toAccountDto(account, request.auth!.session),
      };
    }
    // An admin keeps a second factor: Discord goes only when an authenticator replaces it,
    // and only from a session that already passed a second factor.
    if (env.accounts.requireAdminSecondFactor && account.isAdmin && (!account.twoFactorEnabledAt || !request.auth!.session.twoFactor)) {
      throw AppError.conflict('ADMIN_DISCORD_LOCKED', 'An admin keeps Discord linked until an authenticator is set up. Turn on two-step sign-in first, then sign in with its code to unlink.');
    }

    const ok = await verifyPassword(account.passwordHash, body.currentPassword);
    if (!ok) {
      throw AppError.badRequest('CURRENT_PASSWORD_INVALID', 'That current password does not match.', {
        currentPassword: 'Enter your current password.',
      });
    }

    const oldDiscordId = account.discordId;
    const updated = await fastify.prisma.$transaction(async (tx) => {
      const next = await tx.account.update({
        where: { id: account.id },
        data: {
          discordId: null,
          discordUsername: null,
          discordAvatar: null,
          discordLinkedAt: null,
        },
      });

      await tx.notificationSettings.updateMany({
        where: { accountId: account.id },
        data: { discordEnabled: false },
      });
      await tx.notificationOutbox.deleteMany({
        where: { accountId: account.id, channel: 'DISCORD', claimedAt: null },
      });
      await tx.discordResyncRequest.create({
        data: {
          discordId: oldDiscordId,
          requestedByAccountId: account.id,
          requestedByUsername: account.username,
        },
      });

      return next;
    });

    wakeDiscordBot('resync');
    return { ok: true, message: 'Discord account unlinked.', account: toAccountDto(updated, request.auth!.session) };
  });


  fastify.post('/password/forgot', async (request) => {
    const body = parseBody(forgotPasswordSchema, request.body);
    // The bot check guards the public form. A signed-in player asking for a link to their
    // own address (Account settings) has already proved more than a captcha would.
    const ownAddress = request.auth?.account.email === body.email;
    if (!ownAddress) await assertHuman(body.captchaToken, request.ip, request.log);
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
      // rc.4: a new password means no browser stays trusted.
      await tx.trustedDevice.deleteMany({ where: { accountId: resetToken.accountId } });

      return tx.account.update({
        where: { id: resetToken.accountId },
        data: {
          passwordHash,
          emailVerifiedAt: resetToken.account.emailVerifiedAt ?? now,
          lastLoginAt: now,
        },
      });
    });

    assertBetaAccess(account, env.betaAccess.inviteOnly);
    await notePasswordChanged(request, account);
    // rc.3: a recovery link proves the inbox, not the authenticator: the code is still asked for.
    if (account.twoFactorEnabledAt) {
      setTwoFactorCookie(reply, await TwoFactorService.beginChallenge(fastify.prisma, account.id, 'PASSWORD'));
      return { twoFactorRequired: true };
    }
    const { token } = await createSession(fastify.prisma, account.id, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    fastify.setSessionCookie(reply, token);
    await noteSignIn(fastify.prisma, request, reply, account);

    return { account: toAccountDto(account) };
  });

  /* ---------- rc.3: two-step sign-in ---------- */

  /** The code for a sign-in that is waiting for one (after the password, Discord or a recovery link). */
  fastify.post('/2fa/verify', async (request, reply) => {
    const body = parseBody(twoFactorVerifySchema, request.body ?? {});
    const token = readTwoFactorCookie(request);
    if (!token) throw AppError.unauthenticated('Your sign-in timed out. Sign in again.');
    const { account, method, remember, usedRecoveryCode } = await TwoFactorService.completeChallenge(fastify.prisma, token, body.code);
    clearTwoFactorCookie(reply);
    await clearExpiredSuspension(fastify.prisma, account);
    assertCanSignIn(account);
    assertBetaAccess(account, env.betaAccess.inviteOnly);
    const updated = await fastify.prisma.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
    const { token: sessionToken, session } = await createSession(fastify.prisma, account.id, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      method,
      twoFactor: true,
      remember,
    });
    fastify.setSessionCookie(reply, sessionToken, remember);
    await noteSignIn(fastify.prisma, request, reply, updated);
    // rc.4: "Trust this browser" skips the code here for TRUSTED_DEVICE_DAYS.
    if (body.trustDevice && env.sessions.trustedDeviceMs > 0) {
      setTrustedDeviceCookie(reply, await TwoFactorService.trustDevice(fastify.prisma, account.id, { userAgent: request.headers['user-agent'], ip: request.ip }));
    }
    if (usedRecoveryCode) {
      const left = await fastify.prisma.twoFactorRecoveryCode.count({ where: { accountId: account.id, usedAt: null } });
      return { account: toAccountDto(updated, session), recoveryCodesLeft: left };
    }
    return { account: toAccountDto(updated, session) };
  });

  fastify.get('/2fa', { preHandler: fastify.requireAuth }, async (request) => {
    return TwoFactorService.status(fastify.prisma, request.auth!.account);
  });

  /** rc.4. Re-confirm with a code without signing out (admin tools ask every ADMIN_2FA_MAX_AGE_HOURS). */
  fastify.post('/2fa/step-up', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(twoFactorCodeBodySchema, request.body ?? {});
    const { account, session } = request.auth!;
    await TwoFactorService.stepUp(fastify.prisma, account, session.id, body.code);
    return { account: toAccountDto(account, { ...session, twoFactor: true, secondFactorAt: new Date() }) };
  });

  /** rc.4. Browsers that skip the code at sign-in. */
  fastify.get('/2fa/trusted-devices', { preHandler: fastify.requireAuth }, async (request) => ({
    devices: await TwoFactorService.listTrustedDevices(fastify.prisma, request.auth!.account.id, readSignedCookie(request, TRUSTED_DEVICE_COOKIE)),
  }));

  fastify.delete('/2fa/trusted-devices', { preHandler: fastify.requireAuth }, async (request) => ({
    ok: true, forgotten: await TwoFactorService.forgetTrustedDevices(fastify.prisma, request.auth!.account.id),
  }));

  fastify.delete('/2fa/trusted-devices/:deviceId', { preHandler: fastify.requireAuth }, async (request) => {
    const { deviceId } = parseBody(z.object({ deviceId: z.string().min(1).max(64) }), request.params);
    return { ok: true, forgotten: await TwoFactorService.forgetTrustedDevices(fastify.prisma, request.auth!.account.id, deviceId) };
  });

  fastify.post('/2fa/setup', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(twoFactorSetupSchema, request.body ?? {});
    const { account, session } = request.auth!;
    // Someone with only an admin's password must not enrol their own authenticator.
    if (adminNeedsSecondFactor(account, session)) {
      throw AppError.conflict('ADMIN_2FA_LOCKED', 'An admin sets up an authenticator from a Discord sign-in. Log out and sign in with Discord first, or ask the server operator.');
    }
    // A Discord sign-in is its own proof; a Discord-made account never chose a password.
    if (session.method !== 'DISCORD' || body.currentPassword) {
      if (!body.currentPassword || !(await verifyPassword(account.passwordHash, body.currentPassword))) {
        throw AppError.badRequest('CURRENT_PASSWORD_INVALID', 'That password does not match.', { currentPassword: 'Enter your password.' });
      }
    }
    return TwoFactorService.setup(fastify.prisma, account);
  });

  fastify.post('/2fa/enable', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(twoFactorCodeBodySchema, request.body ?? {});
    const { account, session } = request.auth!;
    const recoveryCodes = await TwoFactorService.enable(fastify.prisma, account, session.id, body.code);
    await sendTwoFactorNotice({ to: account.email, username: account.username, change: 'enabled' }, request.log)
      .catch((error: unknown) => request.log.warn({ err: error }, 'two-factor notice failed'));
    const updated = await fastify.prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    return { recoveryCodes, account: toAccountDto(updated, { ...session, twoFactor: true, secondFactorAt: new Date() }) };
  });

  fastify.post('/2fa/disable', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(twoFactorCodeBodySchema, request.body ?? {});
    const { account, session } = request.auth!;
    await TwoFactorService.disable(fastify.prisma, account, session.id, body.code);
    await sendTwoFactorNotice({ to: account.email, username: account.username, change: 'disabled' }, request.log)
      .catch((error: unknown) => request.log.warn({ err: error }, 'two-factor notice failed'));
    const updated = await fastify.prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    return { ok: true, message: 'Two-step sign-in is off.', account: toAccountDto(updated, { ...session, twoFactor: false, secondFactorAt: null }) };
  });

  fastify.post('/2fa/recovery-codes', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(twoFactorCodeBodySchema, request.body ?? {});
    const { account, session } = request.auth!;
    const recoveryCodes = await TwoFactorService.regenerateRecoveryCodes(fastify.prisma, account, session.id, body.code);
    await sendTwoFactorNotice({ to: account.email, username: account.username, change: 'codes' }, request.log)
      .catch((error: unknown) => request.log.warn({ err: error }, 'two-factor notice failed'));
    return { recoveryCodes };
  });

  /** rc.2. The player closes their own account: signed out everywhere, kept in the season history. */
  fastify.post('/account/close', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const body = parseBody(closeAccountSchema, request.body ?? {});
    await AccountClosureService.close(fastify.prisma, request.auth!.account, request.auth!.session, body.currentPassword);
    fastify.clearSessionCookie(reply);
    return { ok: true, message: 'Your account is closed. Your finished seasons stay in the history.' };
  });

  /** rc.5. "Download my data": everything kept about the account, as a JSON file. */
  fastify.get('/account/export', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const data = await AccountDataService.export(fastify.prisma, request.auth!.account.id);
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('cache-control', 'no-store');
    reply.header('content-disposition', `attachment; filename="streetsempire-${request.auth!.account.username}-${stamp}.json"`);
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(data, null, 2));
  });

  /** rc.5. The player deletes their own account (anonymized if they played a season). */
  fastify.post('/account/delete', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const body = parseBody(deleteAccountSchema, request.body ?? {});
    const result = await AccountDataService.deleteSelf(fastify.prisma, request.auth!.account, request.auth!.session, body.currentPassword);
    fastify.clearSessionCookie(reply);
    return {
      ok: true,
      mode: result.mode,
      message: result.mode === 'deleted'
        ? 'Your account is deleted.'
        : 'Your account is deleted. Your finished seasons now show "Deleted Player" instead of your name.',
    };
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

    const passwordHash = await hashPassword(body.password);

    await fastify.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { passwordHash },
      });
      // rc.4: a new password means no browser stays trusted to skip the code.
      await tx.trustedDevice.deleteMany({ where: { accountId: account.id } });

      if (body.revokeOtherSessions) {
        await tx.session.deleteMany({
          where: {
            accountId: account.id,
            id: { not: request.auth!.session.id },
          },
        });
      }
    });

    await notePasswordChanged(request, account);
    return {
      ok: true,
      message: body.revokeOtherSessions
        ? 'Your password was changed and other sessions were logged out.'
        : 'Your password was changed.',
    };
  });


  fastify.post('/email/verify/request', { preHandler: fastify.requireAuth }, async (request) => {
    const account = request.auth!.account;
    if (account.emailVerifiedAt) {
      return { ok: true, message: 'Your current email is already verified.' };
    }
    const result = await sendVerificationEmail(fastify.prisma, account, request);
    if (!result.sent) {
      if (result.reason === 'cooldown') {
        throw new AppError(429, 'VERIFY_EMAIL_COOLDOWN', `We just sent one. Give it a minute; you can ask again in ${result.retryInSeconds} seconds.`);
      }
      throw new AppError(
        503,
        result.reason === 'unavailable' ? 'EMAIL_SENDING_DISABLED' : 'EMAIL_SEND_FAILED',
        result.reason === 'unavailable'
          ? 'Email sending is not configured on this server yet. Try again later or use Discord.'
          : 'The verification email could not be sent just now. Try again in a moment.',
      );
    }
    return { ok: true, message: `We sent a new link to ${account.email}. It can take a minute to arrive; check spam too.` };
  });

  /** Accept the game rules shown in the rules dialog. The version must be the current one. */
  fastify.post('/rules/accept', { preHandler: fastify.requireAuth }, async (request) => {
    const { version } = parseBody(z.object({ version: z.string().min(1).max(40) }).strict(), request.body ?? {});
    if (version !== RULES_VERSION) {
      throw AppError.conflict('RULES_CHANGED', 'The rules were just updated. Read the new version and accept that.');
    }
    const account = await fastify.prisma.account.update({
      where: { id: request.auth!.account.id },
      data: { rulesAcceptedAt: new Date(), rulesAcceptedVersion: RULES_VERSION },
    });
    return { account: toAccountDto(account, request.auth!.session) };
  });

  fastify.post('/email/change/request', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(changeEmailSchema, request.body);
    const account = request.auth!.account;

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

    // A mistyped sign-up address has never been confirmed, so there is nothing to protect:
    // fix it straight away and send the link to the new one. Links already sent to the old
    // address are cancelled first, or one of them could confirm the new address.
    if (!account.emailVerifiedAt) {
      const updated = await fastify.prisma.$transaction(async (tx) => {
        await tx.accountEmailToken.deleteMany({ where: { accountId: account.id, purpose: 'VERIFY_EMAIL', usedAt: null } });
        return tx.account.update({ where: { id: account.id }, data: { email: body.email } });
      });
      const delivery = await sendVerificationEmail(fastify.prisma, updated, request);
      const message = delivery.sent
        ? `Your email is now ${body.email}. We sent a verification link there.`
        : 'Your email was changed, but the verification message could not be sent. Use "Send the link again" in a moment.';
      return { ok: true, message, account: toAccountDto(updated, request.auth!.session) };
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
      throw new AppError(503, 'EMAIL_SEND_FAILED', 'The confirmation email could not be sent just now. Try again in a moment.');
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
      account: request.auth?.account.id === updated.id ? toAccountDto(updated, request.auth.session) : undefined,
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

  fastify.get('/sessions', { preHandler: fastify.requireAuth }, async (request) => {
    const sessions = await fastify.prisma.session.findMany({
      where: {
        accountId: request.auth!.account.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      sessions: sessions.map((session) => toSessionDto(session, request.auth!.session.id)),
    };
  });

  fastify.delete('/sessions/others', { preHandler: fastify.requireAuth }, async (request) => {
    const result = await fastify.prisma.session.deleteMany({
      where: {
        accountId: request.auth!.account.id,
        id: { not: request.auth!.session.id },
      },
    });
    return { ok: true, revoked: result.count };
  });

  fastify.delete('/sessions/:sessionId', { preHandler: fastify.requireAuth }, async (request) => {
    const params = sessionParamsSchema.parse(request.params);
    if (params.sessionId === request.auth!.session.id) {
      throw AppError.badRequest('CURRENT_SESSION', 'Use Log out to end your current session.');
    }

    const result = await fastify.prisma.session.deleteMany({
      where: {
        id: params.sessionId,
        accountId: request.auth!.account.id,
      },
    });
    return { ok: true, revoked: result.count };
  });

  fastify.get('/profile-settings', { preHandler: fastify.requireAuth }, async (request) =>
    AccountProfileService.settings(fastify.prisma, request.auth!.account.id));

  fastify.put('/profile-settings', { preHandler: fastify.requireAuth }, async (request) => {
    const body = parseBody(updateAccountProfileSettingsSchema, request.body);
    return AccountProfileService.update(fastify.prisma, request.auth!.account.id, body);
  });

  fastify.get('/me', { preHandler: fastify.requireAuth }, async (request) => {
    return { account: toAccountDto(request.auth!.account, request.auth!.session) };
  });
};

export default authRoutes;
