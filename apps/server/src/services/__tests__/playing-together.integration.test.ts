import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV03D } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { CONTACTS_MAX, WIRE_COOLDOWN_SECONDS, type AllianceWireDto, type CombatPageDto, type ContactsDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.3.0-D gate: shared intel never leaks outside the alliance, the wire is
 * members-only, and contacts stay private. Opt in with ALLIANCE_INTEGRATION=1.
 */
describe.runIf(process.env.ALLIANCE_INTEGRATION === '1')('playing together with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId: string;
  let cityId: string;
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV03D;
  const pimp = (who: number) => 5000 + who;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Playing together fixture', slug: `together-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
    for (let i = 0; i < 5; i++) {
      const name = `tog_${randomUUID().slice(0, 8)}`;
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      expect(response.statusCode).toBe(201);
      accounts.push(response.json().account.id);
      cookies.push(response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[i]!, cityId, displayName: name, publicPimpId: pimp(i),
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) {
      await app.prisma.adminAuditLog.deleteMany({ where: { actorAccountId: { in: accounts } } });
      await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    }
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.combatIntel.deleteMany({ where: { observerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerContact.deleteMany({ where: { ownerId: { in: players } } });
    await app.prisma.roundPlayer.updateMany({ where: { id: { in: players } }, data: { allianceId: null, allianceJoinedAt: null, formerAllianceId: null, allianceCooldownUntil: null } });
    await app.prisma.alliance.deleteMany({ where: { roundId } });
    for (const id of players) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules), thugs: 10, pistols: 10, turns: 144, cashCents: 4_000_000n, cityId,
        createdAt: new Date(Date.now() - 2 * 86_400_000), lastActiveAt: new Date(), lastTurnCalculationAt: new Date(), lastAwayBonusAt: null };
      await app.prisma.roundPlayer.update({ where: { id }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const post = (who: number, path: string, payload: object = {}) => app.inject({ method: 'POST', url: `/api/game${path}`, headers: { cookie: cookies[who]! }, payload });
  const get = (who: number, path: string) => app.inject({ method: 'GET', url: `/api/game${path}`, headers: { cookie: cookies[who]! } });

  async function crew(leader: number, tag: string, members: number[]) {
    expect((await post(leader, '/alliance/create', { name: `Crew ${tag}`, tag })).statusCode).toBe(200);
    for (const who of members) {
      await post(leader, '/alliance/invite', { targetPublicPimpId: pimp(who) });
      expect((await post(who, '/alliance/accept', { tag })).statusCode).toBe(200);
    }
  }
  const intelOn = async (who: number, target: number) =>
    (await get(who, '/combat')).json<CombatPageDto>().targets.find((row) => row.publicPimpId === pimp(target))!.intel;

  it('shares fresh recon with current allies only, and cuts it off when someone leaves', async () => {
    await crew(0, 'EYES', [1, 2]);
    const recon = await post(0, '/combat/recon', { roundId, targetPublicPimpId: pimp(4), actionId: randomUUID() });
    expect(recon.statusCode, recon.body).toBe(200);

    expect((await intelOn(0, 4))!.sharedBy).toBeNull();
    const shared = await intelOn(1, 4);
    expect(shared).toMatchObject({ targetPublicPimpId: pimp(4) });
    expect(shared!.sharedBy).toBe((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[0]! } })).displayName);
    // Outsiders, including the target, see nothing.
    expect(await intelOn(3, 4)).toBeNull();

    // The one who gathered it leaves: the alliance loses it, the gatherer keeps their own.
    await post(0, '/alliance/transfer', { targetPublicPimpId: pimp(1) });
    expect((await post(0, '/alliance/leave')).statusCode).toBe(200);
    expect(await intelOn(1, 4)).toBeNull();
    expect(await intelOn(0, 4)).not.toBeNull();

    // A member who leaves stops seeing the alliance's intel too.
    await post(2, '/combat/recon', { roundId, targetPublicPimpId: pimp(3), actionId: randomUUID() });
    expect(await intelOn(1, 3)).not.toBeNull();
    expect((await post(1, '/alliance/kick', { targetPublicPimpId: pimp(2) })).statusCode).toBe(200);
    expect(await intelOn(1, 3)).toBeNull();
  });

  it('prefers your own report over an ally\'s', async () => {
    await crew(0, 'MINE', [1]);
    await post(1, '/combat/recon', { roundId, targetPublicPimpId: pimp(4), actionId: randomUUID() });
    await post(0, '/combat/recon', { roundId, targetPublicPimpId: pimp(4), actionId: randomUUID() });
    expect((await intelOn(0, 4))!.sharedBy).toBeNull();
  });

  it('keeps the wire inside the alliance, with a cooldown, and lets the author or leader remove posts', async () => {
    await crew(0, 'WIRE', [1]);
    expect((await get(3, '/alliance/wire')).statusCode).toBe(409);
    expect((await post(3, '/alliance/wire', { body: 'let me in' })).statusCode).toBe(409);

    const first = await post(1, '/alliance/wire', { body: 'Hitting #5004 at 9pm, bring beer.' });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json<AllianceWireDto>().cooldownUntil).not.toBeNull();
    const again = await post(1, '/alliance/wire', { body: 'and medicine' });
    expect(again.json().error.code).toBe('WIRE_COOLDOWN');
    expect((await post(1, '/alliance/wire', { body: 'x'.repeat(281) })).statusCode).toBe(400);

    const leaderView = (await get(0, '/alliance/wire')).json<AllianceWireDto>();
    expect(leaderView.posts).toHaveLength(1);
    expect(leaderView.posts[0]).toMatchObject({ body: 'Hitting #5004 at 9pm, bring beer.', canRemove: true, isYours: false });

    await post(0, '/alliance/wire', { body: 'Leader here.' });
    const memberView = (await get(1, '/alliance/wire')).json<AllianceWireDto>();
    const leaderPost = memberView.posts.find((row) => row.body === 'Leader here.')!;
    expect(leaderPost.canRemove).toBe(false);
    expect((await post(1, `/alliance/wire/${leaderPost.id}/remove`)).statusCode).toBe(403);

    const removed = await post(0, `/alliance/wire/${leaderView.posts[0]!.id}/remove`);
    expect(removed.json<AllianceWireDto>().posts.map((row) => row.body)).toEqual(['Leader here.']);
    expect((await app.prisma.allianceWirePost.findUniqueOrThrow({ where: { id: leaderView.posts[0]!.id } })).removedByRole).toBe('leader');

    // Leaving takes the wire away.
    await post(1, '/alliance/leave');
    expect((await get(1, '/alliance/wire')).statusCode).toBe(409);
    expect(WIRE_COOLDOWN_SECONDS).toBeGreaterThan(0);
  });

  it('lets an admin remove a wire post with an audit record', async () => {
    await crew(0, 'MOD', []);
    await post(0, '/alliance/wire', { body: 'something rude' });
    const alliance = await app.prisma.alliance.findFirstOrThrow({ where: { roundId, tag: 'MOD' } });
    const target = await app.prisma.allianceWirePost.findFirstOrThrow({ where: { allianceId: alliance.id } });
    await app.prisma.account.update({ where: { id: accounts[4]! }, data: { isAdmin: true } });
    const admin = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url: `/api/admin${url}`, headers: { cookie: cookies[4]! }, ...(payload ? { payload } : {}) });
    expect((await app.inject({ method: 'GET', url: `/api/admin/alliances/${alliance.id}/wire`, headers: { cookie: cookies[0]! } })).statusCode).toBe(403);
    expect((await admin('POST', `/wire/${target.id}/remove`, { reason: 'Harassment' })).statusCode).toBe(200);
    const list = (await admin('GET', `/alliances/${alliance.id}/wire`)).json();
    expect(list.posts[0]).toMatchObject({ removedByRole: 'admin', removedReason: 'Harassment' });
    expect((await get(0, '/alliance/wire')).json<AllianceWireDto>().posts).toHaveLength(0);
    expect(await app.prisma.adminAuditLog.count({ where: { action: 'wire.remove', targetId: target.id } })).toBe(1);
  });

  it('keeps contacts private, with notes and live public standing', async () => {
    const added = await post(0, '/contacts', { targetPublicPimpId: pimp(3), note: 'Keeps his cash out' });
    expect(added.statusCode, added.body).toBe(200);
    const contacts = added.json<ContactsDto>();
    expect(contacts.max).toBe(CONTACTS_MAX);
    expect(contacts.contacts[0]).toMatchObject({ publicPimpId: pimp(3), note: 'Keeps his cash out', alliance: null });
    expect(contacts.contacts[0]!.standing!.nationalRank).toBeGreaterThanOrEqual(1);
    // No intel fields ever ride along.
    expect(Object.keys(contacts.contacts[0]!.standing!).sort()).toEqual(['city', 'lastActiveAt', 'nationalRank', 'netWorthCents']);

    expect((await post(0, '/contacts', { targetPublicPimpId: pimp(0) })).statusCode).toBe(400);
    expect((await get(3, '/contacts')).json<ContactsDto>().contacts).toHaveLength(0);
    expect((await get(3, `/contacts/${pimp(0)}`)).json().contact).toBeNull();

    await crew(3, 'SEEN', []);
    expect((await get(0, '/contacts')).json<ContactsDto>().contacts[0]!.alliance).toEqual({ name: 'Crew SEEN', tag: 'SEEN' });
    expect((await post(0, `/contacts/${pimp(3)}/note`, { note: 'Now in SEEN' })).json<ContactsDto>().contacts[0]!.note).toBe('Now in SEEN');
    expect((await post(0, `/contacts/${pimp(3)}/remove`)).json<ContactsDto>().contacts).toHaveLength(0);
  });
});
