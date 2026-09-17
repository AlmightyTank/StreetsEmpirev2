import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV03C } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { BattleReportDto, CombatPageDto, MyAllianceDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * The 0.3.0-C gate through the real HTTP layer and PostgreSQL. Opt in with
 * ALLIANCE_INTEGRATION=1. Uses its own round, started long ago so it never
 * supersedes the local dev round.
 */
describe.runIf(process.env.ALLIANCE_INTEGRATION === '1')('alliances with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId: string;
  let cityId: string;
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV03C;
  const PLAYERS = 8;
  const pimp = (who: number) => 3000 + who;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Alliance integration fixture', slug: `alliance-test-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } }));
    for (let i = 0; i < PLAYERS; i++) {
      const name = `ally_${randomUUID().slice(0, 8)}`;
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
    await app.prisma.round.update({ where: { id: roundId }, data: { endsAt: new Date(Date.now() + 86_400_000) } });
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.raidBattle.deleteMany({ where: { attackerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.combatIntel.deleteMany({ where: { observerId: { in: players } } });
    await app.prisma.roundPlayer.updateMany({ where: { id: { in: players } }, data: { allianceId: null, allianceJoinedAt: null, formerAllianceId: null, allianceCooldownUntil: null } });
    await app.prisma.alliance.deleteMany({ where: { roundId } });
    for (const id of players) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        thugs: 10, pistols: 10, woundedThugs: 0, whores: 50, crack: 100, beer: 100, lowRiders: 1, turns: 144,
        cashCents: 4_000_000n, cityId,
        createdAt: new Date(Date.now() - 2 * 86_400_000), lastActiveAt: new Date(),
        lastTurnCalculationAt: new Date(), lastAwayBonusAt: null,
        raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null,
        driveByProtectedUntil: null, driveByCooldownUntil: null, lastDrivenByAt: null,
        dailyRankSnapshotAt: null,
      };
      await app.prisma.roundPlayer.update({ where: { id }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const post = (who: number, path: string, payload: object = {}) => app.inject({
    method: 'POST', url: `/api/game${path}`, headers: { cookie: cookies[who]! }, payload,
  });
  const get = (who: number, path: string) => app.inject({ method: 'GET', url: `/api/game${path}`, headers: { cookie: cookies[who]! } });
  const state = (who: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[who]! } });

  async function found(leader: number, name: string, tag: string, members: number[] = []): Promise<void> {
    expect((await post(leader, '/alliance/create', { name, tag })).statusCode).toBe(200);
    for (const who of members) {
      expect((await post(leader, '/alliance/invite', { targetPublicPimpId: pimp(who) })).statusCode).toBe(200);
      const joined = await post(who, '/alliance/accept', { tag });
      expect(joined.statusCode, joined.body).toBe(200);
    }
  }

  const attack = {
    raid: (who: number, target: number) => post(who, '/combat/raid', { roundId, targetPublicPimpId: pimp(target), attackingThugs: 1, actionId: randomUUID() }),
    driveBy: (who: number, target: number) => post(who, '/combat/drive-by', { roundId, targetPublicPimpId: pimp(target), attackingThugs: 1, actionId: randomUUID() }),
    stealRide: (who: number, target: number) => post(who, '/combat/special', { roundId, targetPublicPimpId: pimp(target), attackingThugs: 1, actionId: randomUUID(), kind: 'STEAL_RIDE' }),
    drugHoes: (who: number, target: number) => post(who, '/combat/special', { roundId, targetPublicPimpId: pimp(target), attackingThugs: 1, actionId: randomUUID(), kind: 'DRUG_HOES' }),
    recon: (who: number, target: number) => post(who, '/combat/recon', { roundId, targetPublicPimpId: pimp(target), actionId: randomUUID() }),
  };

  it('founds an alliance and refuses a duplicate name or tag, whatever the case', async () => {
    const created = await post(0, '/alliance/create', { name: 'East Side', tag: 'east' });
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json<MyAllianceDto>()).toMatchObject({ enabled: true, isLeader: true, alliance: { name: 'East Side', tag: 'EAST', memberCount: 1, maxMembers: 5 } });
    const sameName = await post(1, '/alliance/create', { name: 'EAST side', tag: 'WEST' });
    expect(sameName.statusCode).toBe(409);
    expect(sameName.json().error.code).toBe('ALLIANCE_NAME_TAKEN');
    expect((await post(1, '/alliance/create', { name: 'West Side', tag: 'East' })).json().error.code).toBe('ALLIANCE_NAME_TAKEN');
    expect((await post(0, '/alliance/create', { name: 'Second', tag: 'TWO' })).json().error.code).toBe('ALREADY_IN_ALLIANCE');
  });

  it('cannot go past the cap when every invitee accepts at the same moment', async () => {
    await found(0, 'Crowded', 'CROWD');
    for (let who = 1; who <= 6; who++) {
      expect((await post(0, '/alliance/invite', { targetPublicPimpId: pimp(who) })).statusCode).toBe(200);
    }
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map((who) => post(who, '/alliance/accept', { tag: 'CROWD' })));
    const joined = results.filter((response) => response.statusCode === 200);
    const refused = results.filter((response) => response.statusCode !== 200);
    expect(joined).toHaveLength(rules.alliances.maxMembers - 1);
    expect(refused.map((response) => response.json().error.code)).toEqual(['ALLIANCE_FULL', 'ALLIANCE_FULL']);
    const alliance = await app.prisma.alliance.findFirstOrThrow({ where: { roundId, tag: 'CROWD' } });
    expect(await app.prisma.roundPlayer.count({ where: { allianceId: alliance.id } })).toBe(rules.alliances.maxMembers);
  });

  it('lets one player accepting two invites at once join only one alliance', async () => {
    await found(0, 'North', 'NORTH');
    await found(1, 'South', 'SOUTH');
    await post(0, '/alliance/invite', { targetPublicPimpId: pimp(2) });
    await post(1, '/alliance/invite', { targetPublicPimpId: pimp(2) });
    const results = await Promise.all(['NORTH', 'SOUTH'].map((tag) => post(2, '/alliance/accept', { tag })));
    expect(results.filter((response) => response.statusCode === 200)).toHaveLength(1);
    const alliances = await app.prisma.alliance.findMany({ where: { roundId }, include: { _count: { select: { members: true } } } });
    expect(alliances.map((row) => row._count.members).sort()).toEqual([1, 2]);
  });

  it('refuses every attack form and recon against an ally, and says why on the raid page', async () => {
    await found(0, 'Brothers', 'BRO', [1]);
    for (const [form, run] of Object.entries(attack)) {
      const response = await run(0, 1);
      expect(response.statusCode, `${form}: ${response.body}`).toBe(409);
      expect(response.json().error.message, form).toContain('your alliance');
    }
    expect(await app.prisma.raidBattle.count({ where: { attackerId: { in: players } } })).toBe(0);
    expect(await app.prisma.combatIntel.count({ where: { observerId: players[0] } })).toBe(0);

    const page = (await get(0, '/combat')).json<CombatPageDto>();
    const ally = page.targets.find((target) => target.publicPimpId === pimp(1))!;
    expect(ally.alliance).toEqual({ name: 'Brothers', tag: 'BRO' });
    expect(ally.blockedReason).toContain('your alliance');
    expect(ally.driveByBlockedReason).toContain('your alliance');
    for (const reason of Object.values(ally.specialRaidBlockedReasons ?? {})) expect(reason).toContain('your alliance');
    expect(page.targets.find((target) => target.publicPimpId === pimp(2))!.alliance).toBeNull();
  });

  it('does not let an alliance drop a member to raid them, or the member hop to another crew', async () => {
    await found(0, 'Old Crew', 'OLD', [1]);
    expect((await post(0, '/alliance/kick', { targetPublicPimpId: pimp(1) })).statusCode).toBe(200);
    for (const [attacker, target] of [[0, 1], [1, 0]] as const) {
      const response = await attack.raid(attacker, target);
      expect(response.statusCode).toBe(409);
      expect(response.json().error.message).toContain('cooldown');
    }
    await found(2, 'New Crew', 'NEW');
    await post(2, '/alliance/invite', { targetPublicPimpId: pimp(1) });
    expect((await post(1, '/alliance/accept', { tag: 'NEW' })).json().error.code).toBe('ALLIANCE_COOLDOWN');
    expect((await post(1, '/alliance/create', { name: 'Solo Crew', tag: 'SOLO' })).json().error.code).toBe('ALLIANCE_COOLDOWN');
    // A stranger to the old crew is fair game straight away.
    expect((await attack.raid(2, 1)).statusCode).toBe(200);

    await app.prisma.roundPlayer.update({ where: { id: players[1]! }, data: { allianceCooldownUntil: new Date(Date.now() - 1_000), raidProtectedUntil: null, lastRaidedAt: null } });
    const afterCooldown = await attack.raid(0, 1);
    expect(afterCooldown.statusCode, afterCooldown.body).toBe(200);
    expect((await post(1, '/alliance/accept', { tag: 'NEW' })).statusCode).toBe(200);
  });

  it('shares revenge across the alliance, and the victim leaving does not close it', async () => {
    await found(0, 'Payback', 'PAY', [1, 2]);
    const hit = await attack.raid(3, 1);
    expect(hit.statusCode, hit.body).toBe(200);
    const battle = await app.prisma.raidBattle.findFirstOrThrow({ where: { attackerId: players[3] } });
    const alliance = await app.prisma.alliance.findFirstOrThrow({ where: { roundId, tag: 'PAY' } });
    expect(battle.defenderAllianceId).toBe(alliance.id);

    // Shield the attacker: only payback can reach them now.
    await app.prisma.roundPlayer.update({ where: { id: players[3]! }, data: { raidProtectedUntil: new Date(Date.now() + 3_600_000) } });
    expect((await attack.raid(4, 3)).json().error.message).toContain('protected');
    const revengeFor = async (who: number) => (await get(who, '/combat')).json<CombatPageDto>().targets.find((target) => target.publicPimpId === pimp(3))!;
    for (const who of [0, 2]) {
      expect(await revengeFor(who)).toMatchObject({ revengeAvailable: true, blockedReason: null });
    }

    // The victim hands nothing over by leaving.
    expect((await post(1, '/alliance/leave')).statusCode).toBe(200);
    expect((await revengeFor(2)).revengeAvailable).toBe(true);
    expect((await revengeFor(1)).revengeAvailable).toBe(true);

    // Someone who joins after the hit did not take it and gets no payback.
    await post(0, '/alliance/invite', { targetPublicPimpId: pimp(5) });
    expect((await post(5, '/alliance/accept', { tag: 'PAY' })).statusCode).toBe(200);
    expect((await revengeFor(5)).revengeAvailable).toBe(false);

    const payback = await attack.raid(2, 3);
    expect(payback.statusCode, payback.body).toBe(200);
    expect(payback.json<BattleReportDto>().retaliation).toBe(true);
  });

  it('keeps leadership honest: hand over before leaving, last member disbands and frees the name', async () => {
    await found(0, 'Heirs', 'HEIR', [1]);
    expect((await post(0, '/alliance/leave')).json().error.code).toBe('LEADER_MUST_HAND_OVER');
    expect((await post(1, '/alliance/kick', { targetPublicPimpId: pimp(0) })).statusCode).toBe(403);
    expect((await post(0, '/alliance/transfer', { targetPublicPimpId: pimp(1) })).statusCode).toBe(200);
    expect((await post(0, '/alliance/leave')).statusCode).toBe(200);
    const last = await post(1, '/alliance/leave');
    expect(last.statusCode).toBe(200);
    expect(last.json<MyAllianceDto>().alliance).toBeNull();
    expect((await app.prisma.alliance.findFirstOrThrow({ where: { roundId, name: 'Heirs' } })).disbandedAt).not.toBeNull();
    expect((await post(2, '/alliance/create', { name: 'Heirs', tag: 'HEIR' })).statusCode).toBe(200);
    const events = (await get(2, '/alliance')).json<MyAllianceDto>().events;
    expect(events.map((row) => row.type)).toEqual(['FOUNDED']);
  });

  it('ranks alliances by combined net worth and puts the tag on rankings and profiles', async () => {
    await found(0, 'Big', 'BIG', [1, 2]);
    await found(3, 'Small', 'SMALL');
    const board = (await get(4, '/alliances')).json();
    expect(board.alliances.map((row: { tag: string; rank: number; memberCount: number }) => [row.tag, row.rank, row.memberCount])).toEqual([['BIG', 1, 3], ['SMALL', 2, 1]]);
    const detail = (await get(4, '/alliances/big')).json().alliance;
    expect(detail).toMatchObject({ tag: 'BIG', rank: 1, memberCount: 3, isYours: false });
    expect(detail.members).toHaveLength(3);
    const rankings = (await get(4, '/rankings')).json();
    expect(rankings.national.find((row: { publicPimpId: number }) => row.publicPimpId === pimp(1)).alliance).toEqual({ name: 'Big', tag: 'BIG' });
    expect((await get(4, `/players/${pimp(2)}`)).json().player.alliance).toEqual({ name: 'Big', tag: 'BIG' });
  });

  it('lets an admin rename and disband with an audit record, and freezes membership once the round closes', async () => {
    await found(0, 'Rude Name', 'RUDE', [1]);
    const alliance = await app.prisma.alliance.findFirstOrThrow({ where: { roundId, tag: 'RUDE' } });
    await app.prisma.account.update({ where: { id: accounts[7]! }, data: { isAdmin: true } });
    const admin = (path: string, payload: object) => app.inject({ method: 'POST', url: `/api/admin${path}`, headers: { cookie: cookies[7]! }, payload });
    expect((await app.inject({ method: 'POST', url: `/api/admin/alliances/${alliance.id}/disband`, headers: { cookie: cookies[0]! }, payload: { reason: 'not an admin' } })).statusCode).toBe(403);
    expect((await admin(`/alliances/${alliance.id}/rename`, { reason: 'Offensive name', name: 'Polite Name', tag: 'NICE' })).statusCode).toBe(200);
    expect((await get(0, '/alliance')).json<MyAllianceDto>().alliance).toMatchObject({ name: 'Polite Name', tag: 'NICE' });
    expect((await admin(`/alliances/${alliance.id}/disband`, { reason: 'Repeated abuse' })).statusCode).toBe(200);
    const [a, b] = await Promise.all([state(0), state(1)]);
    expect([a.allianceId, b.allianceId]).toEqual([null, null]);
    expect(a.allianceCooldownUntil!.getTime()).toBeGreaterThan(Date.now());
    const audit = await app.prisma.adminAuditLog.findMany({ where: { targetType: 'alliance', targetId: alliance.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((row) => row.action)).toEqual(['alliance.rename', 'alliance.disband']);

    await app.prisma.round.update({ where: { id: roundId }, data: { endsAt: new Date(Date.now() - 1_000) } });
    const closed = await post(2, '/alliance/create', { name: 'Too Late', tag: 'LATE' });
    expect(closed.statusCode).toBe(409);
    expect(closed.json().error.code).toBe('ROUND_NOT_PLAYABLE');
  });
});
