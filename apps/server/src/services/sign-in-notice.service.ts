import { createHash, randomBytes } from 'node:crypto';
import type { Account, PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { sendSecurityNotice } from './email.service.js';

/** rc.5. A long-lived, random per-browser id, so a sign-in from a new browser can be told apart. */
export const DEVICE_COOKIE = 'se_device';
const DEVICE_COOKIE_MAX_AGE = 2 * 365 * 24 * 60 * 60;

function hashDevice(id: string): string {
  return createHash('sha256').update(`device:${id}`).digest('hex');
}

export function accountSettingsUrl(): string {
  return new URL('/account', env.frontendOrigin).toString();
}

/** A short "Chrome on Windows"-style label for emails, from the user agent. */
export function browserLabel(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /OPR\//.test(userAgent) ? 'Opera' : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'A browser';
  const os = /iPhone|iPad/.test(userAgent) ? 'iOS' : /Android/.test(userAgent) ? 'Android' : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : null;
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Called after every successful sign-in. The first browser an account is seen on (at
 * sign-up, or the first sign-in after rc.5) is recorded quietly; after that, a browser the
 * account has not used before gets a "new sign-in" email. The email never blocks sign-in.
 */
export async function noteSignIn(prisma: PrismaClient, request: FastifyRequest, reply: FastifyReply, account: Pick<Account, 'id' | 'email' | 'username'>, now = new Date()): Promise<void> {
  const raw = request.cookies[DEVICE_COOKIE];
  const unsigned = raw ? request.unsignCookie(raw) : null;
  const deviceId = unsigned?.valid && unsigned.value ? unsigned.value : randomBytes(24).toString('base64url');
  if (!unsigned?.valid) {
    reply.setCookie(DEVICE_COOKIE, deviceId, {
      httpOnly: true, sameSite: 'lax', secure: env.isProduction, signed: true, path: '/api/auth', maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }
  const deviceHash = hashDevice(deviceId);
  try {
    const known = await prisma.accountDevice.findUnique({ where: { accountId_deviceHash: { accountId: account.id, deviceHash } } });
    if (known) {
      await prisma.accountDevice.update({ where: { id: known.id }, data: { lastSeenAt: now } });
      return;
    }
    const seenBefore = await prisma.accountDevice.count({ where: { accountId: account.id } });
    await prisma.accountDevice.create({ data: { accountId: account.id, deviceHash, firstSeenAt: now, lastSeenAt: now } });
    if (seenBefore === 0) return;
    await sendSecurityNotice({
      to: account.email, username: account.username, kind: 'new-sign-in', when: now,
      browser: browserLabel(request.headers['user-agent']), ip: request.ip, accountUrl: accountSettingsUrl(),
    }, request.log);
  } catch (error) {
    request.log.warn({ err: error }, 'new sign-in notice failed');
  }
}

/** rc.5. "Your password was changed", after a change or a reset. Never blocks the change. */
export async function notePasswordChanged(request: FastifyRequest, account: Pick<Account, 'email' | 'username'>, now = new Date()): Promise<void> {
  await sendSecurityNotice({
    to: account.email, username: account.username, kind: 'password-changed', when: now,
    browser: browserLabel(request.headers['user-agent']), ip: request.ip, accountUrl: accountSettingsUrl(),
  }, request.log).catch((error: unknown) => request.log.warn({ err: error }, 'password changed notice failed'));
}
