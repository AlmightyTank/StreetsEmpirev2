import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV07D } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';

/**
 * New quest/contact system through the real HTTP layer.
 *
 * Opt in with REPUTATION_INTEGRATION=1. The name of the flag is retained so
 * existing local/CI commands keep working while the legacy favor system is retired.
 */
describe.runIf(process.env.REPUTATION_INTEGRATION === '1')('handcrafted quest API with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId: string | undefined;
  let playerId: string;
  let cookie: string;
  let roundId: string | undefined;

  const rules = classicOgV07D;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const name = 'quest_' + randomUUID().slice(0, 8);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    expect(registered.statusCode).toBe(201);
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => entry.name + '=' + entry.value).join('; ');

    const { RoundService } = await import('../round.service.js');
    const round = await app.prisma.round.create({ data: {
      name: 'Quest integration fixture',
      slug: 'quest-test-' + randomUUID(),
      rulesetId: rules.meta.id,
      rulesetVersion: rules.meta.version,
      status: 'ACTIVE',
      startsAt: new Date('2000-01-01'),
      endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);

    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        accountId: accountId!,
        roundId: round.id,
        cityId: city.id,
        publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
        displayName: name,
        cashCents: 5_000_000n,
        turns: 100,
        whores: 10,
        thugs: 10,
        condoms: 1_000,
        beer: 500,
        crack: 500,
        pistols: 10,
        lastTurnCalculationAt: new Date(),
      },
    });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });
  const post = (url: string, payload: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url, headers: { cookie }, payload });

  it('starts with First Night Out available and later jobs locked', async () => {
    const response = await get('/api/game/quests');
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();

    expect(body.contacts).toHaveLength(6);
    expect(body.quests).toHaveLength(10);
    expect(body.quests.find((quest: { key: string }) => quest.key === 'FIRST_NIGHT_OUT').status).toBe('AVAILABLE');
    expect(body.quests.find((quest: { key: string }) => quest.key === 'FRESH_FACES').status).toBe('LOCKED');
  });

  it('retires the legacy favor and manual weapon-unlock routes', async () => {
    expect((await get('/api/game/reputation')).statusCode).toBe(404);
    expect((await post('/api/game/reputation/quest', { trader: 'TOMMY', actionId: randomUUID() })).statusCode).toBe(404);
    expect((await post('/api/game/stores/unlock', { weapon: 'SHOTGUN', actionId: randomUUID() })).statusCode).toBe(404);
  });

  it('accepts, progresses and claims First Night Out through normal Scout play', async () => {
    const accepted = await post('/api/game/quests/FIRST_NIGHT_OUT/accept', { actionId: randomUUID() });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().quests.find((quest: { key: string }) => quest.key === 'FIRST_NIGHT_OUT').status).toBe('ACTIVE');

    const scout = await post('/api/game/scout', {
      district: 'WINO_SLUMS',
      turns: 12,
      actionId: randomUUID(),
    });
    expect(scout.statusCode, scout.body).toBe(200);

    const afterScout = (await get('/api/game/quests')).json();
    const ready = afterScout.quests.find((quest: { key: string }) => quest.key === 'FIRST_NIGHT_OUT');
    expect(ready.status).toBe('READY_TO_TURN_IN');

    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const claimActionId = randomUUID();
    const first = await post('/api/game/quests/FIRST_NIGHT_OUT/claim', { actionId: claimActionId });
    const replay = await post('/api/game/quests/FIRST_NIGHT_OUT/claim', { actionId: claimActionId });
    expect(first.statusCode, first.body).toBe(200);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(after.cashCents - before.cashCents).toBe(250000n);
    expect(after.condoms - before.condoms).toBe(25);
    expect(after.beer - before.beer).toBe(10);

    const mama = await app.prisma.playerReputation.findUniqueOrThrow({
      where: { roundPlayerId_trader: { roundPlayerId: playerId, trader: 'MAMA_KING' } },
    });
    expect(mama.points).toBe(5);

    const page = (await get('/api/game/quests')).json();
    expect(page.quests.find((quest: { key: string }) => quest.key === 'FIRST_NIGHT_OUT').status).toBe('COMPLETED');
    expect(page.quests.find((quest: { key: string }) => quest.key === 'FRESH_FACES').status).toBe('AVAILABLE');
  });

  it('does not expose legacy favor cards in store payloads', async () => {
    const response = await get('/api/game/stores');
    expect(response.statusCode, response.body).toBe(200);
    for (const store of response.json().stores) {
      expect(store.quest).toBeUndefined();
    }
  });
});
