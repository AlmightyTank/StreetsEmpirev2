import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

type Who = { id: string; username: string; cookie: string };

describe.runIf(process.env.ADMIN_INTEGRATION === '1')('Admin integrations API with PostgreSQL', () => {
  let app: FastifyInstance;
  let env: (typeof import('../../config/env.js'))['env'];
  let admin: Who;
  let player: Who;
  let target: Who;
  const accountIds: string[] = [];

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBe(201);
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === env.SESSION_COOKIE_NAME);
    if (!session) throw new Error('Registering did not set a session cookie.');
    return { id: accountId, username, cookie: `${session.name}=${session.value}` };
  }

  const headers = (who?: Who) => (who ? { cookie: who.cookie } : {});
  const get = (url: string, who: Who = admin) => app.inject({ url, headers: headers(who) });
  const post = (url: string, payload?: object, who: Who = admin) =>
    app.inject({ method: 'POST', url, headers: headers(who), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    ({ env } = await import('../../config/env.js'));
    app = await (await import('../../app.js')).buildApp();
    admin = await register('adm');
    player = await register('ply');
    target = await register('tgt');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.adminAuditLog.deleteMany({ where: { actorAccountId: { in: accountIds } } });
    await app.prisma.discordResyncRequest.deleteMany({ where: { requestedByAccountId: { in: accountIds } } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app.close();
  });

  it('refuses every integrations route to guests and non-admins', async () => {
    const requests = [
      { method: 'GET' as const, url: '/api/admin/discord' },
      { method: 'POST' as const, url: '/api/admin/discord/resync' },
      { method: 'GET' as const, url: '/api/admin/rulesets/classic-og-v0.3-b' },
      { method: 'GET' as const, url: '/api/admin/dev-bots' },
      { method: 'POST' as const, url: '/api/admin/dev-bots/seed' },
      { method: 'POST' as const, url: '/api/admin/dev-bots/remove', payload: { reason: 'Never runs here' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${target.id}/email/resend`, payload: { reason: 'Never runs here' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${target.id}/email/verify`, payload: { reason: 'Never runs here' } },
      { method: 'POST' as const, url: `/api/admin/accounts/${target.id}/forum/unlink`, payload: { reason: 'Never runs here' } },
    ];
    for (const request of requests) {
      expect((await app.inject({ ...request, headers: headers() })).statusCode, `${request.method} ${request.url} as a guest`).toBe(401);
      expect((await app.inject({ ...request, headers: headers(player) })).statusCode, `${request.method} ${request.url} as a player`).toBe(403);
    }
    expect((await app.prisma.account.findUniqueOrThrow({ where: { id: target.id } })).emailVerifiedAt).toBeNull();
    expect(await app.prisma.discordResyncRequest.count({ where: { requestedByAccountId: player.id } })).toBe(0);
  });

  it('marks an email verified and refuses to resend while the mailer is off', async () => {
    const detail = await get(`/api/admin/accounts/${target.id}`);
    expect(detail.json().email).toEqual({ verifiedAt: null, sendingEnabled: false });

    const resend = await post(`/api/admin/accounts/${target.id}/email/resend`, { reason: 'Player never got the mail' });
    expect(resend.statusCode, resend.body).toBe(400);
    expect(resend.json().error.code).toBe('EMAIL_SENDING_DISABLED');

    expect((await post(`/api/admin/accounts/${target.id}/email/verify`, {})).statusCode).toBe(400);
    const verified = await post(`/api/admin/accounts/${target.id}/email/verify`, { reason: 'Confirmed ownership over Discord' });
    expect(verified.statusCode, verified.body).toBe(200);
    expect(verified.json().email.verifiedAt).not.toBeNull();
    expect(verified.json().account.emailVerified).toBe(true);
    expect((await post(`/api/admin/accounts/${target.id}/email/verify`, { reason: 'Second time around' })).statusCode).toBe(409);
    expect((await post(`/api/admin/accounts/${target.id}/email/resend`, { reason: 'Already verified now' })).statusCode).toBe(409);

    const audit = await app.prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: target.id, action: 'account.mark-email-verified' } });
    expect(audit).toMatchObject({ reason: 'Confirmed ownership over Discord', actorAccountId: admin.id });
  });

  it('unlinks a forum account and records what was linked', async () => {
    const forumUserId = String(randomInt(100_000, 999_999));
    await app.prisma.forumLink.create({ data: { accountId: target.id, forumOrigin: env.forum.origin, forumUserId, forumUsername: `forum_${forumUserId}` } });

    const detail = await get(`/api/admin/accounts/${target.id}`);
    expect(detail.json().forumLink).toMatchObject({ forumUserId, forumUsername: `forum_${forumUserId}` });
    expect(detail.json().forumLink.profileUrl).toContain(env.forum.origin);

    const unlinked = await post(`/api/admin/accounts/${target.id}/forum/unlink`, { reason: 'Wrong forum account connected' });
    expect(unlinked.statusCode, unlinked.body).toBe(200);
    expect(unlinked.json().forumLink).toBeNull();
    expect(await app.prisma.forumLink.count({ where: { accountId: target.id } })).toBe(0);

    const again = await post(`/api/admin/accounts/${target.id}/forum/unlink`, { reason: 'Wrong forum account connected' });
    expect(again.statusCode, again.body).toBe(404);
    expect(again.json().error.code).toBe('FORUM_NOT_LINKED');

    const audit = await app.prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: target.id, action: 'account.unlink-forum' } });
    expect((audit.after as { unlinkedForum: { forumUsername: string } }).unlinkedForum.forumUsername).toBe(`forum_${forumUserId}`);
  });

  it('reports Discord queues and queues a resync only when the bot API is configured', async () => {
    const status = await get('/api/admin/discord');
    expect(status.statusCode, status.body).toBe(200);
    expect(status.json()).toMatchObject({ botApiEnabled: env.discordBot.enabled });
    expect(typeof status.json().queues.news.pending).toBe('number');

    const everyone = await post('/api/admin/discord/resync', { reason: 'Roles drifted after the season' });
    if (!env.discordBot.enabled) {
      expect(everyone.statusCode, everyone.body).toBe(400);
      expect(everyone.json().error.code).toBe('DISCORD_BOT_DISABLED');
      return;
    }
    expect(everyone.statusCode, everyone.body).toBe(200);
    expect(everyone.json().queues.resyncs).toBeGreaterThanOrEqual(1);
    const unlinked = await post('/api/admin/discord/resync', { accountId: target.id });
    expect(unlinked.statusCode, unlinked.body).toBe(409);

    const claim = await app.inject({ method: 'POST', url: '/api/internal/discord/resync/claim', headers: { authorization: `Bearer ${env.discordBot.apiToken}` } });
    expect(claim.statusCode, claim.body).toBe(200);
    expect(claim.json().all).toBe(true);
    expect(await app.prisma.discordResyncRequest.count({ where: { requestedByAccountId: admin.id, claimedAt: null } })).toBe(0);
  });

  it('shows ruleset numbers and diffs, and dev bot status without touching bots', async () => {
    const same = await get('/api/admin/rulesets/classic-og-v0.3-b?compare=classic-og-v0.3-a');
    expect(same.statusCode, same.body).toBe(200);
    expect(same.json().changedCount).toBe(0);
    const different = await get('/api/admin/rulesets/classic-og-v0.3-a?compare=classic-og-v0.2-h');
    expect(different.json().changedCount).toBeGreaterThan(0);
    expect((await get('/api/admin/rulesets/nope')).statusCode).toBe(404);

    const bots = await get('/api/admin/dev-bots');
    expect(bots.statusCode, bots.body).toBe(200);
    expect(bots.json().blockedReason).toBeNull();
    expect(Array.isArray(bots.json().bots)).toBe(true);
    expect((await post('/api/admin/dev-bots/remove', {})).statusCode).toBe(400);
  });
});
