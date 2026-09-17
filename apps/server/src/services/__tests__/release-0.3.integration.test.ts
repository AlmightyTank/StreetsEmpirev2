import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV03D } from '@streets/rulesets';
import type { AllianceBalanceDto, AllianceWireDto, CombatPageDto, ContactsDto, HallOfFameDto, MyAllianceDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.3.0-E release regression: one alliance season from join to Hall of Fame on
 * the current ruleset, plus exploit checks on membership. Opt in with
 * RELEASE_INTEGRATION=1. Uses its own long-ago round and cleans up after itself.
 */
describe.runIf(process.env.RELEASE_INTEGRATION === '1')('0.3.0-E alliance season regression', () => {
  let app: FastifyInstance;
  let roundId: string;
  const rules = classicOgV03D;
  const accounts: string[] = [];
  const cookies: string[] = [];
  const pimps: number[] = [];
  const names: string[] = [];
  let adminCookie = '';

  const post = (who: number, url: string, payload: object = {}) => app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cookies[who]! }, payload });
  const get = (who: number, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cookies[who]! } });
  const player = (who: number) => app.prisma.roundPlayer.findFirstOrThrow({ where: { roundId, accountId: accounts[who]! } });

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Release 0.3 fixture', slug: `release-03-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000), nextPublicPimpId: rules.round.publicPimpIdStart,
    } });
    roundId = round.id;
    // Readiness and round lookups would otherwise find the local dev round and close this older fixture as superseded.
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));

    // Five players join through the real join route; the fifth is an admin.
    for (let i = 0; i < 5; i++) {
      const name = `rel3_${randomUUID().slice(0, 8)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      expect(registered.statusCode).toBe(201);
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      names.push(name);
      const joined = await post(i, '/rounds/current/join');
      expect(joined.statusCode, joined.body).toBe(201);
      pimps.push(joined.json().me.publicPimpId);
    }
    await app.prisma.account.update({ where: { id: accounts[4]! }, data: { isAdmin: true } });
    adminCookie = cookies[4]!;

    // Raid-ready crews past newcomer protection.
    for (let i = 0; i < 4; i++) {
      const row = await player(i);
      const data = { ...row, thugs: i === 3 ? 20 : 12, pistols: i === 3 ? 20 : 12, woundedThugs: 0, turns: 144, cashCents: 4_000_000n,
        createdAt: new Date(Date.now() - 2 * 86_400_000), lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id: row.id }, data: {
        thugs: data.thugs, pistols: data.pistols, woundedThugs: 0, turns: 144, cashCents: data.cashCents,
        createdAt: data.createdAt, lastActiveAt: data.lastActiveAt, lastTurnCalculationAt: data.lastTurnCalculationAt,
        netWorthCents: NetWorthService.calculate(data, rules),
      } });
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

  it('serves liveness, readiness and the 0.3.0-D milestone', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toMatchObject({ ok: true });
    expect((await app.inject({ method: 'GET', url: '/api/ready' })).statusCode).toBe(200);
  });

  it('runs the alliance loop: found, invite, join, wire, contacts and shared recon', async () => {
    expect((await post(0, '/game/alliance/create', { name: 'Release Crew', tag: 'REL' })).statusCode).toBe(200);
    expect((await post(0, '/game/alliance/invite', { targetPublicPimpId: pimps[1] })).statusCode).toBe(200);
    const joined = await post(1, '/game/alliance/accept', { tag: 'REL' });
    expect(joined.json<MyAllianceDto>().alliance).toMatchObject({ tag: 'REL', memberCount: 2 });

    expect((await post(1, '/game/alliance/wire', { body: 'Scouting the big crew now.' })).json<AllianceWireDto>().posts).toHaveLength(1);
    expect((await get(0, '/game/alliance/wire')).json<AllianceWireDto>().posts[0]!.body).toBe('Scouting the big crew now.');
    expect((await post(0, '/game/contacts', { targetPublicPimpId: pimps[2], note: 'Soft target' })).json<ContactsDto>().contacts).toHaveLength(1);

    const recon = await post(1, '/game/combat/recon', { roundId, targetPublicPimpId: pimps[2], actionId: randomUUID() });
    expect(recon.statusCode, recon.body).toBe(200);
    const target = (await get(0, '/game/combat')).json<CombatPageDto>().targets.find((row) => row.publicPimpId === pimps[2])!;
    expect(target.intel?.sharedBy).toBe(names[1]);
    // An outsider sees no intel on the same target.
    expect((await get(3, '/game/combat')).json<CombatPageDto>().targets.find((row) => row.publicPimpId === pimps[2])!.intel ?? null).toBeNull();
  });

  it('records battles for balance, with no friendly fire and shared revenge', async () => {
    const friendly = await post(0, '/game/combat/raid', { roundId, targetPublicPimpId: pimps[1], attackingThugs: 1, actionId: randomUUID() });
    expect(friendly.statusCode).toBe(409);

    const allyIntelRaid = await post(0, '/game/combat/raid', { roundId, targetPublicPimpId: pimps[2], attackingThugs: 12, actionId: randomUUID() });
    expect(allyIntelRaid.statusCode, allyIntelRaid.body).toBe(200);
    const hit = await post(3, '/game/combat/raid', { roundId, targetPublicPimpId: pimps[1], attackingThugs: 20, actionId: randomUUID() });
    expect(hit.statusCode, hit.body).toBe(200);

    const alliance = await app.prisma.alliance.findFirstOrThrow({ where: { roundId, tag: 'REL' } });
    const battles = await app.prisma.raidBattle.findMany({ where: { attacker: { roundId } }, orderBy: { createdAt: 'asc' } });
    expect(battles.map((row) => [row.attackerAllianceId, row.defenderAllianceId, row.attackerIntel])).toEqual([
      [alliance.id, null, 'ally'],
      [null, alliance.id, null],
    ]);

    const revenge = (await get(0, '/game/combat')).json<CombatPageDto>().targets.find((row) => row.publicPimpId === pimps[3])!;
    expect(revenge.revengeAvailable).toBe(true);

    const balance = await app.inject({ method: 'GET', url: `/api/admin/rounds/${roundId}/alliance-balance`, headers: { cookie: adminCookie } });
    expect(balance.statusCode, balance.body).toBe(200);
    const report = balance.json<AllianceBalanceDto>();
    expect(report.battles.allianceIntoSolo.battles).toBe(1);
    expect(report.battles.soloIntoAlliance.battles).toBe(1);
    expect(report.battles.withAllyIntel.battles).toBe(1);
    expect(report.players).toMatchObject({ inAlliances: 2, alliances: 1 });
    expect((await get(0, `/admin/rounds/${roundId}/alliance-balance`)).statusCode).toBe(403);
  });

  it('refuses membership exploits', async () => {
    // No invite, wrong leader, forged tags.
    expect((await post(2, '/game/alliance/accept', { tag: 'REL' })).statusCode).toBe(404);
    expect((await post(1, '/game/alliance/invite', { targetPublicPimpId: pimps[2] })).statusCode).toBe(403);
    expect((await post(2, '/game/alliance/accept', { tag: 'NOPE' })).statusCode).toBe(404);
    expect((await post(2, '/game/alliance/create', { name: 'Release Crew', tag: 'REL2' })).json().error.code).toBe('ALLIANCE_NAME_TAKEN');
    expect((await post(0, '/game/alliance/kick', { targetPublicPimpId: pimps[3] })).json().error.code).toBe('NOT_A_MEMBER');
    // Unknown fields and oversized input are rejected before any work.
    expect((await post(2, '/game/alliance/create', { name: 'Extra', tag: 'EXT', leaderId: 'someone' })).statusCode).toBe(400);
    expect((await post(1, '/game/alliance/wire', { body: 'x'.repeat(1_000) })).statusCode).toBe(400);

    // The same player founding twice at once gets exactly one alliance.
    const results = await Promise.all([
      post(2, '/game/alliance/create', { name: 'Race One', tag: 'RACE1' }),
      post(2, '/game/alliance/create', { name: 'Race Two', tag: 'RACE2' }),
    ]);
    expect(results.map((row) => row.statusCode).sort()).toEqual([200, 409]);
    expect(await app.prisma.alliance.count({ where: { roundId, leaderId: (await player(2)).id, disbandedAt: null } })).toBe(1);

    // Kicked members cannot come straight back.
    await post(0, '/game/alliance/kick', { targetPublicPimpId: pimps[1] });
    await post(0, '/game/alliance/invite', { targetPublicPimpId: pimps[1] });
    expect((await post(1, '/game/alliance/accept', { tag: 'REL' })).json().error.code).toBe('ALLIANCE_COOLDOWN');
    expect((await get(1, '/game/alliance/wire')).statusCode).toBe(409);
  });

  it('closes the season: alliances freeze and the Hall of Fame keeps their tags', async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { endsAt: new Date(Date.now() - 1_000) } });
    const closed = await RoundService.closeIfExpired(app.prisma, roundId);
    expect(closed.closed).toBe(true);
    expect(closed.round.status).toBe('ENDED');

    expect((await post(3, '/game/alliance/create', { name: 'Too Late', tag: 'LATE' })).json().error.code).toBe('ROUND_NOT_PLAYABLE');
    expect((await post(0, '/game/alliance/wire', { body: 'after the bell' })).json().error.code).toBe('ROUND_NOT_PLAYABLE');
    expect((await get(0, '/game/alliance/wire')).statusCode).toBe(200);
    expect((await post(3, '/game/combat/raid', { roundId, targetPublicPimpId: pimps[0], attackingThugs: 1, actionId: randomUUID() })).statusCode).toBe(409);

    const hall = (await app.inject({ method: 'GET', url: '/api/game/hall-of-fame' })).json<HallOfFameDto>();
    const season = hall.rounds.find((row) => row.id === roundId)!;
    expect(season.topTen.length).toBeGreaterThan(0);
    const leader = season.topTen.find((row) => row.publicPimpId === pimps[0]);
    expect(leader?.alliance).toEqual({ name: 'Release Crew', tag: 'REL' });
  });
});
