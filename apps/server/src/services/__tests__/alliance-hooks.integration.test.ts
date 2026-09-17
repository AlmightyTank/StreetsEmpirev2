import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV03C } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { MyAllianceDto } from '@streets/shared';
import { env } from '../../config/env.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

const forum = vi.hoisted(() => ({
  posts: [] as Array<{ title: string; body: string }>,
  updates: [] as Array<{ id: string; attributes: { title?: string; isLocked?: boolean } }>,
  nextPost: { ok: true, discussionId: '77' } as { ok: true; discussionId: string } | { ok: false; error: string },
}));

// No test ever talks to a real forum: the thread calls are recorded instead.
vi.mock('../forum-news.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../forum-news.service.js')>()),
  postRecruitmentThread: async (post: { title: string; body: string }) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    forum.posts.push(post);
    return forum.nextPost;
  },
  updateForumDiscussion: async (id: string, attributes: { title?: string; isLocked?: boolean }) => {
    forum.updates.push({ id, attributes });
    return null;
  },
}));

/**
 * 0.3.0-C community hooks: forum recruitment threads and Discord role resyncs.
 * Opt in with ALLIANCE_INTEGRATION=1. Uses its own long-ago round.
 */
describe.runIf(process.env.ALLIANCE_INTEGRATION === '1')('alliance community hooks with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId: string;
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const discordIds: string[] = [];
  const rules = classicOgV03C;
  const pimp = (who: number) => 4000 + who;
  const saved = { recruitment: env.forum.recruitment.enabled, bot: env.discordBot.enabled };

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Alliance hooks fixture', slug: `alliance-hooks-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
    for (let i = 0; i < 3; i++) {
      const name = `hook_${randomUUID().slice(0, 8)}`;
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      expect(response.statusCode).toBe(201);
      const accountId = response.json().account.id as string;
      const discordId = `9${String(Date.now()).slice(-10)}${String(i).padStart(6, '0')}`;
      await app.prisma.account.update({ where: { id: accountId }, data: { discordId } });
      accounts.push(accountId);
      discordIds.push(discordId);
      cookies.push(response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId, cityId, displayName: name, publicPimpId: pimp(i),
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
    env.forum.recruitment.enabled = true;
    env.discordBot.enabled = true;
  });

  afterAll(async () => {
    env.forum.recruitment.enabled = saved.recruitment;
    env.discordBot.enabled = saved.bot;
    vi.restoreAllMocks();
    await app.prisma.discordResyncRequest.deleteMany({ where: { OR: [{ discordId: { in: discordIds } }, { discordId: null, requestedByUsername: 'Alliance change', claimedAt: null }] } });
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    forum.posts.length = 0;
    forum.updates.length = 0;
    forum.nextPost = { ok: true, discussionId: '77' };
    await app.prisma.roundPlayer.updateMany({ where: { id: { in: players } }, data: { allianceId: null, allianceJoinedAt: null, formerAllianceId: null, allianceCooldownUntil: null } });
    await app.prisma.alliance.deleteMany({ where: { roundId } });
    await app.prisma.discordResyncRequest.deleteMany({ where: { OR: [{ discordId: { in: discordIds } }, { discordId: null, requestedByUsername: 'Alliance change', claimedAt: null }] } });
  });

  const post = (who: number, path: string, payload: object = {}) => app.inject({
    method: 'POST', url: `/api/game${path}`, headers: { cookie: cookies[who]! }, payload,
  });

  it('posts one recruitment thread per alliance, even on a double click', async () => {
    expect((await post(0, '/alliance/create', { name: 'Hook Crew', tag: 'HOOK' })).statusCode).toBe(200);
    await post(0, '/alliance/invite', { targetPublicPimpId: pimp(1) });
    expect((await post(1, '/alliance/accept', { tag: 'HOOK' })).statusCode).toBe(200);

    const notLeader = await post(1, '/alliance/forum-thread', { pitch: 'hi' });
    expect(notLeader.statusCode).toBe(403);

    const [first, second] = await Promise.all([
      post(0, '/alliance/forum-thread', { pitch: 'Active crew, looking for two raiders.' }),
      post(0, '/alliance/forum-thread', { pitch: 'Active crew, looking for two raiders.' }),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    expect(forum.posts).toHaveLength(1);
    expect(forum.posts[0]!.title).toBe('[HOOK] Hook Crew is recruiting');
    expect(forum.posts[0]!.body).toContain('Active crew, looking for two raiders.');
    expect(forum.posts[0]!.body).toContain('/game/alliances/HOOK');
    const mine = [first, second].find((response) => response.statusCode === 200)!.json<MyAllianceDto>();
    expect(mine.alliance!.forumUrl).toMatch(/\/d\/77$/);
    expect((await post(0, '/alliance/forum-thread', {})).json().error.code).toBe('FORUM_THREAD_EXISTS');
  });

  it('lets the leader retry after the forum refuses, and shows why', async () => {
    await post(0, '/alliance/create', { name: 'Retry Crew', tag: 'RETRY' });
    forum.nextPost = { ok: false, error: 'The forum answered 500.' };
    const failed = await post(0, '/alliance/forum-thread', {});
    expect(failed.statusCode).toBe(409);
    expect(failed.json().error.code).toBe('FORUM_POST_FAILED');
    const mine = (await app.inject({ method: 'GET', url: '/api/game/alliance', headers: { cookie: cookies[0]! } })).json<MyAllianceDto>();
    expect(mine.forum.error).toBe('The forum answered 500.');
    forum.nextPost = { ok: true, discussionId: '78' };
    expect((await post(0, '/alliance/forum-thread', {})).statusCode).toBe(200);
  });

  it('retitles and locks the thread when the alliance disbands', async () => {
    await post(0, '/alliance/create', { name: 'Short Lived', tag: 'SHORT' });
    await post(0, '/alliance/forum-thread', {});
    expect((await post(0, '/alliance/leave')).statusCode).toBe(200);
    expect(forum.updates).toEqual([{ id: '77', attributes: { title: '[SHORT] Short Lived (disbanded)', isLocked: true } }]);
  });

  it('queues Discord role resyncs for joins and leaves, and a full resync when an alliance disbands', async () => {
    await post(0, '/alliance/create', { name: 'Role Crew', tag: 'ROLE' });
    await post(0, '/alliance/invite', { targetPublicPimpId: pimp(1) });
    await post(1, '/alliance/accept', { tag: 'ROLE' });
    await post(0, '/alliance/kick', { targetPublicPimpId: pimp(1) });
    const pending = await app.prisma.discordResyncRequest.findMany({ where: { discordId: { in: discordIds }, claimedAt: null }, orderBy: { createdAt: 'asc' } });
    expect(pending.map((row) => row.discordId)).toEqual([discordIds[0], discordIds[1], discordIds[1]]);

    await post(0, '/alliance/leave');
    expect(await app.prisma.discordResyncRequest.count({ where: { discordId: null, requestedByUsername: 'Alliance change', claimedAt: null } })).toBeGreaterThanOrEqual(1);

  });
});
