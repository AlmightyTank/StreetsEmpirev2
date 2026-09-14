import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';
import { signForumPayload } from '../forum-proof.js';

describe.runIf(process.env.FORUM_LINK_INTEGRATION === '1')('verified forum links with PostgreSQL', () => {
  let app: FastifyInstance;
  let env: (typeof import('../../config/env.js'))['env'];
  const accounts: { id: string; cookie: string; username: string; password: string }[] = [];
  let roundId: string;
  let cityId: string;
  const forumId = String(Date.now());

  beforeAll(async () => {
    ({ env } = await import('../../config/env.js'));
    if (!env.forum.enabled) throw new Error('Set a test FORUM_LINK_SECRET.');
    app = await (await import('../../app.js')).buildApp();
    for (let i = 0; i < 2; i++) {
      const username = `forum_${randomUUID().slice(0, 8)}`;
      const password = randomUUID();
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password } });
      expect(response.statusCode).toBe(201);
      accounts.push({ id: response.json().account.id, username, password, cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; ') });
    }
    const city = await app.prisma.city.create({ data: { slug: `forum-test-${randomUUID()}`, name: 'Link Test City', isEnabled: true } });
    cityId = city.id;
    const round = await app.prisma.round.create({ data: {
      slug: `forum-test-${randomUUID()}`, name: 'Link Test Round', rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version,
      status: 'ACTIVE', startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 86400000),
    } });
    roundId = round.id;
    for (let i = 0; i < accounts.length; i++) await app.prisma.roundPlayer.create({ data: {
      ...classicOgV01.round.startingPlayer, accountId: accounts[i]!.id, roundId, cityId, publicPimpId: 7001 + i,
      displayName: accounts[i]!.username, lastTurnCalculationAt: new Date(),
    } });
  });
  beforeEach(async () => {
    // Every test runs link flows on the same accounts. A fresh app gets a fresh
    // in-memory rate limiter instead of sharing the auth bucket (20 per 5 minutes).
    await app.close();
    app = await (await import('../../app.js')).buildApp();
    const ids = accounts.map((a) => a.id);
    await app.prisma.forumLink.deleteMany({ where: { accountId: { in: ids } } });
    await app.prisma.forumLinkRequest.deleteMany({ where: { accountId: { in: ids } } });
  });
  afterAll(async () => {
    if (!app) return;
    await app.prisma.account.deleteMany({ where: { id: { in: accounts.map((a) => a.id) } } });
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (cityId) await app.prisma.city.delete({ where: { id: cityId } });
    await app.close();
  });

  function headers(i = 0) { return { cookie: accounts[i]!.cookie, origin: new URL(env.frontendOrigin).origin }; }
  const post = (action: string, i = 0, payload?: object) => app.inject({ method: 'POST', url: `/api/forum/${action}`, headers: headers(i), ...(payload ? { payload } : {}) });
  async function start(i = 0) {
    const response = await post('start', i);
    expect(response.statusCode, response.body).toBe(200);
    const token = new URLSearchParams(new URL(response.json().url).hash.slice(1)).get('request')!;
    return JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString());
  }
  function proof(request: { nonce: string; exp: number }, userId = forumId) {
    return signForumPayload({ v: 1, purpose: 'forum-link-response', iss: env.forum.origin, aud: new URL(env.frontendOrigin).origin,
      nonce: request.nonce, iat: Math.floor(Date.now() / 1000), exp: request.exp, userId, username: 'Forum Player' }, env.forum.secret);
  }

  it('requires authentication and rejects missing/cross-site origins', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/forum/start' })).statusCode).toBe(401);
    for (const origin of [undefined, env.forum.origin, 'https://attacker.invalid']) {
      const result = await app.inject({ method: 'POST', url: '/api/forum/start', headers: { cookie: accounts[0]!.cookie, ...(origin ? { origin } : {}) } });
      expect(result.statusCode).toBe(403);
    }
  });
  it('links profiles, exposes only the public URL, and resolves the linked account in the current round', async () => {
    const token = proof(await start());
    const response = await post('finish', 0, { proof: token });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().link.profileUrl).toBe(`${env.forum.origin}/street-empire/u/${forumId}`);
    const publicLink = await app.inject(`/api/forum/users/${forumId}`);
    expect(publicLink.json()).toEqual({ profileUrl: new URL(`/game/forum/${forumId}`, env.frontendOrigin).toString() });
    const profile = await app.inject({ url: `/api/game/forum-players/${forumId}`, headers: headers(1) });
    expect(profile.statusCode, profile.body).toBe(200);
    expect(profile.json().player.publicPimpId).toBe(7001);
    expect(profile.json().player.forumProfileUrl).toBe(`${env.forum.origin}/street-empire/u/${forumId}`);
    expect((await post('finish', 0, { proof: token })).statusCode).toBe(400);
    expect((await post('start')).statusCode).toBe(409);
    await post('unlink');
    expect((await app.inject(`/api/forum/users/${forumId}`)).json()).toEqual({ profileUrl: null });
    expect((await app.inject({ url: `/api/game/forum-players/${forumId}`, headers: headers(1) })).statusCode).toBe(404);
  });
  it('binds the request to both the initiating account and session', async () => {
    const token = proof(await start());
    expect((await post('finish', 1, { proof: token })).statusCode).toBe(400);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: accounts[0]!.username, password: accounts[0]!.password } });
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect((await app.inject({ method: 'POST', url: '/api/forum/finish', headers: { ...headers(), cookie }, payload: { proof: token } })).statusCode).toBe(400);
    expect((await post('finish', 0, { proof: token })).statusCode).toBe(200);
  });
  it('invalidates superseded, expired, cancelled, and forged requests', async () => {
    const old = proof(await start());
    const current = proof(await start());
    expect((await post('finish', 0, { proof: old })).statusCode).toBe(400);
    expect((await post('finish', 0, { proof: current.replace(/^./, 'X') })).statusCode).toBe(400);
    await app.prisma.forumLinkRequest.update({ where: { accountId: accounts[0]!.id }, data: { expiresAt: new Date(0) } });
    expect((await post('finish', 0, { proof: current })).statusCode).toBe(400);
    const cancelled = proof(await start());
    await post('unlink');
    expect((await post('finish', 0, { proof: cancelled })).statusCode).toBe(400);
  });
  it('allows only one winner when two game accounts claim the same forum user concurrently', async () => {
    const first = proof(await start());
    const second = proof(await start(1));
    const responses = await Promise.all([post('finish', 0, { proof: first }), post('finish', 1, { proof: second })]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await app.prisma.forumLink.count({ where: { forumUserId: forumId } })).toBe(1);
  });
  it('never maps a forum profile to a different player when its owner has not joined the round', async () => {
    expect((await post('finish', 0, { proof: proof(await start()) })).statusCode).toBe(200);
    const target = await app.prisma.roundPlayer.findFirstOrThrow({ where: { accountId: accounts[0]!.id, roundId } });
    await app.prisma.roundPlayer.delete({ where: { id: target.id } });
    const response = await app.inject({ url: `/api/game/forum-players/${forumId}`, headers: headers(1) });
    expect(response.statusCode, response.body).toBe(404);
    expect(response.json().error.code).toBe('PLAYER_NOT_IN_ROUND');
    expect(await app.prisma.forumLink.findUnique({ where: { accountId: accounts[0]!.id } })).not.toBeNull();
  });
});
