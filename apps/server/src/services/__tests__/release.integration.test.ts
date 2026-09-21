import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';

/**
 * H release-candidate regression. Opt-in because it uses the local PostgreSQL
 * database. It creates one disposable account/player and deletes it afterwards.
 */
describe.runIf(process.env.RELEASE_INTEGRATION === '1')('0.1.0-H gameplay regression', () => {
  let app: FastifyInstance;
  let accountId: string | undefined;
  let roundId: string | undefined;
  let playerId: string;
  let publicPimpId: number;
  let cookie: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const name = `release_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    expect(registered.statusCode).toBe(201);
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');

    // Its own v0.1 round: this is the 0.1.0 regression, whatever the dev
    // database's current round has moved on to.
    const { RoundService } = await import('../round.service.js');
    const round = await app.prisma.round.create({ data: {
      name: 'Release integration fixture', slug: `release-test-${randomUUID()}`,
      rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    // /api/ready looks up the current round, which would close this older fixture as superseded.
    vi.spyOn(RoundService, 'getCurrent').mockResolvedValue(round);
    const city = await app.prisma.city.findUniqueOrThrow({
      where: { slug: classicOgV01.round.startingCitySlug },
    });

    publicPimpId = 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV01.round.startingPlayer,
        ...startingStock(classicOgV01),
        accountId: accountId!,
        roundId: round.id,
        cityId: city.id,
        publicPimpId,
        displayName: name,
        turns: 200,
        cashCents: 5_000_000n,
        whores: 10,
        thugs: 10,
        condoms: 1_000,
        beer: 1_000,
        crack: 1_000,
      },
    });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    if (app) await app.close();
  });

  const headers = () => ({ cookie });

  async function assertHealthyState() {
    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.cashCents >= 0n).toBe(true);
    expect(state.turns).toBeGreaterThanOrEqual(0);
    for (const value of [state.whores, state.thugs, state.condoms, state.medicine, state.crack, state.beer, state.pistols, state.shotguns, state.tek9s, state.ak47s, state.lowRiders]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(value)).toBe(true);
    }
  }

  it('passes liveness and readiness', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/ready' })).statusCode).toBe(200);
  });

  it('requires action ids on every mutable economy action', async () => {
    const requests = [
      { method: 'POST', url: '/api/game/scout', payload: { district: 'CASINO', turns: 1 } },
      { method: 'POST', url: '/api/game/produce-crack', payload: { turns: 1 } },
      { method: 'PUT', url: '/api/game/payout', payload: { percent: 55 } },
    ] as const;

    for (const request of requests) {
      const response = await app.inject({ ...request, headers: headers() });
      expect(response.statusCode).toBe(400);
    }
  });

  it('runs the 0.1.0 gameplay loop without corrupting state', async () => {
    const actions = [
      { method: 'POST', url: '/api/game/scout', payload: { district: 'CASINO', turns: 1, actionId: randomUUID() } },
      { method: 'POST', url: '/api/game/produce-crack', payload: { turns: 1, actionId: randomUUID() } },
      { method: 'PUT', url: '/api/game/payout', payload: { percent: 55, actionId: randomUUID() } },
      { method: 'POST', url: '/api/game/stores/trade', payload: { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 10, actionId: randomUUID() } },
    ] as const;

    for (const action of actions) {
      const response = await app.inject({ ...action, headers: headers() });
      expect(response.statusCode).toBe(200);
      await assertHealthyState();
    }
  });

  it('binds one idempotency key to one action', async () => {
    const actionId = randomUUID();
    const scout = await app.inject({
      method: 'POST', url: '/api/game/scout', headers: headers(),
      payload: { district: 'CASINO', turns: 1, actionId },
    });
    expect(scout.statusCode).toBe(200);
    const turnsAfterScout = scout.json().after.turns;

    const wrongReuse = await app.inject({
      method: 'POST', url: '/api/game/produce-crack', headers: headers(),
      payload: { turns: 1, actionId },
    });
    expect(wrongReuse.statusCode).toBe(409);
    expect(wrongReuse.json().error.code).toBe('ACTION_ID_REUSED');

    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.turns).toBe(turnsAfterScout);
  });

  it('keeps the public website API guest-readable and free of private player state', async () => {
    for (const url of ['/api/public/overview', '/api/public/current-game']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, response.body).toBe(200);

      const body = response.json();
      const keys = new Set<string>();
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!value || typeof value !== 'object') return;
        for (const [key, nested] of Object.entries(value)) {
          keys.add(key);
          visit(nested);
        }
      };
      visit(body);

      for (const privateField of [
        'cashCents',
        'whores',
        'thugs',
        'woundedThugs',
        'crack',
        'beer',
        'pistols',
        'shotguns',
        'tek9s',
        'ak47s',
        'raidProtectedUntil',
        'combatIntel',
      ]) {
        expect(keys.has(privateField)).toBe(false);
      }
    }

    const overview = (await app.inject({ method: 'GET', url: '/api/public/overview' })).json();
    expect(overview.currentGame).not.toBeNull();
    expect(overview.currentGame.stats.players).toBeGreaterThanOrEqual(1);
    expect(overview.currentGame.topRankings.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the E community/read endpoints usable', async () => {
    for (const url of [
      '/api/game/me?background=1',
      '/api/game/rankings',
      `/api/game/players/${publicPimpId}`,
      '/api/game/activity?limit=20',
      '/api/rounds/current/status',
      '/api/rounds/current/news',
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: headers() });
      expect(response.statusCode).toBe(200);
    }
  });
});
