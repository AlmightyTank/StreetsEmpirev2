import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

type Who = { id: string; username: string; cookie: string };

/**
 * Test rounds sit in REGISTRATION, which no parallel current-round lookup can
 * close as superseded. Run the ADMIN_INTEGRATION suites one file at a time anyway.
 */
describe.runIf(process.env.ADMIN_INTEGRATION === '1')('Admin corrections and signals API with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName: string;
  let cityId: string;
  let admin: Who;
  let attackerAccount: Who;
  let defenderAccount: Who;
  const accountIds: string[] = [];
  const roundIds: string[] = [];

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBe(201);
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === cookieName);
    if (!session) throw new Error('Registering did not set a session cookie.');
    return { id: accountId, username, cookie: `${session.name}=${session.value}` };
  }

  const headers = (who?: Who) => (who ? { cookie: who.cookie } : {});
  const get = (url: string, who: Who = admin) => app.inject({ url, headers: headers(who) });
  const post = (url: string, payload?: object, who: Who = admin) =>
    app.inject({ method: 'POST', url, headers: headers(who), ...(payload ? { payload } : {}) });

  async function liveRound(status: 'REGISTRATION' | 'ENDED' = 'REGISTRATION') {
    const round = await app.prisma.round.create({
      data: {
        slug: `admin-fix-${randomUUID()}`,
        name: `Admin Fix ${randomUUID().slice(0, 6)}`,
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        status,
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    return round;
  }

  async function player(roundId: string, who: Who, index: number, data: Record<string, unknown> = {}) {
    const now = new Date();
    return app.prisma.roundPlayer.create({
      data: {
        ...classicOgV01.round.startingPlayer,
        roundId,
        accountId: who.id,
        cityId,
        publicPimpId: 9601 + index,
        displayName: who.username,
        lastTurnCalculationAt: now,
        lastActiveAt: now,
        ...data,
      },
    });
  }

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    admin = await register('adm');
    attackerAccount = await register('atk');
    defenderAccount = await register('dfn');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    cityId = (await app.prisma.city.create({ data: { slug: `admin-fix-${randomUUID()}`, name: 'Admin Fix City', isEnabled: true } })).id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.adminAuditLog.deleteMany({ where: { actorAccountId: { in: accountIds } } });
    if (roundIds.length) await app.prisma.round.deleteMany({ where: { id: { in: roundIds } } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    if (cityId) await app.prisma.city.deleteMany({ where: { id: cityId } });
    await app.close();
  });

  it('refuses the correction and signal routes to guests and non-admins', async () => {
    const requests = [
      { method: 'POST' as const, url: '/api/admin/players/some-player/grant', payload: { reason: 'Never runs here', turns: 5 } },
      { method: 'POST' as const, url: '/api/admin/battles/some-battle/void', payload: { reason: 'Never runs here' } },
      { method: 'GET' as const, url: '/api/admin/signals' },
    ];
    for (const request of requests) {
      expect((await app.inject({ ...request, headers: headers() })).statusCode, `${request.method} ${request.url} as a guest`).toBe(401);
      expect((await app.inject({ ...request, headers: headers(attackerAccount) })).statusCode, `${request.method} ${request.url} as a player`).toBe(403);
    }
  });

  it('voids a raid: loot and turns go back, healing wounds are taken back, and it cannot run twice', async () => {
    const round = await liveRound();
    const attacker = await player(round.id, attackerAccount, 0, { cashCents: 1_050_000n, crack: 60, turns: 40, raidsDone: 1 });
    const defender = await player(round.id, defenderAccount, 1, { cashCents: 950_000n, crack: 40, thugs: 12, woundedThugs: 3 });
    const battle = await app.prisma.raidBattle.create({
      data: {
        attackerId: attacker.id,
        defenderId: defender.id,
        actionId: randomUUID(),
        attackingThugs: 5,
        modelVersion: 'test',
        calculation: {},
        attackerReport: { kind: 'RAID', role: 'ATTACKER', won: true, cashChangeCents: 50_000, crackChange: 10, turnsSpent: 5, opponent: { publicPimpId: defender.publicPimpId, displayName: defender.displayName } },
        defenderReport: { kind: 'RAID', role: 'DEFENDER', won: false, cashChangeCents: -50_000, crackChange: -10, turnsSpent: 0, opponent: { publicPimpId: attacker.publicPimpId, displayName: attacker.displayName } },
      },
    });
    await app.prisma.combatInjury.create({ data: { roundPlayerId: defender.id, battleId: battle.id, thugs: 3, recoverAt: new Date(Date.now() + 3_600_000) } });

    expect((await post(`/api/admin/battles/${battle.id}/void`, {})).statusCode).toBe(400);
    const voided = await post(`/api/admin/battles/${battle.id}/void`, { reason: 'Loot bug in the raid model' });
    expect(voided.statusCode, voided.body).toBe(200);
    expect(voided.json()).toMatchObject({
      battleId: battle.id,
      kind: 'RAID',
      attacker: { changes: { cashCents: -50_000, crack: -10, turns: 5 }, shortfall: {} },
      defender: { changes: { cashCents: 50_000, crack: 10, woundedThugs: -3 }, shortfall: {} },
    });

    const [afterAttacker, afterDefender, row] = await Promise.all([
      app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: attacker.id } }),
      app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: defender.id } }),
      app.prisma.raidBattle.findUniqueOrThrow({ where: { id: battle.id } }),
    ]);
    expect(afterAttacker).toMatchObject({ cashCents: 1_000_000n, crack: 50, turns: 45, raidsDone: 0 });
    expect(afterDefender).toMatchObject({ cashCents: 1_000_000n, crack: 50, woundedThugs: 0 });
    expect(row).toMatchObject({ voidedByUsername: admin.username, voidReason: 'Loot bug in the raid model' });
    expect(row.voidedAt).not.toBeNull();
    expect(await app.prisma.combatInjury.count({ where: { battleId: battle.id } })).toBe(0);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: { in: [attacker.id, defender.id] }, type: 'BATTLE_VOIDED' } })).toBe(2);
    expect(await app.prisma.adminAuditLog.count({ where: { targetId: battle.id, action: 'battle.void' } })).toBe(1);

    const reports = await get(`/api/admin/players/${defender.id}/battles`);
    expect(reports.json().reports[0].voided).toMatchObject({ reason: 'Loot bug in the raid model', byUsername: admin.username });

    const again = await post(`/api/admin/battles/${battle.id}/void`, { reason: 'Loot bug in the raid model' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('BATTLE_ALREADY_VOIDED');
  });

  it('only takes back what the attacker still has and records the shortfall', async () => {
    const round = await liveRound();
    const attacker = await player(round.id, attackerAccount, 0, { cashCents: 20_000n, lowRiders: 0 });
    const defender = await player(round.id, defenderAccount, 1, { cashCents: 100_000n, lowRiders: 1 });
    const battle = await app.prisma.raidBattle.create({
      data: {
        attackerId: attacker.id,
        defenderId: defender.id,
        actionId: randomUUID(),
        attackingThugs: 2,
        modelVersion: 'test',
        calculation: {},
        attackerReport: { kind: 'RAID', won: true, cashChangeCents: 80_000, crackChange: 0, turnsSpent: 0, opponent: { publicPimpId: 1, displayName: 'x' } },
        defenderReport: { kind: 'RAID', won: false, cashChangeCents: -80_000, opponent: { publicPimpId: 1, displayName: 'y' } },
      },
    });
    const voided = await post(`/api/admin/battles/${battle.id}/void`, { reason: 'Exploit confirmed by logs' });
    expect(voided.statusCode, voided.body).toBe(200);
    expect(voided.json().attacker).toMatchObject({ changes: { cashCents: -20_000 }, shortfall: { cashCents: 60_000 } });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: attacker.id } })).cashCents).toBe(0n);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: defender.id } })).cashCents).toBe(120_000n);
  });

  it('refuses corrections in finished rounds and to your own player', async () => {
    const ended = await liveRound('ENDED');
    const endedPlayer = await player(ended.id, attackerAccount, 0);
    const frozen = await post(`/api/admin/players/${endedPlayer.id}/grant`, { reason: 'Downtime makeup', turns: 5 });
    expect(frozen.statusCode, frozen.body).toBe(409);
    expect(frozen.json().error.code).toBe('ROUND_FINISHED');

    const round = await liveRound();
    const own = await player(round.id, admin, 0);
    const self = await post(`/api/admin/players/${own.id}/grant`, { reason: 'Helping myself out', cashCents: 1_000 });
    expect(self.statusCode, self.body).toBe(409);
    expect(self.json().error.code).toBe('ADMIN_SELF_ACTION');
  });

  it('grants capped compensation, logs it for the player and audits it', async () => {
    const round = await liveRound();
    const target = await player(round.id, defenderAccount, 0, { turns: classicOgV01.turns.cap - 3, cashCents: 500_000n, whores: 5, shotgunUnlocked: false });

    expect((await post(`/api/admin/players/${target.id}/grant`, { reason: 'Nothing chosen here' })).statusCode).toBe(400);
    expect((await post(`/api/admin/players/${target.id}/grant`, { reason: 'Too generous a grant', cashCents: 10_000_001 })).statusCode).toBe(400);
    const locked = await post(`/api/admin/players/${target.id}/grant`, { reason: 'Shotguns for everyone', shotguns: 2 });
    expect(locked.statusCode, locked.body).toBe(400);
    expect(locked.json().error.code).toBe('WEAPON_LOCKED');

    const granted = await post(`/api/admin/players/${target.id}/grant`, { reason: 'Two hours of downtime', turns: 10, cashCents: 100_000, whores: 5 });
    expect(granted.statusCode, granted.body).toBe(200);
    expect(granted.json()).toMatchObject({ turns: classicOgV01.turns.cap, cashCents: 600_000, crew: { whores: 10 }, turnCap: classicOgV01.turns.cap, live: true });

    const activity = await app.prisma.playerActivity.findFirstOrThrow({ where: { roundPlayerId: target.id, type: 'ADMIN_GRANT' } });
    expect(activity.payload).toMatchObject({ reason: 'Two hours of downtime', granted: { turns: 3, cashCents: 100_000, whores: 5 }, turnsRequested: 10 });
    const audit = await app.prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: target.id, action: 'player.grant' } });
    expect(audit).toMatchObject({ reason: 'Two hours of downtime', actorAccountId: admin.id });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: target.id } })).netWorthCents).toBeGreaterThan(target.netWorthCents);
  });

  it('shows multi-account matches without revealing the network address', async () => {
    const expiresAt = new Date(Date.now() + 86_400_000);
    const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    await app.prisma.session.createMany({
      data: [attackerAccount, defenderAccount].map((who) => ({ accountId: who.id, tokenHash: randomUUID(), expiresAt, ip, userAgent: agent })),
    });
    const response = await get('/api/admin/signals');
    expect(response.statusCode, response.body).toBe(200);
    const cluster = (response.json().clusters as Array<{ signals: string[]; accounts: Array<{ id: string }> }>)
      .find((row) => row.accounts.some((account) => account.id === attackerAccount.id));
    expect(cluster?.accounts.map((account) => account.id)).toEqual(expect.arrayContaining([attackerAccount.id, defenderAccount.id]));
    expect(cluster?.signals).toEqual(expect.arrayContaining(['shared-network', 'same-device', 'created-together']));
    expect(response.body).not.toContain(ip);
    expect(response.body).not.toContain('Mozilla/5.0');
  });
});
