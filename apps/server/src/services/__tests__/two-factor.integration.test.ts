import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { totpCode, totpStep } from '../../auth/totp.js';

/**
 * rc.3. Two-step sign-in with an authenticator app, end to end through the HTTP API:
 * setup, sign-in with a code, recovery codes, replay and guessing limits, password reset,
 * staff reset, and admin tools opening for an authenticator sign-in.
 */
const mail: Array<{ kind: string; to: string; url?: string; change?: string }> = [];
vi.mock('../email.service.js', async (original) => ({
  ...(await original<typeof import('../email.service.js')>()),
  sendCurrentEmailVerification: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async (message: { to: string; url: string }) => { mail.push({ kind: 'reset', to: message.to, url: message.url }); }),
  sendTwoFactorNotice: vi.fn(async (message: { to: string; change: string }) => { mail.push({ kind: '2fa', to: message.to, change: message.change }); }),
}));

describe.runIf(process.env.AUTH_INTEGRATION === '1')('two-step sign-in (rc.3), with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName = '';
  const accountIds: string[] = [];
  const saved = process.env.REQUIRE_ADMIN_2FA;
  // Each test signs in from its own address, as players do, so the per-address sign-in
  // rate limit (20 per 5 minutes) is not shared across the whole suite.
  let ip = '192.0.2.1';
  let testNumber = 0;
  beforeEach(() => { testNumber += 1; ip = `192.0.2.${testNumber + 10}`; });

  const cookiesOf = (response: { cookies: Array<{ name: string; value: string }> }) =>
    response.cookies.filter((c) => c.value).map((c) => `${c.name}=${c.value}`).join('; ');
  const register = async () => {
    const name = `twostep${randomUUID().slice(0, 8)}`;
    const password = randomUUID();
    const response = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password } });
    expect(response.statusCode, response.body).toBe(201);
    accountIds.push(response.json().account.id);
    return { id: response.json().account.id as string, name, email: `${name}@example.invalid`, password, cookie: cookiesOf(response) };
  };
  const as = (cookie: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ remoteAddress: ip, method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const login = (identifier: string, password: string) =>
    app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/login', payload: { identifier, password } });
  const discordSession = async (accountId: string) => {
    const { createSession } = await import('../../auth/sessions.js');
    const { token } = await createSession(app.prisma, accountId, { method: 'DISCORD' });
    return `${cookieName}=${app.signCookie(token)}`;
  };
  /** Turns two-step on for a player through the API; returns the secret and recovery codes. */
  const enrol = async (player: { cookie: string; password: string }) => {
    const setup = await as(player.cookie, 'POST', '/api/auth/2fa/setup', { currentPassword: player.password });
    expect(setup.statusCode, setup.body).toBe(200);
    const secret = setup.json().secret as string;
    const step = totpStep();
    const enabled = await as(player.cookie, 'POST', '/api/auth/2fa/enable', { code: totpCode(secret, step) });
    expect(enabled.statusCode, enabled.body).toBe(200);
    return { secret, step, recoveryCodes: enabled.json().recoveryCodes as string[] };
  };

  beforeAll(async () => {
    process.env.REQUIRE_ADMIN_2FA = 'true';
    vi.resetModules();
    app = await (await import('../../app.js')).buildApp();
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
  });

  afterAll(async () => {
    if (accountIds.length) {
      await app.prisma.adminAuditLog.deleteMany({ where: { OR: [{ actorAccountId: { in: accountIds } }, { targetId: { in: accountIds } }] } });
      await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    await app?.close();
    if (saved === undefined) delete process.env.REQUIRE_ADMIN_2FA;
    else process.env.REQUIRE_ADMIN_2FA = saved;
    vi.restoreAllMocks();
  });

  it('sets up an authenticator and then asks for its code at every sign-in', async () => {
    const player = await register();
    expect((await as(player.cookie, 'POST', '/api/auth/2fa/setup', { currentPassword: 'wrong' })).json().error.code).toBe('CURRENT_PASSWORD_INVALID');
    const setup = await as(player.cookie, 'POST', '/api/auth/2fa/setup', { currentPassword: player.password });
    expect(setup.json().otpauthUrl).toMatch(/^otpauth:\/\/totp\/StreetsEmpire/);
    expect(setup.json().qrSvg).toMatch(/^<svg/);
    // The secret is stored sealed, never as the key the app shows.
    const stored = await app.prisma.account.findUniqueOrThrow({ where: { id: player.id } });
    expect(stored.twoFactorPendingSecret).not.toContain(setup.json().secret);
    expect(stored.twoFactorEnabledAt).toBeNull();
    // A wrong first code changes nothing.
    expect((await as(player.cookie, 'POST', '/api/auth/2fa/enable', { code: '000000' })).json().error.code).toBe('TWO_FACTOR_INVALID');

    const secret = setup.json().secret as string;
    const step = totpStep();
    const enabled = await as(player.cookie, 'POST', '/api/auth/2fa/enable', { code: totpCode(secret, step) });
    expect(enabled.json().recoveryCodes).toHaveLength(10);
    expect(enabled.json().account.twoFactorEnabled).toBe(true);
    expect(mail).toContainEqual({ kind: '2fa', to: player.email, change: 'enabled' });
    expect((await as(player.cookie, 'GET', '/api/auth/2fa')).json()).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });

    // Sign in: the password alone makes no session.
    const first = await login(player.name, player.password);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ twoFactorRequired: true });
    expect(first.cookies.some((c) => c.name === cookieName && c.value)).toBe(false);
    const challenge = cookiesOf(first);

    // The code used to turn it on cannot be used again.
    const replay = await as(challenge, 'POST', '/api/auth/2fa/verify', { code: totpCode(secret, step) });
    expect(replay.json().error.code).toBe('TWO_FACTOR_INVALID');
    const verified = await as(challenge, 'POST', '/api/auth/2fa/verify', { code: totpCode(secret, step + 1) });
    expect(verified.statusCode, verified.body).toBe(200);
    expect(verified.json().account.username).toBe(player.name);
    const session = cookiesOf(verified);
    const sessions = await as(session, 'GET', '/api/auth/sessions');
    expect(sessions.json().sessions.find((row: { current: boolean }) => row.current)).toMatchObject({ method: 'PASSWORD', twoFactor: true });
    // The waiting sign-in is spent.
    expect((await as(challenge, 'POST', '/api/auth/2fa/verify', { code: totpCode(secret, step + 1) })).statusCode).toBe(401);
  });

  it('takes a recovery code once, and stops guessing after five tries', async () => {
    const player = await register();
    const { recoveryCodes } = await enrol(player);
    const challenge = cookiesOf(await login(player.name, player.password));
    const recovered = await as(challenge, 'POST', '/api/auth/2fa/verify', { code: recoveryCodes[0]!.toUpperCase() });
    expect(recovered.statusCode, recovered.body).toBe(200);
    expect(recovered.json().recoveryCodesLeft).toBe(9);

    const again = cookiesOf(await login(player.name, player.password));
    expect((await as(again, 'POST', '/api/auth/2fa/verify', { code: recoveryCodes[0]! })).json().error.code).toBe('TWO_FACTOR_INVALID');
    for (let i = 0; i < 4; i += 1) {
      expect((await as(again, 'POST', '/api/auth/2fa/verify', { code: '123456' })).statusCode).toBe(400);
    }
    const locked = await as(again, 'POST', '/api/auth/2fa/verify', { code: recoveryCodes[1]! });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe('TWO_FACTOR_ATTEMPTS');
    // A new sign-in starts a fresh count, and the unused code still works.
    const fresh = cookiesOf(await login(player.name, player.password));
    const signedIn = await as(fresh, 'POST', '/api/auth/2fa/verify', { code: recoveryCodes[1]! });
    expect(signedIn.statusCode).toBe(200);

    // New codes replace the old ones.
    const regenerated = await as(cookiesOf(signedIn), 'POST', '/api/auth/2fa/recovery-codes', { code: recoveryCodes[3]! });
    expect(regenerated.statusCode, regenerated.body).toBe(200);
    expect(regenerated.json().recoveryCodes).toHaveLength(10);
    const next = cookiesOf(await login(player.name, player.password));
    expect((await as(next, 'POST', '/api/auth/2fa/verify', { code: recoveryCodes[4]! })).json().error.code).toBe('TWO_FACTOR_INVALID');
    expect((await as(next, 'POST', '/api/auth/2fa/verify', { code: regenerated.json().recoveryCodes[0] })).statusCode).toBe(200);
  });

  it('still asks for the code after a password reset, and can be turned off', async () => {
    const player = await register();
    const { secret, step, recoveryCodes } = await enrol(player);
    await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/password/forgot', payload: { email: player.email } });
    const link = mail.filter((row) => row.kind === 'reset' && row.to === player.email).at(-1);
    const token = new URL(link!.url!).searchParams.get('token')!;
    const newPassword = randomUUID();
    const reset = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/password/reset', payload: { token, password: newPassword } });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(reset.json()).toEqual({ twoFactorRequired: true });
    expect(reset.cookies.some((c) => c.name === cookieName && c.value)).toBe(false);
    const signedIn = await as(cookiesOf(reset), 'POST', '/api/auth/2fa/verify', { code: totpCode(secret, step + 1) });
    expect(signedIn.statusCode, signedIn.body).toBe(200);

    const off = await as(cookiesOf(signedIn), 'POST', '/api/auth/2fa/disable', { code: recoveryCodes[0]! });
    expect(off.statusCode, off.body).toBe(200);
    expect(off.json().account.twoFactorEnabled).toBe(false);
    expect(await app.prisma.twoFactorRecoveryCode.count({ where: { accountId: player.id } })).toBe(0);
    expect(mail).toContainEqual({ kind: '2fa', to: player.email, change: 'disabled' });
    expect((await login(player.name, newPassword)).json().account.username).toBe(player.name);
  });

  it('opens admin tools for an authenticator sign-in, and staff can reset a lost phone', async () => {
    const admin = await register();
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    // With only a password, an admin can neither use the tools nor enrol an authenticator.
    expect((await as(admin.cookie, 'GET', '/api/admin/bug-reports')).json().error.code).toBe('ADMIN_2FA_REQUIRED');
    expect((await as(admin.cookie, 'POST', '/api/auth/2fa/setup', { currentPassword: admin.password })).json().error.code).toBe('ADMIN_2FA_LOCKED');

    // From a Discord sign-in the admin enrols; from then on an authenticator sign-in opens the tools.
    const discord = await discordSession(admin.id);
    const setup = await as(discord, 'POST', '/api/auth/2fa/setup', {});
    expect(setup.statusCode, setup.body).toBe(200);
    const step = totpStep();
    expect((await as(discord, 'POST', '/api/auth/2fa/enable', { code: totpCode(setup.json().secret, step) })).statusCode).toBe(200);
    const challenge = cookiesOf(await login(admin.name, admin.password));
    const adminSession = cookiesOf(await as(challenge, 'POST', '/api/auth/2fa/verify', { code: totpCode(setup.json().secret, step + 1) }));
    expect((await as(adminSession, 'GET', '/api/auth/me')).json().account.adminSignInRequired).toBe(false);
    expect((await as(adminSession, 'GET', '/api/admin/bug-reports')).statusCode).toBe(200);

    // A player lost their phone and their codes: the admin turns it off, audited.
    const player = await register();
    await enrol(player);
    const detail = await as(adminSession, 'GET', `/api/admin/accounts/${player.id}`);
    expect(detail.json().account.twoFactorEnabled).toBe(true);
    const tooShort = await as(adminSession, 'POST', `/api/admin/accounts/${player.id}/2fa/reset`, { reason: 'x' });
    expect(tooShort.statusCode).toBe(400);
    const cleared = await as(adminSession, 'POST', `/api/admin/accounts/${player.id}/2fa/reset`, { reason: 'Lost phone; confirmed on Discord.' });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json().account.twoFactorEnabled).toBe(false);
    expect(await app.prisma.adminAuditLog.count({ where: { action: 'account.reset-2fa', targetId: player.id } })).toBe(1);
    expect(mail).toContainEqual({ kind: '2fa', to: player.email, change: 'reset' });
    expect((await login(player.name, player.password)).json().account.username).toBe(player.name);
  });

  /* ---------- rc.4: sessions, trusted browsers, admin re-confirm ---------- */

  const sessionCookie = (response: { cookies: Array<{ name: string; value: string; maxAge?: number; expires?: Date }> }) =>
    response.cookies.find((c) => c.name === cookieName && c.value);
  const currentSession = async (cookie: string) => {
    const rows = (await as(cookie, 'GET', '/api/auth/sessions')).json().sessions as Array<{ id: string; current: boolean; remember: boolean; expiresAt: string; endsBy: string }>;
    return rows.find((row) => row.current)!;
  };

  it('keeps a remembered sign-in for 30 idle days, and a shared-computer one only for the browser', async () => {
    const player = await register();
    const HOUR = 3_600_000;
    const kept = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/login', payload: { identifier: player.name, password: player.password } });
    expect(sessionCookie(kept)?.maxAge).toBe(90 * 24 * 3600);
    const keptRow = await currentSession(cookiesOf(kept));
    expect(keptRow.remember).toBe(true);
    expect(Date.parse(keptRow.expiresAt) - Date.now()).toBeGreaterThan(29 * 24 * HOUR);
    expect(Date.parse(keptRow.endsBy) - Date.now()).toBeGreaterThan(89 * 24 * HOUR);

    const shared = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/login', payload: { identifier: player.name, password: player.password, remember: false } });
    const cookie = sessionCookie(shared)!;
    expect(cookie.maxAge).toBeUndefined();
    expect(cookie.expires).toBeUndefined();
    const sharedRow = await currentSession(cookiesOf(shared));
    expect(sharedRow.remember).toBe(false);
    expect(Date.parse(sharedRow.expiresAt) - Date.now()).toBeLessThan(12 * HOUR + 60_000);

    // Using a session slides its idle expiry forward...
    await app.prisma.session.update({ where: { id: sharedRow.id }, data: { expiresAt: new Date(Date.now() + HOUR) } });
    await as(cookiesOf(shared), 'GET', '/api/auth/me');
    await vi.waitFor(async () => {
      const row = await app.prisma.session.findUniqueOrThrow({ where: { id: sharedRow.id } });
      expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(11 * HOUR);
    });
    // ...never past its hard end, and past the hard end it is over however active.
    await app.prisma.session.update({ where: { id: keptRow.id }, data: { absoluteExpiresAt: new Date(Date.now() - 1000) } });
    expect((await as(cookiesOf(kept), 'GET', '/api/auth/me')).statusCode).toBe(401);
    // Idle past its expiry: over too.
    await app.prisma.session.update({ where: { id: sharedRow.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await as(cookiesOf(shared), 'GET', '/api/auth/me')).statusCode).toBe(401);
  });

  it('skips the code on a trusted browser until the password changes', async () => {
    const player = await register();
    const { secret, step } = await enrol(player);
    const challenge = cookiesOf(await login(player.name, player.password));
    const verified = await as(challenge, 'POST', '/api/auth/2fa/verify', { code: totpCode(secret, step + 1), trustDevice: true });
    expect(verified.statusCode, verified.body).toBe(200);
    const trusted = verified.cookies.find((c) => c.name === 'se_trusted_device')!;
    expect(trusted.maxAge).toBe(30 * 24 * 3600);
    const trustCookie = `se_trusted_device=${trusted.value}`;
    const session = cookiesOf(verified);
    const devices = (await as(`${session}; ${trustCookie}`, 'GET', '/api/auth/2fa/trusted-devices')).json().devices;
    expect(devices).toHaveLength(1);
    expect(devices[0].current).toBe(true);

    // Password again on this browser: no code.
    const again = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/login', headers: { cookie: trustCookie }, payload: { identifier: player.name, password: player.password } });
    expect(again.json().account?.username, again.body).toBe(player.name);
    // Another browser still needs it.
    expect((await login(player.name, player.password)).json()).toEqual({ twoFactorRequired: true });

    // A new password forgets every trusted browser.
    const newPassword = randomUUID();
    const changed = await as(session, 'POST', '/api/auth/password/change', { currentPassword: player.password, password: newPassword, revokeOtherSessions: false });
    expect(changed.statusCode, changed.body).toBe(200);
    const afterChange = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/login', headers: { cookie: trustCookie }, payload: { identifier: player.name, password: newPassword } });
    expect(afterChange.json()).toEqual({ twoFactorRequired: true });
  });

  it('asks an admin to re-confirm every 12 hours and on trusted browsers, in place', async () => {
    const admin = await register();
    const discord = await discordSession(admin.id);
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    const setup = await as(discord, 'POST', '/api/auth/2fa/setup', {});
    const step = totpStep();
    const enabled = await as(discord, 'POST', '/api/auth/2fa/enable', { code: totpCode(setup.json().secret, step) });
    const recoveryCodes = enabled.json().recoveryCodes as string[];
    expect((await as(discord, 'GET', '/api/admin/bug-reports')).statusCode).toBe(200);

    // Twelve hours on, the same session must re-confirm.
    const discordRow = await currentSession(discord);
    await app.prisma.session.update({ where: { id: discordRow.id }, data: { secondFactorAt: new Date(Date.now() - 13 * 3_600_000) } });
    expect((await as(discord, 'GET', '/api/admin/bug-reports')).json().error.code).toBe('ADMIN_2FA_REQUIRED');
    expect((await as(discord, 'GET', '/api/auth/me')).json().account.adminSignInRequired).toBe(true);
    const confirmed = await as(discord, 'POST', '/api/auth/2fa/step-up', { code: recoveryCodes[0]! });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect(confirmed.json().account.adminSignInRequired).toBe(false);
    expect((await as(discord, 'GET', '/api/admin/bug-reports')).statusCode).toBe(200);

    // A trusted browser skips the code at sign-in, but not for admin tools.
    const challenge = cookiesOf(await login(admin.name, admin.password));
    const verified = await as(challenge, 'POST', '/api/auth/2fa/verify', { code: totpCode(setup.json().secret, step + 1), trustDevice: true });
    const trustCookie = `se_trusted_device=${verified.cookies.find((c) => c.name === 'se_trusted_device')!.value}`;
    const skipped = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/login', headers: { cookie: trustCookie }, payload: { identifier: admin.name, password: admin.password } });
    const skippedSession = cookiesOf(skipped);
    expect((await as(skippedSession, 'GET', '/api/admin/bug-reports')).json().error.code).toBe('ADMIN_2FA_REQUIRED');

    // Guessing is capped: five wrong codes sign the session out.
    for (let i = 0; i < 4; i += 1) {
      expect((await as(skippedSession, 'POST', '/api/auth/2fa/step-up', { code: '000000' })).json().error.code).toBe('TWO_FACTOR_INVALID');
    }
    const out = await as(skippedSession, 'POST', '/api/auth/2fa/step-up', { code: '000000' });
    expect(out.statusCode).toBe(401);
    expect((await as(skippedSession, 'GET', '/api/auth/me')).statusCode).toBe(401);
  });
});
