import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { classicOgV01, classicOgV02, classicOgV02C, classicOgV02D, classicOgV02E } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { BattleReportDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { RankingService } from '../ranking.service.js';
import { RoundService } from '../round.service.js';
import { ActivityService } from '../activity.service.js';

describe.runIf(process.env.COMBAT_INTEGRATION === '1')('cash raids with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId: string;
  let cityId: string;
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV02;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Combat integration fixture', slug: `combat-test-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      // Cannot supersede a real current round. This app's selection is isolated below.
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    for (let i = 0; i < 3; i++) {
      const name = `raid_${randomUUID().slice(0, 8)}`;
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      expect(response.statusCode).toBe(201);
      accounts.push(response.json().account.id);
      cookies.push(response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[i]!, cityId, displayName: name, publicPimpId: 1000 + i } });
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
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000) } });
    await app.prisma.combatIntel.deleteMany({ where: { OR: [{ observerId: { in: players } }, { targetId: { in: players } }] } });
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.raidBattle.deleteMany({ where: { attackerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: { in: players } } });
    for (let i = 0; i < players.length; i++) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        thugs: i === 1 ? 20 : 40, woundedThugs: 0, pistols: i === 1 ? 20 : 40, beer: 100,
        cashCents: i === 1 ? 4_100_000n : 2_000_000n, cityId,
        createdAt: new Date(Date.now() - 2 * 86_400_000), lastActiveAt: new Date(),
        lastTurnCalculationAt: new Date(), lastAwayBonusAt: null,
        raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null,
        dailyRankSnapshotAt: null,
      };
      await app.prisma.roundPlayer.update({ where: { id: players[i]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const raid = (who = 0, target = 1001, actionId = randomUUID(), attackingThugs = 40) => app.inject({
    method: 'POST', url: '/api/game/combat/raid', headers: { cookie: cookies[who]! },
    payload: { roundId, targetPublicPimpId: target, attackingThugs, actionId },
  });
  const recon = (who = 0, target = 1001, actionId = randomUUID()) => app.inject({
    method: 'POST', url: '/api/game/combat/recon', headers: { cookie: cookies[who]! },
    payload: { roundId, targetPublicPimpId: target, actionId },
  });
  const state = (who: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[who]! } });

  it('authenticates reads and writes and requires a valid, explicit intent', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/game/combat' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/game/combat/raid', payload: {} })).statusCode).toBe(401);
    for (const attackingThugs of [0, -1, 1.5]) expect((await raid(0, 1001, randomUUID(), attackingThugs)).statusCode).toBe(400);
    const missingId = await app.inject({ method: 'POST', url: '/api/game/combat/raid', headers: { cookie: cookies[0]! }, payload: { roundId, targetPublicPimpId: 1001, attackingThugs: 40 } });
    expect(missingId.statusCode).toBe(400);
    expect(await app.prisma.raidBattle.count({ where: { attackerId: players[0] } })).toBe(0);
  });

  it('transfers cash, spends turns once, preserves crew and guns, and writes final ranks for both players', async () => {
    const beforeA = await state(0);
    const beforeD = await state(1);
    const response = await raid();
    expect(response.statusCode, response.body).toBe(200);
    const report = response.json<BattleReportDto>();
    expect(report.won).toBe(true);
    expect(report.cashChangeCents).toBe(180_000);
    expect(report.crackChange).toBe(0);
    const a = await state(0);
    const d = await state(1);
    // Tommy's favour counts the raid for the attacker only.
    expect([a.raidsDone, d.raidsDone]).toEqual([beforeA.raidsDone + 1, beforeD.raidsDone]);
    expect(a.cashCents + d.cashCents).toBe(beforeA.cashCents + beforeD.cashCents);
    expect(a.crack + d.crack).toBe(beforeA.crack + beforeD.crack);
    expect(a.turns).toBe(190);
    expect(d.turns).toBe(200);
    expect([a.thugs, a.woundedThugs, a.pistols, d.thugs, d.woundedThugs, d.pistols]).toEqual([40, 0, 40, 20, 0, 20]);
    expect(d.lastActiveAt).toEqual(beforeD.lastActiveAt);
    for (const p of [a, d]) {
      expect(p.netWorthCents).toBe(NetWorthService.calculate(p, rules));
      const ranks = await RankingService.ranksFor(app.prisma, p);
      expect(p.nationalRank).toBe(ranks.nationalRank);
      expect(p.localRank).toBe(ranks.localRank);
    }
    expect(a.nationalRank).toBeLessThan(d.nationalRank!);
    expect(report.nationalRankBefore).toBeGreaterThan(report.nationalRankAfter);
    const battles = await app.prisma.raidBattle.findMany({ where: { attackerId: a.id } });
    expect(battles).toHaveLength(1);
    expect(battles[0]!.modelVersion).toBe('0.2.0-B.1');
    expect(await app.prisma.combatInjury.count({ where: { roundPlayerId: { in: [a.id, d.id] } } })).toBe(0);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: { in: [a.id, d.id] }, type: { in: ['RAID_ATTACK', 'RAID_DEFENSE'] } } })).toBe(2);
  });

  it('uses 0.2.0-E tuning to transfer weighted cash and crack with repeat-target decay', async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: classicOgV02E.meta.id, rulesetVersion: classicOgV02E.meta.version } });
    await app.prisma.roundPlayer.update({
      where: { id: players[1]! },
      data: { crack: 1_000, netWorthCents: NetWorthService.calculate({ ...(await state(1)), crack: 1_000 }, classicOgV02E) },
    });
    const beforeA = await state(0);
    const beforeD = await state(1);
    const response = await raid();
    expect(response.statusCode, response.body).toBe(200);
    const report = response.json<BattleReportDto>();
    expect(report.won).toBe(true);
    expect(report.modelVersion).toBe('0.2.0-E.2');
    expect(report.baseLootPercent).toBeGreaterThanOrEqual(5);
    expect(report.baseLootPercent).toBeLessThanOrEqual(40);
    expect(report.lootPercent).toBe(report.baseLootPercent);
    expect(report.repeatTargetHits).toBe(0);
    expect(report.repeatLootMultiplierPercent).toBe(100);
    expect(report.cashChangeCents).toBeGreaterThanOrEqual(180_000);
    expect(report.cashChangeCents).toBeLessThanOrEqual(1_000_000);
    expect(report.crackChange).toBeGreaterThanOrEqual(50);
    expect(report.crackChange).toBeLessThanOrEqual(200);
    const a = await state(0);
    const d = await state(1);
    expect(a.cashCents + d.cashCents).toBe(beforeA.cashCents + beforeD.cashCents);
    expect(a.crack + d.crack).toBe(beforeA.crack + beforeD.crack);
    expect(a.netWorthCents).toBe(NetWorthService.calculate(a, classicOgV02E));
    expect(d.netWorthCents).toBe(NetWorthService.calculate(d, classicOgV02E));

    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: [players[0]!, players[1]!] } } });
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { woundedThugs: 0, raidCooldownUntil: null } });
    await app.prisma.roundPlayer.update({ where: { id: players[1]! }, data: { woundedThugs: 0, raidProtectedUntil: null, lastRaidedAt: null, lastActiveAt: new Date() } });
    const repeated = await raid();
    expect(repeated.statusCode, repeated.body).toBe(200);
    const repeatedReport = repeated.json<BattleReportDto>();
    expect(repeatedReport.repeatTargetHits).toBe(1);
    expect(repeatedReport.repeatLootMultiplierPercent).toBe(75);
    expect(repeatedReport.lootPercent).toBe(Math.floor((repeatedReport.baseLootPercent ?? 0) * 0.75));
    expect(repeatedReport.lootPercent).toBeLessThanOrEqual(30);
  });

  it('replays duplicate concurrent raids, even after cooldown or round closure', async () => {
    const id = randomUUID();
    const [a, b] = await Promise.all([raid(0, 1001, id), raid(0, 1001, id)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json()).toEqual(b.json());
    expect((await state(0)).turns).toBe(190);
    await app.prisma.round.update({ where: { id: roundId }, data: { status: 'ENDED' } });
    // Remove the ordinary cache to prove the durable receipt alone prevents replay spending.
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: players[0] } });
    const replay = await raid(0, 1001, id);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(a.json());
  });

  it('binds the same id to both target and squad', async () => {
    const id = randomUUID();
    expect((await raid(0, 1001, id)).statusCode).toBe(200);
    for (const response of [await raid(0, 1002, id), await raid(0, 1001, id, 39)]) {
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('ACTION_ID_REUSED');
    }
  });

  it('rejects action IDs reused across combat and economic actions', async () => {
    const id = randomUUID();
    await raid(0, 1001, id);
    const payout = await app.inject({ method: 'PUT', url: '/api/game/payout', headers: { cookie: cookies[0]! }, payload: { percent: 55, actionId: id } });
    expect(payout.statusCode).toBe(409);
    const otherId = randomUUID();
    await app.prisma.processedAction.create({ data: { roundPlayerId: players[2]!, actionId: otherId, action: 'PAYOUT_CHANGE', result: {}, expiresAt: new Date(0) } });
    expect((await raid(2, 1001, otherId)).json().error.code).toBe('ACTION_ID_REUSED');
  });

  it('serializes two different attackers; the second cannot bypass new target protection', async () => {
    const results = await Promise.all([raid(), raid(2)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await state(0)).turns + (await state(2)).turns).toBe(390);
    expect((await state(1)).cashCents).toBe(3_920_000n);
  });

  it('serializes reciprocal raids without deadlock or an unprotected second attack', async () => {
    const results = await Promise.all([raid(0, 1002), raid(2, 1000)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await state(0)).turns + (await state(2)).turns).toBe(390);
  });

  it('serializes concurrent attacks by the same player against different targets', async () => {
    const results = await Promise.all([raid(0, 1001), raid(0, 1002)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await state(0)).turns).toBe(190);
  });

  it('rolls back both players, protection, activities and receipt after a later write fails', async () => {
    const before = await Promise.all([state(0), state(1)]);
    const original = ActivityService.log;
    const fault = vi.spyOn(ActivityService, 'log').mockImplementation((db, id, type, payload) => {
      if (type === 'RAID_DEFENSE') throw new Error('Injected second-player activity failure');
      return original(db, id, type, payload);
    });
    try { expect((await raid()).statusCode).toBe(500); } finally { fault.mockRestore(); }
    expect(await Promise.all([state(0), state(1)])).toEqual(before);
    expect(await app.prisma.raidBattle.count({ where: { attackerId: players[0] } })).toBe(0);
    expect(await app.prisma.processedAction.count({ where: { roundPlayerId: players[0] } })).toBe(0);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: { in: players } } })).toBe(0);
  });

  it('requires newcomers and protected attackers to wait, even for a fresh target', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players[0] }, data: { createdAt: new Date() } });
    expect((await raid()).statusCode).toBe(409);
    await app.prisma.roundPlayer.update({ where: { id: players[0] }, data: { createdAt: new Date(0), raidProtectedUntil: new Date(Date.now() + 60_000) } });
    expect((await raid()).statusCode).toBe(409);
  });

  it('protects newcomers, players in another city, weak crews, and the cash floor', async () => {
    for (const data of [{ createdAt: new Date() }, { thugs: 1 }, { cashCents: 500_000n }]) {
      const before = await state(1);
      await app.prisma.roundPlayer.update({ where: { id: players[1] }, data });
      expect((await raid()).statusCode).toBe(409);
      await app.prisma.roundPlayer.update({ where: { id: players[1] }, data: { createdAt: before.createdAt, thugs: before.thugs, cashCents: before.cashCents } });
    }
    const city = await app.prisma.city.findFirstOrThrow({ where: { id: { not: cityId } } });
    await app.prisma.roundPlayer.update({ where: { id: players[1] }, data: { cityId: city.id } });
    expect((await raid()).statusCode).toBe(409);
    expect((await state(0)).turns).toBe(200);
  });

  it('does not let sending one thug bypass the full-crew strength restriction', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players[1] }, data: { thugs: 5 } });
    expect((await raid(0, 1001, randomUUID(), 1)).statusCode).toBe(409);
  });

  it('protects an offline defender after the timer and ignores background reads', async () => {
    await raid();
    await app.prisma.roundPlayer.update({ where: { id: players[1] }, data: { raidProtectedUntil: new Date(0) } });
    const before = await state(1);
    await app.inject({ method: 'GET', url: '/api/game/combat?background=1', headers: { cookie: cookies[1]! } });
    expect((await state(1)).lastActiveAt).toEqual(before.lastActiveAt);
    expect((await raid(2)).statusCode).toBe(409);
    await app.inject({ method: 'GET', url: '/api/game/combat', headers: { cookie: cookies[1]! } });
    expect((await raid(2)).statusCode).toBe(200);
  });

  it('settles away turns once without marking the offline defender active', async () => {
    const inactive = new Date(Date.now() - 7 * 3_600_000);
    await app.prisma.roundPlayer.update({ where: { id: players[1] }, data: { turns: 0, lastActiveAt: inactive, lastTurnCalculationAt: inactive } });
    expect((await raid()).statusCode).toBe(200);
    const defender = await state(1);
    expect(defender.lastActiveAt).toEqual(inactive);
    expect(defender.turns).toBeGreaterThan(0);
    expect(defender.lastAwayBonusAt).not.toBeNull();
    const background = await app.inject({ method: 'GET', url: '/api/game/me?background=1', headers: { cookie: cookies[1]! } });
    expect(background.statusCode).toBe(200);
    expect((await state(1)).turns).toBe(defender.turns);
  });

  it('spends turns on defeat without applying wounds or minting consolation loot', async () => {
    const beforeA = await state(0);
    const beforeD = await state(1);
    const response = await raid(0, 1001, randomUUID(), 1);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ won: false, cashChangeCents: 0, crackChange: 0, turnsSpent: 10 });
    expect((await state(0)).cashCents).toBe(beforeA.cashCents);
    expect((await state(1)).cashCents).toBe(beforeD.cashCents);
    expect((await state(0)).crack).toBe(beforeA.crack);
    expect((await state(1)).crack).toBe(beforeD.crack);
    expect((await state(1)).raidProtectedUntil).not.toBeNull();
    expect((await state(0)).thugs).toBe(40);
    expect((await state(0)).woundedThugs).toBe(0);
  });

  it('keeps reports private and returns each participant’s own receipt', async () => {
    const report = (await raid()).json<BattleReportDto>();
    const list = async (who: number) => (await app.inject({ method: 'GET', url: `/api/game/combat/reports?roundId=${roundId}`, headers: { cookie: cookies[who]! } })).json();
    expect((await list(0)).reports).toEqual([report]);
    expect((await list(1)).reports[0]).toMatchObject({ id: report.id, role: 'DEFENDER', won: false, cashChangeCents: -180_000, turnsSpent: 0 });
    expect((await list(2)).reports).toEqual([]);
    const forbidden = await app.inject({ method: 'GET', url: `/api/game/combat/reports?roundId=${roundId}&before=${report.id}`, headers: { cookie: cookies[2]! } });
    expect(forbidden.statusCode).toBe(404);
    expect(report).not.toHaveProperty('calculation');
    expect(report).not.toHaveProperty('opponentEquipment');
  });

  it('paginates reports with identical timestamps without omissions', async () => {
    await raid();
    const source = await app.prisma.raidBattle.findFirstOrThrow({ where: { attackerId: players[0] } });
    await app.prisma.raidBattle.createMany({ data: Array.from({ length: 26 }, () => {
      const id = randomUUID();
      return { ...source, id, actionId: randomUUID(), calculation: source.calculation as Prisma.InputJsonValue, attackerReport: { ...(source.attackerReport as object), id }, defenderReport: { ...(source.defenderReport as object), id } };
    }) });
    const get = (before = '') => app.inject({ method: 'GET', url: `/api/game/combat/reports?roundId=${roundId}${before ? `&before=${before}` : ''}`, headers: { cookie: cookies[0]! } });
    const first = (await get()).json();
    const second = (await get(first.nextBefore)).json();
    expect(first.reports).toHaveLength(25);
    expect(second.reports).toHaveLength(2);
    expect(new Set([...first.reports, ...second.reports].map((r: BattleReportDto) => r.id)).size).toBe(27);
  });


  it('persists wounds in 0.2.0-C, keeps total crew owned, and naturally recovers them when due', async () => {
    const rulesC = classicOgV02C;
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rulesC.meta.id, rulesetVersion: rulesC.meta.version } });
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { thugs: 100, woundedThugs: 0, pistols: 100, cashCents: 2_000_000n, raidCooldownUntil: null, createdAt: new Date(0), netWorthCents: 0n } });
    await app.prisma.roundPlayer.update({ where: { id: players[1]! }, data: { thugs: 50, woundedThugs: 0, pistols: 50, cashCents: 4_100_000n, raidProtectedUntil: null, lastRaidedAt: null, createdAt: new Date(0), netWorthCents: 0n } });
    for (const i of [0, 1]) {
      const row = await state(i);
      await app.prisma.roundPlayer.update({ where: { id: row.id }, data: { netWorthCents: NetWorthService.calculate(row, rulesC) } });
    }

    const response = await raid(0, 1001, randomUUID(), 100);
    expect(response.statusCode, response.body).toBe(200);
    const report = response.json<BattleReportDto>();
    expect(report.modelVersion).toBe('0.2.0-C.1');
    expect(report).toMatchObject({ yourWounds: 2, opponentWounds: 4, woundedThugsAfter: 2 });

    const [attacker, defender] = await Promise.all([state(0), state(1)]);
    expect([attacker.thugs, attacker.woundedThugs, defender.thugs, defender.woundedThugs]).toEqual([100, 2, 50, 4]);
    expect(await app.prisma.combatInjury.count({ where: { roundPlayerId: { in: [attacker.id, defender.id] } } })).toBe(2);

    const page = await app.inject({ method: 'GET', url: '/api/game/combat', headers: { cookie: cookies[0]! } });
    expect(page.statusCode).toBe(200);
    expect(page.json().recovery).toMatchObject({ fitThugs: 98, woundedThugs: 2, medicinePerThug: 1, maxTreatableThugs: 0 });

    await app.prisma.combatInjury.updateMany({ where: { roundPlayerId: { in: [attacker.id, defender.id] } }, data: { recoverAt: new Date(0) } });
    const settled = await app.inject({ method: 'GET', url: '/api/game/me?background=1', headers: { cookie: cookies[0]! } });
    expect(settled.statusCode).toBe(200);
    expect(settled.json().player.resources).toMatchObject({ thugs: 100, fitThugs: 100, woundedThugs: 0 });
    expect((await state(0)).woundedThugs).toBe(0);
  });

  it('limits raids and cooking to fit thugs in 0.2.0-C', async () => {
    const rulesC = classicOgV02C;
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rulesC.meta.id, rulesetVersion: rulesC.meta.version } });
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { thugs: 10, woundedThugs: 9, pistols: 10, medicine: 0, createdAt: new Date(0), raidCooldownUntil: null } });
    await app.prisma.combatInjury.create({ data: { roundPlayerId: players[0]!, thugs: 9, recoverAt: new Date(Date.now() + 3_600_000) } });

    const oversized = await raid(0, 1001, randomUUID(), 2);
    expect(oversized.statusCode).toBe(400);
    expect(oversized.json().error.code).toBe('INVALID_SQUAD');

    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { woundedThugs: 10 } });
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: players[0]! } });
    await app.prisma.combatInjury.create({ data: { roundPlayerId: players[0]!, thugs: 10, recoverAt: new Date(Date.now() + 3_600_000) } });
    const produce = await app.inject({ method: 'POST', url: '/api/game/produce-crack', headers: { cookie: cookies[0]! }, payload: { turns: 1, actionId: randomUUID() } });
    expect(produce.statusCode).toBe(400);
    expect(produce.json().error.code).toBe('NO_THUGS');
  });

  it('treats wounded thugs with medicine once and reduces pending recovery batches', async () => {
    const rulesC = classicOgV02C;
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rulesC.meta.id, rulesetVersion: rulesC.meta.version } });
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: { thugs: 10, woundedThugs: 5, medicine: 5, createdAt: new Date(0), netWorthCents: 0n } });
    const recoverAt = new Date(Date.now() + 3_600_000);
    await app.prisma.combatInjury.create({ data: { roundPlayerId: players[0]!, thugs: 5, recoverAt } });

    const actionId = randomUUID();
    const treat = () => app.inject({ method: 'POST', url: '/api/game/combat/treat', headers: { cookie: cookies[0]! }, payload: { roundId, thugs: 3, actionId } });
    const first = await treat();
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({ treatedThugs: 3, medicineUsed: 3, woundedThugs: 2 });
    expect(first.json().nextRecoveryAt).not.toBeNull();

    const after = await state(0);
    expect([after.woundedThugs, after.medicine]).toEqual([2, 2]);
    expect((await app.prisma.combatInjury.findMany({ where: { roundPlayerId: players[0]! } })).map((row) => row.thugs)).toEqual([2]);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: players[0]!, type: 'COMBAT_TREATMENT' } })).toBe(1);

    const replay = await treat();
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect((await state(0)).medicine).toBe(2);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: players[0]!, type: 'COMBAT_TREATMENT' } })).toBe(1);
  });

  it('spends turns on recon, stores target intel, and replays once in 0.2.0-D', async () => {
    const rulesD = classicOgV02D;
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rulesD.meta.id, rulesetVersion: rulesD.meta.version } });
    for (const i of [0, 1]) {
      const row = await state(i);
      await app.prisma.roundPlayer.update({ where: { id: row.id }, data: { netWorthCents: NetWorthService.calculate(row, rulesD) } });
    }

    const actionId = randomUUID();
    const response = await recon(0, 1001, actionId);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      turnsSpent: 2,
      turnsAfter: 198,
      intel: {
        targetPublicPimpId: 1001,
        fitThugs: 20,
        woundedThugs: 0,
        weapons: { PISTOL: 20, SHOTGUN: 0, TEK9: 0, AK47: 0 },
        estimatedMaxLootCents: 180_000,
      },
    });
    expect((await state(0)).turns).toBe(198);

    const page = await app.inject({ method: 'GET', url: '/api/game/combat', headers: { cookie: cookies[0]! } });
    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({ rules: { reconTurnCost: 2, intelExpiresMinutes: 60, retaliationHours: 24 } });
    expect(page.json().targets.find((target: { publicPimpId: number }) => target.publicPimpId === 1001)).toMatchObject({
      revengeAvailable: false,
      intel: { fitThugs: 20, estimatedMaxLootCents: 180_000 },
    });

    const replay = await recon(0, 1001, actionId);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(response.json());
    expect((await state(0)).turns).toBe(198);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: players[0]!, type: 'COMBAT_RECON' } })).toBe(1);

    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rules.meta.id, rulesetVersion: rules.meta.version } });
    const blocked = await recon(2, 1001);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('STRATEGY_DISABLED');
  });

  it('opens a 0.2.0-D revenge window through protection and minimum strength', async () => {
    const rulesD = classicOgV02D;
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rulesD.meta.id, rulesetVersion: rulesD.meta.version } });
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: {
      thugs: 1, woundedThugs: 0, pistols: 1, cashCents: 4_100_000n, createdAt: new Date(0),
      raidProtectedUntil: new Date(Date.now() + 3_600_000), raidCooldownUntil: null, lastRaidedAt: null,
    } });
    await app.prisma.roundPlayer.update({ where: { id: players[1]! }, data: {
      thugs: 40, woundedThugs: 0, pistols: 40, cashCents: 2_000_000n, createdAt: new Date(0),
      raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null,
    } });
    for (const i of [0, 1]) {
      const row = await state(i);
      await app.prisma.roundPlayer.update({ where: { id: row.id }, data: { netWorthCents: NetWorthService.calculate(row, rulesD) } });
    }
    await app.prisma.raidBattle.create({ data: {
      attackerId: players[0]!, defenderId: players[1]!, actionId: randomUUID(), attackingThugs: 1, modelVersion: rulesD.combat!.version,
      calculation: { seeded: 'revenge fixture' }, attackerReport: { fixture: true }, defenderReport: { fixture: true },
      createdAt: new Date(Date.now() - 60_000),
    } });

    const page = await app.inject({ method: 'GET', url: '/api/game/combat', headers: { cookie: cookies[1]! } });
    expect(page.statusCode).toBe(200);
    expect(page.json().targets.find((target: { publicPimpId: number }) => target.publicPimpId === 1000)).toMatchObject({
      revengeAvailable: true,
      blockedReason: null,
    });

    const response = await raid(1, 1000, randomUUID(), 40);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<BattleReportDto>()).toMatchObject({ retaliation: true, turnsSpent: 10 });
    expect((await state(1)).turns).toBe(190);
  });

  it('closes stale 0.2.0-D revenge windows before bypassing raid blocks', async () => {
    const rulesD = classicOgV02D;
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rulesD.meta.id, rulesetVersion: rulesD.meta.version } });
    await app.prisma.roundPlayer.update({ where: { id: players[0]! }, data: {
      thugs: 1, woundedThugs: 0, pistols: 1, cashCents: 4_100_000n, createdAt: new Date(0),
      raidProtectedUntil: new Date(Date.now() + 3_600_000), raidCooldownUntil: null, lastRaidedAt: null,
    } });
    await app.prisma.roundPlayer.update({ where: { id: players[1]! }, data: {
      thugs: 40, woundedThugs: 0, pistols: 40, cashCents: 2_000_000n, createdAt: new Date(0),
      raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null,
    } });
    await app.prisma.raidBattle.create({ data: {
      attackerId: players[0]!, defenderId: players[1]!, actionId: randomUUID(), attackingThugs: 1, modelVersion: rulesD.combat!.version,
      calculation: { seeded: 'stale revenge fixture' }, attackerReport: { fixture: true }, defenderReport: { fixture: true },
      createdAt: new Date(Date.now() - 25 * 3_600_000),
    } });

    const response = await raid(1, 1000, randomUUID(), 40);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('RAID_BLOCKED');
    expect((await state(1)).turns).toBe(200);
  });

  it('keeps classic rounds combat-free and rejects closed or future rounds', async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version } });
    expect((await raid()).json().error.code).toBe('COMBAT_DISABLED');
    const page = await app.inject({ method: 'GET', url: '/api/game/combat', headers: { cookie: cookies[0]! } });
    expect(page.json().enabled).toBe(false);
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, startsAt: new Date(Date.now() + 60_000) } });
    expect((await raid()).json().error.code).toBe('ROUND_NOT_PLAYABLE');
    await app.prisma.round.update({ where: { id: roundId }, data: { status: 'ENDED' } });
    expect((await raid()).json().error.code).toBe('ROUND_NOT_PLAYABLE');
  });

  it('rejects self-attacks, nonexistent targets, foreign rounds, insufficient turns and oversized squads', async () => {
    expect((await raid(0, 1000)).statusCode).toBe(400);
    expect((await raid(0, 99999)).statusCode).toBe(404);
    const foreign = await app.inject({ method: 'POST', url: '/api/game/combat/raid', headers: { cookie: cookies[0]! }, payload: { roundId: randomUUID(), targetPublicPimpId: 1001, attackingThugs: 1, actionId: randomUUID() } });
    expect(foreign.statusCode).toBe(404);
    expect((await raid(0, 1001, randomUUID(), 41)).statusCode).toBe(400);
    await app.prisma.roundPlayer.update({ where: { id: players[0] }, data: { turns: 9 } });
    expect((await raid()).statusCode).toBe(409);
    expect((await state(0)).turns).toBe(9);
  });

  it('returns only public target information and server-supplied rules', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/game/combat', headers: { cookie: cookies[0]! } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ enabled: true, rules: { turnCost: 10, squadCap: 100 } });
    expect(response.json().targets).toHaveLength(2);
    expect(Object.keys(response.json().targets[0]).sort()).toEqual(['publicPimpId', 'displayName', 'netWorthCents', 'strength', 'blockedReason', 'protectedUntil'].sort());
  });
});
