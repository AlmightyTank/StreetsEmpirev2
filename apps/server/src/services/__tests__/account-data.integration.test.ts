import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';
import { MINIMUM_AGE, RULES_AGREEMENT } from '@streets/shared';

/**
 * rc.5. The 13+ age rule, security emails (new browser, changed password), "Download my
 * data", deleting your own account, and the Turnstile bot check, through the HTTP API.
 */
const notices: Array<{ to: string; kind: string }> = [];
vi.mock('../email.service.js', async (original) => ({
  ...(await original<typeof import('../email.service.js')>()),
  sendCurrentEmailVerification: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
  sendSecurityNotice: vi.fn(async (message: { to: string; kind: string }) => { notices.push({ to: message.to, kind: message.kind }); }),
}));

describe.runIf(process.env.AUTH_INTEGRATION === '1')('account data and safety (rc.5), with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const accountIds: string[] = [];
  const saved = { site: process.env.TURNSTILE_SITE_KEY, secret: process.env.TURNSTILE_SECRET_KEY };
  const realFetch = globalThis.fetch;
  let ip = '198.18.0.1';
  let testNumber = 0;
  beforeEach(() => { testNumber += 1; ip = `198.18.0.${testNumber + 10}`; });

  const cookiesOf = (response: { cookies: Array<{ name: string; value: string }> }) =>
    response.cookies.filter((c) => c.value).map((c) => `${c.name}=${c.value}`).join('; ');
  const register = async (extra: Record<string, unknown> = {}) => {
    const name = `data${randomUUID().slice(0, 8)}`;
    const password = randomUUID();
    const response = await app.inject({
      remoteAddress: ip, method: 'POST', url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password, ageConfirmed: true, captchaToken: 'good-token', ...extra },
    });
    if (response.statusCode === 201) accountIds.push(response.json().account.id);
    return { response, id: response.statusCode === 201 ? (response.json().account.id as string) : '', name, email: `${name}@example.invalid`, password, cookie: cookiesOf(response) };
  };
  const as = (cookie: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ remoteAddress: ip, method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const login = (identifier: string, password: string, cookie = '') =>
    app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/login', headers: cookie ? { cookie } : {}, payload: { identifier, password, captchaToken: 'good-token' } });

  beforeAll(async () => {
    process.env.TURNSTILE_SITE_KEY = 'test-site-key';
    process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
    // Cloudflare's answer, stubbed: only "good-token" passes.
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('https://challenges.cloudflare.com/')) {
        const body = new URLSearchParams(String(init?.body ?? ''));
        return new Response(JSON.stringify({ success: body.get('response') === 'good-token' && body.get('secret') === 'test-secret-key' }));
      }
      return realFetch(input, init);
    }));
    vi.resetModules();
    app = await (await import('../../app.js')).buildApp();
    const { RoundService } = await import('../round.service.js');
    const round = await app.prisma.round.create({ data: {
      name: 'Account data fixture', slug: `account-data-${randomUUID()}`,
      rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    vi.spyOn(RoundService, 'getCurrent').mockResolvedValue(round);
  });

  afterAll(async () => {
    if (accountIds.length) {
      await app.prisma.adminAuditLog.deleteMany({ where: { OR: [{ actorAccountId: { in: accountIds } }, { targetId: { in: accountIds } }] } });
      await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } }).catch(() => undefined);
    await app?.close();
    vi.unstubAllGlobals();
    for (const [key, value] of [['TURNSTILE_SITE_KEY', saved.site], ['TURNSTILE_SECRET_KEY', saved.secret]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it('checks for bots at sign-in too, before the password is looked at', async () => {
    const player = await register();
    const signIn = (payload: Record<string, unknown>) =>
      app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/login', payload: { identifier: player.name, password: player.password, ...payload } });
    expect((await signIn({})).json().error.code).toBe('CAPTCHA_REQUIRED');
    expect((await signIn({ captchaToken: 'bot-token' })).json().error.code).toBe('CAPTCHA_FAILED');
    // A wrong password with no check says nothing about the password.
    expect((await signIn({ password: 'wrong' })).json().error.code).toBe('CAPTCHA_REQUIRED');
    const ok = await signIn({ captchaToken: 'good-token' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().account.username).toBe(player.name);
  });

  it('checks for bots at sign-up and password recovery when Turnstile is on', async () => {
    const meta = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(meta.json().turnstileSiteKey).toBe('test-site-key');
    expect((await register({ captchaToken: undefined })).response.json().error.code).toBe('CAPTCHA_REQUIRED');
    expect((await register({ captchaToken: 'bot-token' })).response.json().error.code).toBe('CAPTCHA_FAILED');
    const human = await register();
    expect(human.response.statusCode, human.response.body).toBe(201);
    const noCheck = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/password/forgot', payload: { email: human.email } });
    expect(noCheck.json().error.code).toBe('CAPTCHA_REQUIRED');
    const withCheck = await app.inject({ remoteAddress: ip, method: 'POST', url: '/api/auth/password/forgot', payload: { email: human.email, captchaToken: 'good-token' } });
    expect(withCheck.statusCode, withCheck.body).toBe(200);
    // Account settings: a signed-in player asking for a link to their own address needs no check...
    const own = await as(human.cookie, 'POST', '/api/auth/password/forgot', { email: human.email });
    expect(own.statusCode, own.body).toBe(200);
    // ...but asking about someone else's address from a signed-in session still does.
    const other = await register();
    const someoneElse = await as(human.cookie, 'POST', '/api/auth/password/forgot', { email: other.email });
    expect(someoneElse.json().error.code).toBe('CAPTCHA_REQUIRED');
  });

  it('records the 13+ confirmation, and the rules ask every player too', async () => {
    const confirmed = await register();
    expect((await app.prisma.account.findUniqueOrThrow({ where: { id: confirmed.id } })).ageConfirmedAt).not.toBeNull();
    expect(RULES_AGREEMENT[0]!.title).toContain(`${MINIMUM_AGE} or older`);
  });

  it('emails about a sign-in from a new browser and about a changed password', async () => {
    const player = await register();
    const device = player.response.cookies.find((c) => c.name === 'se_device');
    expect(device?.value).toBeTruthy();
    const deviceCookie = `se_device=${device!.value}`;
    // Same browser: nothing to say. (Sign-up itself is never "new".)
    expect((await login(player.name, player.password, deviceCookie)).statusCode).toBe(200);
    expect(notices.filter((row) => row.to === player.email)).toEqual([]);
    // Another browser: an email.
    const elsewhere = await login(player.name, player.password);
    expect(elsewhere.statusCode).toBe(200);
    expect(notices.filter((row) => row.to === player.email)).toEqual([{ to: player.email, kind: 'new-sign-in' }]);
    // That browser is known from now on.
    const elsewhereDevice = `se_device=${elsewhere.cookies.find((c) => c.name === 'se_device')!.value}`;
    await login(player.name, player.password, elsewhereDevice);
    expect(notices.filter((row) => row.to === player.email)).toHaveLength(1);

    const changed = await as(player.cookie, 'POST', '/api/auth/password/change', { currentPassword: player.password, password: randomUUID(), revokeOtherSessions: false });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(notices.filter((row) => row.to === player.email).at(-1)).toEqual({ to: player.email, kind: 'password-changed' });
  });

  it('hands a player everything kept about them, and nothing secret', async () => {
    const player = await register();
    const joined = await as(player.cookie, 'POST', '/api/rounds/current/join', {});
    expect(joined.statusCode, joined.body).toBe(201);
    await as(player.cookie, 'POST', '/api/support/bug-reports', { category: 'OTHER', summary: 'Export me please', details: 'Checking the data export works.' });
    const exported = await as(player.cookie, 'GET', '/api/auth/account/export');
    expect(exported.statusCode, exported.body).toBe(200);
    expect(exported.headers['content-disposition']).toMatch(/^attachment; filename="streetsempire-/);
    const data = exported.json();
    expect(data.account).toMatchObject({ username: player.name, email: player.email });
    expect(data.seasons).toHaveLength(1);
    expect(data.seasons[0].season.name).toBe('Account data fixture');
    expect(typeof data.seasons[0].player.cashCents).toBe('string');
    expect(data.bugReports[0]).toMatchObject({ summary: 'Export me please', source: 'GAME', playerReply: null });
    // The staff note on a resolution is staff-only, like moderation notes.
    expect(data.bugReports[0]).not.toHaveProperty('resolutionNote');
    const stored = await app.prisma.account.findUniqueOrThrow({ where: { id: player.id } });
    expect(exported.body).not.toContain(stored.passwordHash);
    expect(exported.body).not.toMatch(/passwordHash|twoFactorSecret|tokenHash/);
  });

  it('lets a player delete their own account: gone if they never played, anonymized if they did', async () => {
    const never = await register();
    expect((await as(never.cookie, 'POST', '/api/auth/account/delete', { currentPassword: never.password, confirm: 'delete' })).statusCode).toBe(400);
    expect((await as(never.cookie, 'POST', '/api/auth/account/delete', { currentPassword: 'wrong', confirm: 'DELETE' })).json().error.code).toBe('CURRENT_PASSWORD_INVALID');
    const gone = await as(never.cookie, 'POST', '/api/auth/account/delete', { currentPassword: never.password, confirm: 'DELETE' });
    expect(gone.json()).toMatchObject({ ok: true, mode: 'deleted' });
    expect(await app.prisma.account.findUnique({ where: { id: never.id } })).toBeNull();

    const played = await register();
    await as(played.cookie, 'POST', '/api/rounds/current/join', {});
    const anonymized = await as(played.cookie, 'POST', '/api/auth/account/delete', { currentPassword: played.password, confirm: 'DELETE' });
    expect(anonymized.json()).toMatchObject({ ok: true, mode: 'anonymized' });
    const after = await app.prisma.account.findUniqueOrThrow({ where: { id: played.id } });
    expect(after.email).toMatch(/@deleted\.streetsempire\.invalid$/);
    expect(after.isActive).toBe(false);
    expect(after.registeredIp).toBeNull();
    expect((await app.prisma.roundPlayer.findFirstOrThrow({ where: { accountId: played.id } })).displayName).toBe('Deleted Player');
    expect(await app.prisma.session.count({ where: { accountId: played.id } })).toBe(0);
    expect((await login(played.name, played.password)).statusCode).toBe(401);
    const audit = await app.prisma.adminAuditLog.findFirstOrThrow({ where: { action: 'account.self-delete', targetId: played.id } });
    expect(audit.actorUsername).toBe('Deleted Player');

    const admin = await register();
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    expect((await as(admin.cookie, 'POST', '/api/auth/account/delete', { currentPassword: admin.password, confirm: 'DELETE' })).json().error.code).toBe('ADMIN_DELETE_ADMIN');
  });
});
