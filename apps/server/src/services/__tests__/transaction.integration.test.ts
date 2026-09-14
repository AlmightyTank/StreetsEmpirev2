import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

/**
 * 0.1.0-F transaction/reconnect coverage.
 *
 * Opt in against the local dev database with TRANSACTION_INTEGRATION=1.
 * The fixture owns one disposable account and deletes it afterwards.
 */
describe.runIf(process.env.TRANSACTION_INTEGRATION === '1')(
  'action transactions with PostgreSQL',
  () => {
    let app: FastifyInstance;
    let accountId: string | undefined;
    let roundId: string | undefined;
    let playerId: string;
    let cookie: string;

    beforeAll(async () => {
      const { buildApp } = await import('../../app.js');
      app = await buildApp();

      const name = `tx_${randomUUID().slice(0, 8)}`;
      const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: name,
          email: `${name}@example.invalid`,
          password: randomUUID(),
        },
      });
      expect(registered.statusCode).toBe(201);
      accountId = registered.json().account.id;
      cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');

      // Its own v0.1 round, so the dev database's current ruleset cannot
      // change what these transactions do.
      const { RoundService } = await import('../round.service.js');
      const round = await app.prisma.round.create({ data: {
        name: 'Transaction integration fixture', slug: `tx-test-${randomUUID()}`,
        rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      } });
      roundId = round.id;
      vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
      const city = await app.prisma.city.findUniqueOrThrow({
        where: { slug: classicOgV01.round.startingCitySlug },
      });

      const player = await app.prisma.roundPlayer.create({
        data: {
          ...classicOgV01.round.startingPlayer,
          accountId: accountId!,
          roundId: round.id,
          cityId: city.id,
          publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
          displayName: name,
          turns: 200,
          cashCents: 10_000_000n,
          whores: 20,
          thugs: 20,
          condoms: 10_000,
          beer: 1_000,
          crack: 10_000,
          lastTurnCalculationAt: new Date(),
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

    function post(url: string, payload: Record<string, unknown>) {
      return app.inject({ method: 'POST', url, headers: { cookie }, payload });
    }

    function put(url: string, payload: Record<string, unknown>) {
      return app.inject({ method: 'PUT', url, headers: { cookie }, payload });
    }

    async function reset(overrides: Record<string, unknown> = {}) {
      return app.prisma.roundPlayer.update({
        where: { id: playerId },
        data: {
          turns: 200,
          cashCents: 10_000_000n,
          whores: 20,
          thugs: 20,
          condoms: 10_000,
          beer: 1_000,
          crack: 10_000,
          payoutPercent: 50,
          lastTurnCalculationAt: new Date(),
          lastActiveAt: new Date(),
          ...overrides,
        },
      });
    }

    it('replays a simultaneous duplicate scout exactly once', async () => {
      await reset();
      const actionId = randomUUID();
      const beforeActivity = await app.prisma.playerActivity.count({
        where: { roundPlayerId: playerId, type: 'SCOUT' },
      });

      const call = () => post('/api/game/scout', { district: 'CASINO', turns: 5, actionId });
      const responses = await Promise.all([call(), call()]);

      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(responses[0]!.json()).toEqual(responses[1]!.json());
      expect(await app.prisma.processedAction.count({ where: { roundPlayerId: playerId, actionId } })).toBe(1);
      expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'SCOUT' } })).toBe(beforeActivity + 1);
      expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).turns)
        .toBe(responses[0]!.json().after.turns);
    });

    it('replays a simultaneous duplicate cook exactly once', async () => {
      await reset();
      const actionId = randomUUID();
      const beforeActivity = await app.prisma.playerActivity.count({
        where: { roundPlayerId: playerId, type: 'PRODUCE_CRACK' },
      });

      const call = () => post('/api/game/produce-crack', { turns: 5, actionId });
      const responses = await Promise.all([call(), call()]);

      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(responses[0]!.json()).toEqual(responses[1]!.json());
      expect(await app.prisma.processedAction.count({ where: { roundPlayerId: playerId, actionId } })).toBe(1);
      expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'PRODUCE_CRACK' } })).toBe(beforeActivity + 1);
    });

    it('replays a payout change exactly once', async () => {
      await reset({ payoutPercent: 50 });
      const actionId = randomUUID();
      const beforeActivity = await app.prisma.playerActivity.count({
        where: { roundPlayerId: playerId, type: 'PAYOUT_CHANGE' },
      });

      const call = () => put('/api/game/payout', { percent: 60, actionId });
      const responses = await Promise.all([call(), call()]);

      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(responses[0]!.json()).toEqual(responses[1]!.json());
      expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).payoutPercent).toBe(60);
      expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'PAYOUT_CHANGE' } })).toBe(beforeActivity + 1);
    });

    it('serializes distinct simultaneous spends so turns never go negative', async () => {
      await reset({ turns: 1 });

      const responses = await Promise.all([
        post('/api/game/scout', { district: 'CASINO', turns: 1, actionId: randomUUID() }),
        post('/api/game/scout', { district: 'CASINO', turns: 1, actionId: randomUUID() }),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 400]);
      expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).turns).toBe(0);
    });

    it('rolls a rejected action back without an activity or replay record', async () => {
      await reset({ turns: 0 });
      const actionId = randomUUID();
      const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
      const beforeActivity = await app.prisma.playerActivity.count({
        where: { roundPlayerId: playerId, type: 'SCOUT' },
      });

      const response = await post('/api/game/scout', {
        district: 'CASINO',
        turns: 1,
        actionId,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('NOT_ENOUGH_TURNS');
      expect(await app.prisma.processedAction.count({ where: { roundPlayerId: playerId, actionId } })).toBe(0);
      expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'SCOUT' } })).toBe(beforeActivity);

      const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
      expect(after.turns).toBe(before.turns);
      expect(after.cashCents).toBe(before.cashCents);
      expect(after.condoms).toBe(before.condoms);
      expect(after.crack).toBe(before.crack);
      expect(after.beer).toBe(before.beer);
    });
  },
);
