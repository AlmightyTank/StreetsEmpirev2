import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV19B } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { AllianceWireDto, CombatPageDto, MyAllianceDto } from '@streets/shared';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/** PostgreSQL-only acceptance race: opt in with ALLIANCE_INTEGRATION=1. */
describe.runIf(process.env.ALLIANCE_INTEGRATION === '1')('3.0-B alliance capacity', () => {
  let app: FastifyInstance;
  let roundId: string;
  const accounts: string[] = [];
  const cookies: string[] = [];
  const players: string[] = [];
  const rules = classicOgV19B;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const round = await app.prisma.round.create({ data: {
      name: '3.0-B alliance capacity test', slug: `alliance-cap-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
    for (let i = 0; i < 17; i++) {
      const username = `cap_${randomUUID().slice(0, 8)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: {
        birthDate: '1990-01-01',
        ageConfirmed: true,
        username, email: `${username}@example.invalid`, password: randomUUID(),
      } });
      expect(registered.statusCode, registered.body).toBe(201);
      const accountId = registered.json().account.id as string;
      accounts.push(accountId);
      cookies.push(registered.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: {
        ...rules.round.startingPlayer, ...startingStock(rules), roundId, accountId, cityId: city.id,
        displayName: username, publicPimpId: 6000 + i,
        reputation: { create: ReputationService.seedFor(rules) },
      } });
      players.push(player.id);
    }
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  }, 30_000);

  beforeEach(async () => {
    await app.prisma.roundPlayer.updateMany({ where: { id: { in: players } }, data: {
      allianceId: null, allianceJoinedAt: null, formerAllianceId: null, allianceCooldownUntil: null,
    } });
    await app.prisma.alliance.deleteMany({ where: { roundId } });
  });

  const post = (who: number, path: string, payload: object = {}) => app.inject({
    method: 'POST', url: `/api/game/alliance/${path}`, headers: { cookie: cookies[who]! }, payload,
  });
  const gamePost = (who: number, path: string, payload: object = {}) => app.inject({
    method: 'POST', url: `/api/game${path}`, headers: { cookie: cookies[who]! }, payload,
  });
  const gameGet = (who: number, path: string) => app.inject({
    method: 'GET', url: `/api/game${path}`, headers: { cookie: cookies[who]! },
  });

  it('admits exactly one of two simultaneous acceptances for the last of 15 seats', async () => {
    const founded = await post(0, 'create', { name: 'Fifteen Strong', tag: 'FIFT' });
    expect(founded.statusCode, founded.body).toBe(200);
    expect(founded.json<MyAllianceDto>().alliance).toMatchObject({ memberCount: 1, maxMembers: 15 });
    for (let who = 1; who <= 14; who++) {
      const invited = await post(0, 'invite', { targetPublicPimpId: 6000 + who });
      expect(invited.statusCode, invited.body).toBe(200);
      if (who < 14) {
        const accepted = await post(who, 'accept', { tag: 'FIFT' });
        expect(accepted.statusCode, accepted.body).toBe(200);
      }
    }
    expect((await post(0, 'invite', { targetPublicPimpId: 6015 })).statusCode).toBe(200);
    const results = await Promise.all([14, 15].map((who) => post(who, 'accept', { tag: 'FIFT' })));
    expect(results.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(results.filter((response) => response.statusCode !== 200).map((response) => response.json().error.code)).toEqual(['ALLIANCE_FULL']);
    const alliance = await app.prisma.alliance.findUniqueOrThrow({ where: { roundId_tagNormalized: { roundId, tagNormalized: 'fift' } } });
    expect(await app.prisma.roundPlayer.count({ where: { allianceId: alliance.id } })).toBe(15);
    expect(await app.prisma.roundPlayer.count({ where: { id: { in: [players[14]!, players[15]!] }, allianceId: null } })).toBe(1);
  });

  it('keeps membership singular across competing invitations and serializes leave against kick', async () => {
    expect((await post(0, 'create', { name: 'North Side', tag: 'NORTH' })).statusCode).toBe(200);
    expect((await post(1, 'create', { name: 'South Side', tag: 'SOUTH' })).statusCode).toBe(200);
    for (const leader of [0, 1]) {
      expect((await post(leader, 'invite', { targetPublicPimpId: 6002 })).statusCode).toBe(200);
    }
    const joined = await Promise.all(['NORTH', 'SOUTH'].map((tag) => post(2, 'accept', { tag })));
    expect(joined.filter((response) => response.statusCode === 200)).toHaveLength(1);
    const member = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[2]! } });
    expect(member.allianceId).not.toBeNull();
    const leader = joined[0]!.statusCode === 200 ? 0 : 1;
    const [left, kicked] = await Promise.all([
      post(2, 'leave'),
      post(leader, 'kick', { targetPublicPimpId: 6002 }),
    ]);
    expect([left, kicked].filter((response) => response.statusCode === 200)).toHaveLength(1);
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[2]! } });
    expect(after.allianceId).toBeNull();
    expect(after.formerAllianceId).toBe(member.allianceId);
    expect(after.allianceCooldownUntil!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(await app.prisma.alliance.count({ where: { roundId } })).toBe(2);
    expect(await app.prisma.roundPlayer.count({ where: { roundId, allianceId: member.allianceId } })).toBe(1);
  });

  it('reuses the same alliance wire, shared recon, leadership and revenge on B', async () => {
    expect((await post(0, 'create', { name: 'Original Crew', tag: 'CREW' })).statusCode).toBe(200);
    expect((await post(0, 'invite', { targetPublicPimpId: 6001 })).statusCode).toBe(200);
    expect((await post(1, 'accept', { tag: 'CREW' })).statusCode).toBe(200);
    expect((await gamePost(1, '/alliance/wire', { body: 'Meeting at the block.' })).json<AllianceWireDto>().posts).toHaveLength(1);
    expect((await gameGet(0, '/alliance/wire')).json<AllianceWireDto>().posts[0]!.body).toBe('Meeting at the block.');
    expect((await gameGet(2, '/alliance/wire')).statusCode).toBe(409);
    expect((await post(1, 'transfer', { targetPublicPimpId: 6000 })).statusCode).toBe(403);

    await app.prisma.roundPlayer.updateMany({ where: { id: { in: players.slice(0, 4) } }, data: {
      thugs: 50, pistols: 50, cashCents: 4_000_000n, turns: 144,
      createdAt: new Date(Date.now() - 2 * 86_400_000), raidProtectedUntil: null,
    } });
    const recon = await gamePost(1, '/combat/recon', { roundId, targetPublicPimpId: 6002, actionId: randomUUID() });
    expect(recon.statusCode, recon.body).toBe(200);
    const targetFor = async (who: number, pimpId: number) =>
      (await gameGet(who, '/combat')).json<CombatPageDto>().targets.find((row) => row.publicPimpId === pimpId)!;
    expect((await targetFor(0, 6002)).intel?.sharedBy).not.toBeNull();
    expect((await targetFor(3, 6002)).intel ?? null).toBeNull();
    const hit = await gamePost(3, '/combat/raid', { roundId, targetPublicPimpId: 6001, attackingThugs: 10, actionId: randomUUID() });
    expect(hit.statusCode, hit.body).toBe(200);
    expect((await targetFor(0, 6003)).revengeAvailable).toBe(true);
  });
});
