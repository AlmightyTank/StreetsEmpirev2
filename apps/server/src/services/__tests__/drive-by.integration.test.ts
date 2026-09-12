import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV02E } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { BattleReportDto, CombatPageDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Drive-bys through the real HTTP layer. Opt in with COMBAT_INTEGRATION=1.
 * Uses its own round, so nothing outside this file's players is touched.
 */
describe.runIf(process.env.COMBAT_INTEGRATION === '1')('drive-bys with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId: string;
  let cityId: string;
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV02E;
  const driveByRules = rules.combat.driveBy;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Drive-by integration fixture', slug: `drive-by-test-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    for (let i = 0; i < 2; i++) {
      const name = `dby_${randomUUID().slice(0, 8)}`;
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      expect(response.statusCode).toBe(201);
      accounts.push(response.json().account.id);
      cookies.push(response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[i]!, cityId, displayName: name, publicPimpId: 2000 + i,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.raidBattle.deleteMany({ where: { attackerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerReputation.updateMany({ where: { roundPlayerId: { in: players } }, data: { points: 0, questDoneAt: null, creditedOn: null } });
    // Twelve pistols and two cars against ten pistols: a guaranteed hit, and
    // a target strong enough to pass the minimum-strength rule.
    for (let i = 0; i < players.length; i++) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        thugs: i === 0 ? 12 : 10, pistols: i === 0 ? 12 : 10, woundedThugs: 0, beer: 100,
        whores: i === 0 ? 10 : 100, lowRiders: i === 0 ? 2 : 0, driveBysDone: 0,
        cashCents: 4_000_000n, cityId,
        createdAt: new Date(Date.now() - 2 * 86_400_000), lastActiveAt: new Date(),
        lastTurnCalculationAt: new Date(), lastAwayBonusAt: null,
        raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null,
        driveByProtectedUntil: null, driveByCooldownUntil: null, lastDrivenByAt: null,
        dailyRankSnapshotAt: null,
      };
      await app.prisma.roundPlayer.update({ where: { id: players[i]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const post = (path: string, payload: object, who = 0) => app.inject({
    method: 'POST', url: `/api/game${path}`, headers: { cookie: cookies[who]! }, payload,
  });
  const driveBy = (attackingThugs = 12, actionId = randomUUID()) =>
    post('/combat/drive-by', { roundId, targetPublicPimpId: 2001, attackingThugs, actionId });
  const raid = (attackingThugs = 12, actionId = randomUUID()) =>
    post('/combat/raid', { roundId, targetPublicPimpId: 2001, attackingThugs, actionId });
  const state = (who: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[who]! } });
  const page = async () => (await app.inject({ method: 'GET', url: '/api/game/combat', headers: { cookie: cookies[0]! } })).json<CombatPageDto>();

  it('shows drive-by seats and rules on the raid page', async () => {
    const body = await page();
    expect(body.driveBy).toMatchObject({ lowRiders: 2, maxShooters: 12, blockedReason: null });
    expect(body.driveBy!.rules.thugsPerLowRider).toBe(driveByRules.thugsPerLowRider);
    expect(body.targets.find((t) => t.publicPimpId === 2001)!.driveByBlockedReason).toBeNull();
  });

  it('will not put more shooters on the road than there are seats, or any without a car', async () => {
    expect((await driveBy(13)).statusCode).toBe(400);
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { lowRiders: 0 } });
    const response = await driveBy(6);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('DRIVE_BY_BLOCKED');
    expect(await app.prisma.raidBattle.count({ where: { attackerId: players[0] } })).toBe(0);
  });

  it('wounds their crew, kills whores, takes nothing, and leaves them open to a raid', async () => {
    const beforeA = await state(0);
    const beforeD = await state(1);
    const response = await driveBy();
    expect(response.statusCode, response.body).toBe(200);
    const report = response.json<BattleReportDto>();
    expect(report).toMatchObject({ kind: 'DRIVE_BY', role: 'ATTACKER', won: true, cashChangeCents: 0 });

    const a = await state(0);
    const d = await state(1);
    // Nothing changes hands.
    expect([a.cashCents, d.cashCents, a.crack, d.crack]).toEqual([beforeA.cashCents, beforeD.cashCents, beforeA.crack, beforeD.crack]);
    // The damage lands where the report says it did.
    expect(d.whores).toBe(beforeD.whores - report.driveBy!.whoresKilled);
    expect(report.driveBy!.whoresKilled).toBeGreaterThan(0);
    expect(d.woundedThugs).toBe(report.opponentWounds);
    expect(d.thugs).toBe(beforeD.thugs);
    expect(a.woundedThugs).toBe(report.yourWounds);
    expect(a.lowRiders).toBe(2 - report.driveBy!.lowRidersLost!);
    expect(a.turns).toBe(beforeA.turns - driveByRules.turnCost);
    expect(a.driveBysDone).toBe(1);
    for (const p of [a, d]) expect(p.netWorthCents).toBe(NetWorthService.calculate(p, rules));

    // Its own clocks: the block is shielded from drive-bys, not from raids,
    // and the shooter's raid cooldown is untouched.
    expect(d.driveByProtectedUntil).not.toBeNull();
    expect(d.raidProtectedUntil).toBeNull();
    expect(a.raidCooldownUntil).toBeNull();
    const target = (await page()).targets.find((t) => t.publicPimpId === 2001)!;
    expect(target.driveByBlockedReason).not.toBeNull();
    expect(target.blockedReason).toBeNull();
    // One thug, so a shooter wounded in the drive-by cannot make the squad invalid.
    const followUp = await raid(1);
    expect(followUp.statusCode, followUp.body).toBe(200);

    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: players[1], type: 'DRIVE_BY_DEFENSE' } })).toBe(1);
    const defenderReport = (await app.prisma.raidBattle.findFirstOrThrow({ where: { kind: 'DRIVE_BY', attackerId: players[0] } })).defenderReport as unknown as BattleReportDto;
    expect(defenderReport.driveBy!.whoresAfter).toBe(d.whores);
  });

  it('answers a retry with the same report, and never runs twice', async () => {
    const actionId = randomUUID();
    const [first, second] = await Promise.all([driveBy(12, actionId), driveBy(12, actionId)]);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(first.json()).toEqual(second.json());
    expect(await app.prisma.raidBattle.count({ where: { attackerId: players[0], kind: 'DRIVE_BY' } })).toBe(1);

    // A drive-by id cannot be replayed as a raid.
    const reused = await raid(12, actionId);
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error.code).toBe('ACTION_ID_REUSED');
  });

  it('keeps the cars cooling off and the block quiet afterwards', async () => {
    expect((await driveBy()).statusCode).toBe(200);
    const again = await driveBy(6);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('DRIVE_BY_BLOCKED');
  });

  it('is what Charlie wants now, and he lets you keep the car', async () => {
    const favour = () => post('/reputation/quest', { trader: 'CHARLIE', actionId: randomUUID() });
    expect((await favour()).json().error.code).toBe('QUEST_INCOMPLETE');

    expect((await driveBy()).statusCode).toBe(200);
    const lowRiders = (await state(0)).lowRiders;
    const done = await favour();
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json().result).toMatchObject({ trader: 'CHARLIE', lowRidersHandedOver: 0, reputationGained: rules.reputation.questPoints });
    expect((await state(0)).lowRiders).toBe(lowRiders);
  });
});
