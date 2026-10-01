import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';
import { RULES_VERSION } from '@streets/shared';

/**
 * Players verify their email before they play, or sign in with Discord instead.
 * Registers through the API, catches the email the server would send, and follows it.
 */
const sent: Array<{ to: string; url: string }> = [];
vi.mock('../email.service.js', async (original) => ({
  ...(await original<typeof import('../email.service.js')>()),
  sendCurrentEmailVerification: vi.fn(async (message: { to: string; url: string }) => { sent.push({ to: message.to, url: message.url }); }),
}));

describe.runIf(process.env.AUTH_INTEGRATION === '1')('email verification before play, with PostgreSQL', () => {
  let app: FastifyInstance;
  const accountIds: string[] = [];
  let roundId = '';
  const previous = process.env.REQUIRE_VERIFIED_EMAIL;
  const previousRules = process.env.REQUIRE_RULES_ACCEPTANCE;

  const register = async () => {
    const name = `verify${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBe(201);
    accountIds.push(response.json().account.id);
    return {
      id: response.json().account.id as string,
      email: `${name}@example.invalid`,
      account: response.json().account as { verificationRequired: boolean },
      cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    };
  };
  const as = (cookie: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const acceptRules = async (cookie: string) => {
    const accepted = await as(cookie, 'POST', '/api/auth/rules/accept', { version: RULES_VERSION });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().account.rulesAcceptanceRequired).toBe(false);
  };

  beforeAll(async () => {
    process.env.REQUIRE_VERIFIED_EMAIL = 'true';
    process.env.REQUIRE_RULES_ACCEPTANCE = 'true';
    vi.resetModules();
    app = await (await import('../../app.js')).buildApp();
    const { RoundService } = await import('../round.service.js');
    const round = await app.prisma.round.create({ data: {
      name: 'Email verification fixture', slug: `verify-test-${randomUUID()}`,
      rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    vi.spyOn(RoundService, 'getCurrent').mockResolvedValue(round);
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } }).catch(() => undefined);
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app?.close();
    if (previous === undefined) delete process.env.REQUIRE_VERIFIED_EMAIL;
    else process.env.REQUIRE_VERIFIED_EMAIL = previous;
    if (previousRules === undefined) delete process.env.REQUIRE_RULES_ACCEPTANCE;
    else process.env.REQUIRE_RULES_ACCEPTANCE = previousRules;
    vi.restoreAllMocks();
  });

  it('emails a link at sign-up and keeps the game shut until it is used', async () => {
    const player = await register();
    expect(player.account.verificationRequired).toBe(true);
    const mail = sent.find((row) => row.to === player.email);
    expect(mail?.url).toMatch(/\/verify-email\?token=/);

    // The account works; the game does not.
    expect((await as(player.cookie, 'GET', '/api/auth/me')).statusCode).toBe(200);
    const join = await as(player.cookie, 'POST', '/api/rounds/current/join', {});
    expect(join.statusCode).toBe(403);
    expect(join.json().error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await as(player.cookie, 'GET', '/api/game/me')).json().error.code).toBe('EMAIL_NOT_VERIFIED');

    // Asking again straight away is refused, so the button cannot flood an inbox.
    const again = await as(player.cookie, 'POST', '/api/auth/email/verify/request', {});
    expect(again.statusCode).toBe(429);
    expect(again.json().error.code).toBe('VERIFY_EMAIL_COOLDOWN');

    // Follow the link: now they can play.
    const token = new URL(mail!.url).searchParams.get('token')!;
    const verified = await as(player.cookie, 'POST', '/api/auth/email/verify', { token });
    expect(verified.statusCode, verified.body).toBe(200);
    expect(verified.json().account.verificationRequired).toBe(false);
    // Verified, but the rules come first.
    expect(verified.json().account.rulesAcceptanceRequired).toBe(true);
    const beforeRules = await as(player.cookie, 'POST', '/api/rounds/current/join', {});
    expect(beforeRules.statusCode).toBe(403);
    expect(beforeRules.json().error.code).toBe('RULES_NOT_ACCEPTED');
    const stale = await as(player.cookie, 'POST', '/api/auth/rules/accept', { version: '1999-01-01' });
    expect(stale.json().error.code).toBe('RULES_CHANGED');
    await acceptRules(player.cookie);
    const joined = await as(player.cookie, 'POST', '/api/rounds/current/join', {});
    expect(joined.statusCode, joined.body).toBe(201);
    expect((await as(player.cookie, 'GET', '/api/game/me')).statusCode).toBe(200);
  });

  it('lets a Discord-linked account play without the email link', async () => {
    const player = await register();
    expect((await as(player.cookie, 'POST', '/api/rounds/current/join', {})).statusCode).toBe(403);
    // What the Discord sign-in / link callback records.
    await app.prisma.account.update({ where: { id: player.id }, data: { discordId: `discord-${randomUUID()}`, discordLinkedAt: new Date() } });
    const me = await as(player.cookie, 'GET', '/api/auth/me');
    expect(me.json().account.verificationRequired).toBe(false);
    await acceptRules(player.cookie);
    expect((await as(player.cookie, 'POST', '/api/rounds/current/join', {})).statusCode).toBe(201);
  });

  it('grandfathers accounts that existed before verification was required', async () => {
    const player = await register();
    expect(player.account.verificationRequired).toBe(true);
    // What the migration did for every account that already existed.
    await app.prisma.account.update({ where: { id: player.id }, data: { verificationGrandfatheredAt: new Date('2026-09-01') } });
    const me = await as(player.cookie, 'GET', '/api/auth/me');
    expect(me.json().account).toMatchObject({ verificationRequired: false, emailVerifiedAt: null, rulesAcceptanceRequired: true });
    expect((await as(player.cookie, 'POST', '/api/rounds/current/join', {})).json().error.code).toBe('RULES_NOT_ACCEPTED');
    await acceptRules(player.cookie);
    expect((await as(player.cookie, 'POST', '/api/rounds/current/join', {})).statusCode).toBe(201);
  });

  it('never stops an admin', async () => {
    const admin = await register();
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    expect((await as(admin.cookie, 'POST', '/api/rounds/current/join', {})).statusCode).toBe(201);
  });
});
