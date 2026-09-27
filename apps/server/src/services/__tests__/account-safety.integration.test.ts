import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * rc.2. Admin tools behind a Discord sign-in, bug reports from the game, closing your own
 * account, and the per-network daily sign-up cap. Everything goes through the HTTP API.
 */
vi.mock('../email.service.js', async (original) => ({
  ...(await original<typeof import('../email.service.js')>()),
  sendCurrentEmailVerification: vi.fn(async () => undefined),
}));

describe.runIf(process.env.AUTH_INTEGRATION === '1')('account safety (rc.2), with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName = '';
  const accountIds: string[] = [];
  const networkTag = randomUUID().slice(0, 6);
  const saved = {
    REQUIRE_ADMIN_DISCORD: process.env.REQUIRE_ADMIN_DISCORD,
    SIGNUP_DAILY_LIMIT_PER_IP: process.env.SIGNUP_DAILY_LIMIT_PER_IP,
  };
  // Every registration gets its own documentation-range address unless a test picks one.
  let nextAddress = 1;
  const address = () => `198.51.100.${(nextAddress++ % 250) + 1}`;

  const register = async (remoteAddress = address()) => {
    const name = `safe${randomUUID().slice(0, 8)}`;
    const password = randomUUID();
    const response = await app.inject({
      method: 'POST', url: '/api/auth/register', remoteAddress,
      payload: { username: name, email: `${name}@example.invalid`, password },
    });
    if (response.statusCode === 201) accountIds.push(response.json().account.id);
    return {
      response,
      id: response.statusCode === 201 ? (response.json().account.id as string) : '',
      name,
      password,
      cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    };
  };
  const as = (cookie: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  /** A session made the way the Discord callback makes one. */
  const discordSession = async (accountId: string) => {
    const { createSession } = await import('../../auth/sessions.js');
    const { token } = await createSession(app.prisma, accountId, { method: 'DISCORD' });
    return `${cookieName}=${app.signCookie(token)}`;
  };
  const makeAdmin = async (id: string) => {
    await app.prisma.account.update({
      where: { id },
      data: { isAdmin: true, discordId: `discord-${randomUUID()}`, discordLinkedAt: new Date() },
    });
  };

  beforeAll(async () => {
    process.env.REQUIRE_ADMIN_DISCORD = 'true';
    process.env.SIGNUP_DAILY_LIMIT_PER_IP = '2';
    vi.resetModules();
    app = await (await import('../../app.js')).buildApp();
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
  });

  afterAll(async () => {
    if (accountIds.length) {
      await app.prisma.bugReport.deleteMany({ where: { accountId: { in: accountIds } } });
      await app.prisma.adminAuditLog.deleteMany({ where: { actorAccountId: { in: accountIds } } });
      await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    await app.prisma.exploitFlag.deleteMany({ where: { kind: 'SIGNUP_ABUSE', detail: { path: ['tag'], equals: networkTag } } }).catch(() => undefined);
    await app?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it('opens admin tools only to a session that signed in with Discord', async () => {
    const admin = await register();
    await makeAdmin(admin.id);

    // Signed in with the password: the account is an admin, the tools stay shut.
    const me = await as(admin.cookie, 'GET', '/api/auth/me');
    expect(me.json().account).toMatchObject({ isAdmin: true, adminSignInRequired: true });
    const refused = await as(admin.cookie, 'GET', '/api/admin/bug-reports');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('ADMIN_DISCORD_REQUIRED');
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: admin.name, password: admin.password } });
    expect(login.json().account.adminSignInRequired).toBe(true);

    // Nor can that session take the Discord link away.
    const unlink = await as(admin.cookie, 'DELETE', '/api/auth/discord', { currentPassword: admin.password });
    expect(unlink.json().error.code).toBe('ADMIN_DISCORD_LOCKED');

    // Signed in with Discord: open.
    const discord = await discordSession(admin.id);
    expect((await as(discord, 'GET', '/api/auth/me')).json().account.adminSignInRequired).toBe(false);
    expect((await as(discord, 'GET', '/api/admin/bug-reports')).statusCode).toBe(200);
    const sessions = await as(discord, 'GET', '/api/auth/sessions');
    expect(sessions.json().sessions.map((row: { method: string }) => row.method).sort()).toEqual(['DISCORD', 'PASSWORD', 'PASSWORD']);
  });

  it('takes a bug report from a player to the admin queue and back out', async () => {
    const player = await register();
    const sent = await as(player.cookie, 'POST', '/api/support/bug-reports', {
      category: 'GAMEPLAY', summary: 'Sold product vanished', details: 'I sold 3 Weed at Pip and the cash never arrived.', pagePath: '/game/stores/pip',
    });
    expect(sent.statusCode, sent.body).toBe(201);
    const invalid = await as(player.cookie, 'POST', '/api/support/bug-reports', { category: 'GAMEPLAY', summary: 'x', details: 'short' });
    expect(invalid.statusCode).toBe(400);

    const admin = await register();
    await makeAdmin(admin.id);
    const discord = await discordSession(admin.id);
    const queue = await as(discord, 'GET', '/api/admin/bug-reports?status=open&page=1');
    const mine = queue.json().reports.find((row: { id: string }) => row.id === sent.json().id);
    expect(mine).toMatchObject({ username: player.name, pagePath: '/game/stores/pip', category: 'GAMEPLAY', resolvedAt: null });

    const resolved = await as(discord, 'POST', `/api/admin/bug-reports/${sent.json().id}/resolve`, { resolution: 'FIXED', note: 'Fixed in rc.2.' });
    expect(resolved.statusCode, resolved.body).toBe(200);
    const again = await as(discord, 'POST', `/api/admin/bug-reports/${sent.json().id}/resolve`, { resolution: 'FIXED', note: 'Fixed in rc.2.' });
    expect(again.json().error.code).toBe('BUG_REPORT_RESOLVED');
    const audit = await app.prisma.adminAuditLog.findFirst({ where: { action: 'bug-report.resolve', targetId: sent.json().id } });
    expect(audit?.actorUsername).toBe(admin.name);

    // Five an hour, then a polite no.
    for (let i = 0; i < 4; i += 1) {
      expect((await as(player.cookie, 'POST', '/api/support/bug-reports', { category: 'OTHER', summary: `Report ${i} here`, details: 'Something else went wrong here.' })).statusCode).toBe(201);
    }
    const limited = await as(player.cookie, 'POST', '/api/support/bug-reports', { category: 'OTHER', summary: 'One too many', details: 'Something else went wrong here.' });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('BUG_REPORT_LIMIT');
  });

  it('lets a player close their own account, and staff reopen it', async () => {
    const player = await register();
    const wrong = await as(player.cookie, 'POST', '/api/auth/account/close', { currentPassword: 'not-it', confirm: 'CLOSE' });
    expect(wrong.json().error.code).toBe('CURRENT_PASSWORD_INVALID');
    const unconfirmed = await as(player.cookie, 'POST', '/api/auth/account/close', { currentPassword: player.password, confirm: 'close' });
    expect(unconfirmed.statusCode).toBe(400);

    const closed = await as(player.cookie, 'POST', '/api/auth/account/close', { currentPassword: player.password, confirm: 'CLOSE' });
    expect(closed.statusCode, closed.body).toBe(200);
    expect((await as(player.cookie, 'GET', '/api/auth/me')).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: player.name, password: player.password } });
    expect(login.statusCode).toBe(403);
    expect(login.json().error.code).toBe('ACCOUNT_CLOSED');
    expect(await app.prisma.session.count({ where: { accountId: player.id } })).toBe(0);
    expect(await app.prisma.adminAuditLog.count({ where: { action: 'account.self-close', targetId: player.id } })).toBe(1);

    // Staff reopen it; the closure is cleared with it.
    const admin = await register();
    await makeAdmin(admin.id);
    const discord = await discordSession(admin.id);
    const reopened = await as(discord, 'POST', `/api/admin/accounts/${player.id}/reactivate`, { reason: 'Player asked on Discord.' });
    expect(reopened.statusCode, reopened.body).toBe(200);
    expect((await app.prisma.account.findUniqueOrThrow({ where: { id: player.id } })).closedAt).toBeNull();
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: player.name, password: player.password } })).statusCode).toBe(200);

    // A Discord sign-in needs no password (a Discord-made account never chose one); admins cannot close.
    const discordPlayer = await register();
    const viaDiscord = await discordSession(discordPlayer.id);
    expect((await as(viaDiscord, 'POST', '/api/auth/account/close', { confirm: 'CLOSE' })).statusCode).toBe(200);
    expect((await as(discord, 'POST', '/api/auth/account/close', { confirm: 'CLOSE' })).json().error.code).toBe('ADMIN_CLOSE');
  });

  it('caps new accounts per network per day and flags the flood', async () => {
    const network = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    await app.prisma.account.updateMany({ where: { registeredIp: network }, data: { registeredIp: null } });
    expect((await register(network)).response.statusCode).toBe(201);
    expect((await register(network)).response.statusCode).toBe(201);
    const third = await register(network);
    expect(third.response.statusCode).toBe(429);
    expect(third.response.json().error.code).toBe('SIGNUP_LIMIT');
    // Another network is unaffected.
    expect((await register()).response.statusCode).toBe(201);

    await vi.waitFor(async () => {
      const flag = await app.prisma.exploitFlag.findFirst({ where: { kind: 'SIGNUP_ABUSE', lastSeenAt: { gt: new Date(Date.now() - 60_000) } } });
      expect(flag?.message).toMatch(/accounts attempted from one network/);
      // The flag names the network by an opaque key, never the address.
      expect(`${flag?.route} ${flag?.message}`).not.toContain(network);
      if (flag) await app.prisma.exploitFlag.update({ where: { id: flag.id }, data: { detail: { tag: networkTag } } });
    });
  });
});
